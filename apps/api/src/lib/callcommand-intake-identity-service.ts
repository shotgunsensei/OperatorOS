import {createHash} from 'node:crypto';
import {sql} from 'drizzle-orm';
import {db} from '../db.js';
import {appendMspCallEvent,consumeMspRateLimit} from './callcommand-msp-service.js';
import {supportLinkLookupHmac,isValidSupportLinkId} from './callcommand-msp.js';
import {storeEncryptedSecretReference} from './shared-secret-vault.js';
import {attemptIntakeCode,codeReceiptId,identityRevision,INTAKE_SUPPORTLINK_PURPOSE,intakeSupportLinkHmac,
  issueIntakeSupportLinkId,publicIdentityResult,safeContactEmail,type IntakeIdentityState,type PrivateDirectoryMatch} from './callcommand-intake-identity.js';

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type Row=Record<string,any>;
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const unavailable=()=>Object.assign(new Error('Support intake is unavailable.'),{code:'SUPPORT_INTAKE_IDENTITY_UNAVAILABLE',statusCode:409});

async function directoryMatch(tx:Tx,tenantId:string,selector:{linkId:string}|{digits:string}):Promise<PrivateDirectoryMatch|null>{
  const digits='digits' in selector?selector.digits:null;
  if(digits?.length===10&&!isValidSupportLinkId(digits))return null;
  const hmac=digits?(digits.length===10?supportLinkLookupHmac(digits):intakeSupportLinkHmac(tenantId,digits)):null;
  const purpose=digits?(digits.length===10?'callcommand.support-link-id':INTAKE_SUPPORTLINK_PURPOSE):null;
  const result=await tx.execute(sql`
    SELECT link.id,link.organization_id,contact.first_name,contact.last_name,contact.email,organization.name AS company
    FROM callcommand_support_links link
    JOIN shared_secret_references secret ON secret.tenant_id=link.tenant_id AND secret.id=link.secret_reference_id AND secret.revoked_at IS NULL
    JOIN callcommand_contact_profiles profile ON profile.tenant_id=link.tenant_id AND profile.organization_id=link.organization_id
      AND profile.contact_id=link.contact_id AND profile.status='ACTIVE' AND profile.support_eligible=TRUE
    JOIN directory_contacts contact ON contact.tenant_id=link.tenant_id AND contact.id=link.contact_id AND contact.status='active' AND contact.archived_at IS NULL
    JOIN directory_organizations organization ON organization.tenant_id=link.tenant_id AND organization.id=link.organization_id AND organization.status='active' AND organization.archived_at IS NULL
    JOIN callcommand_organization_profiles organization_profile ON organization_profile.tenant_id=link.tenant_id AND organization_profile.organization_id=link.organization_id
      AND organization_profile.status IN ('ACTIVE','PILOT') AND organization_profile.support_contract_status='ACTIVE'
    WHERE link.tenant_id=${tenantId} AND link.status='ACTIVE' AND link.revoked_at IS NULL
      AND (link.expires_at IS NULL OR link.expires_at>NOW()) AND (link.locked_until IS NULL OR link.locked_until<=NOW())
      AND secret.purpose IN ('callcommand.support-link-id',${INTAKE_SUPPORTLINK_PURPOSE})
      AND (${hmac}::text IS NULL OR link.lookup_hmac=${hmac})
      AND (${purpose}::text IS NULL OR secret.purpose=${purpose})
      AND (${'linkId' in selector?selector.linkId:null}::text IS NULL OR link.id=${'linkId' in selector?selector.linkId:null}) LIMIT 2
  `);
  if(result.rows.length!==1)return null;
  const row=result.rows[0] as Row;
  const fields={linkId:String(row.id),organizationId:String(row.organization_id),firstName:String(row.first_name??''),lastName:String(row.last_name??''),email:String(row.email??''),company:String(row.company??'')};
  if(!fields.firstName||!fields.lastName||!fields.company||!safeContactEmail(fields.email)
    ||[fields.firstName,fields.lastName,fields.company].some(value=>value.length>200||/[\r\n\u0000-\u001f]/.test(value)))return null;
  return {...fields,revision:identityRevision(fields)};
}

/** Private result stays on the server; callers/model receive publicIdentityResult only. */
export async function loadIntakeIdentity(tx:Tx,authority:Row):Promise<{state:IntakeIdentityState;match:PrivateDirectoryMatch|null;context:Row}>{
  const loaded=await tx.execute(sql`SELECT * FROM callcommand_msp_call_contexts WHERE tenant_id=${authority.tenant_id}
    AND call_id=${authority.id} AND provider_call_id=${authority.provider_call_sid} FOR UPDATE`);
  const context=loaded.rows[0] as Row|undefined;
  if(!context||context.assurance_level!=='A0'||context.organization_id||context.contact_id)throw unavailable();
  const events=await tx.execute(sql`SELECT event_type,evidence FROM callcommand_msp_call_events WHERE tenant_id=${authority.tenant_id}
    AND call_context_id=${context.id} AND event_type IN ('intake.code.failed','intake.code.resolved','intake.code.skipped','intake.code.unavailable') ORDER BY sequence DESC LIMIT 8`);
  const latest=events.rows[0] as Row|undefined;
  const failures=Math.min(2,Math.max(0,Number(context.support_link_attempts??0)));
  const state:IntakeIdentityState={failures,mode:latest?.event_type==='intake.code.resolved'?'code_resolved'
    : failures>=2||['intake.code.skipped','intake.code.unavailable'].includes(String(latest?.event_type))?'manual':'offer',
    receipts:events.rows.map(row=>String((row as Row).evidence?.receiptId??'')).filter(value=>/^[a-f0-9]{64}$/.test(value))};
  if(state.mode!=='code_resolved')return {state,match:null,context};
  const linkId=String(latest?.evidence?.linkId??'');
  const match=await directoryMatch(tx,String(authority.tenant_id),{linkId});
  if(match){state.linkId=match.linkId;return {state,match,context};}
  await appendMspCallEvent({tenantId:String(authority.tenant_id),callContextId:String(context.id),eventType:'intake.code.unavailable',actorType:'SYSTEM',outcome:'MANUAL_INTAKE_REQUIRED',evidence:{assurance:'A0'}},tx);
  return {state:{...state,mode:'manual'},match:null,context};
}

export async function resolveIntakeIdentity(tx:Tx,authority:Row,toolCallId:string,args:Row){
  const current=await loadIntakeIdentity(tx,authority);
  const result=await attemptIntakeCode({state:current.state,toolCallId,raw:args.number,skip:args.skip===true},{
    allowed:async()=>{
      const limit=await consumeMspRateLimit({tenantId:String(authority.tenant_id),scope:'VOICE_INTAKE_CODE_LINE',
        subjectHmac:sha(`${authority.tenant_id}:${authority.phone_fingerprint}`),limit:5,windowSeconds:900,blockSeconds:900},tx);
      return limit.allowed;
    },
    lookup:async digits=>{
      const hmac=digits.length===10?supportLinkLookupHmac(digits):intakeSupportLinkHmac(String(authority.tenant_id),digits);
      const limit=await consumeMspRateLimit({tenantId:String(authority.tenant_id),scope:'VOICE_INTAKE_CODE_ID',subjectHmac:hmac,limit:5,windowSeconds:900,blockSeconds:900},tx);
      return limit.allowed?directoryMatch(tx,String(authority.tenant_id),{digits}):null;
    },
  });
  if(result.event){
    await tx.execute(sql`UPDATE callcommand_msp_call_contexts SET support_link_attempts=${result.state.failures},updated_at=NOW()
      WHERE tenant_id=${authority.tenant_id} AND id=${current.context.id}`);
    await appendMspCallEvent({tenantId:String(authority.tenant_id),callContextId:String(current.context.id),
      eventType:`intake.code.${result.event}`,actorType:'CALLER',outcome:result.event==='resolved'?'EMAIL_DIRECTORY_MATCH_ONLY':'MANUAL_FALLBACK_AVAILABLE',
      evidence:{receiptId:codeReceiptId(toolCallId),failures:result.state.failures,assurance:'A0',...(result.match?{linkId:result.match.linkId}:{})}},tx);
  }
  // Never return names, email, company, raw code, HMAC, internal IDs or failure reasons to the model.
  return publicIdentityResult(result.state);
}

export async function issueEmailIntakeSupportLink(input:{tenantId:string;organizationId:string;contactId:string;moduleId:string;actorUserId:string;expiresInDays:number}){
  if(process.env.CALLCOMMAND_INTAKE_SUPPORTLINK_ISSUANCE_ENABLED!=='true')throw Object.assign(new Error('Eight-digit intake-code issuance requires activation review.'),{code:'INTAKE_CODE_ISSUANCE_DISABLED',statusCode:409});
  for(let attempt=0;attempt<5;attempt++){
    const raw=issueIntakeSupportLinkId();
    try{return await db.transaction(async tx=>{
      const eligible=await tx.execute(sql`SELECT profile.id FROM callcommand_contact_profiles profile
        JOIN directory_contacts contact ON contact.tenant_id=profile.tenant_id AND contact.id=profile.contact_id AND contact.status='active' AND contact.archived_at IS NULL
        JOIN directory_organizations organization ON organization.tenant_id=profile.tenant_id AND organization.id=profile.organization_id AND organization.status='active' AND organization.archived_at IS NULL
        WHERE profile.tenant_id=${input.tenantId} AND profile.organization_id=${input.organizationId} AND profile.contact_id=${input.contactId}
          AND profile.status='ACTIVE' AND profile.support_eligible=TRUE FOR UPDATE OF profile`);
      if(!eligible.rows[0])throw unavailable();
      const previous=await tx.execute(sql`SELECT link.id,link.secret_reference_id,secret.purpose FROM callcommand_support_links link
        JOIN shared_secret_references secret ON secret.tenant_id=link.tenant_id AND secret.id=link.secret_reference_id
        WHERE link.tenant_id=${input.tenantId} AND link.contact_id=${input.contactId} AND link.revoked_at IS NULL FOR UPDATE OF link`);
      const prior=previous.rows[0] as Row|undefined;
      if(prior&&prior.purpose!==INTAKE_SUPPORTLINK_PURPOSE)throw Object.assign(new Error('Existing ten-digit association SupportLink is preserved. Use it or review an explicit replacement separately.'),{code:'LEGACY_SUPPORT_LINK_PRESERVED',statusCode:409});
      const secret=await storeEncryptedSecretReference({tenantId:input.tenantId,moduleId:input.moduleId,purpose:INTAKE_SUPPORTLINK_PURPOSE,reference:raw,actorUserId:input.actorUserId,rotatedFromId:prior?.secret_reference_id??null},tx);
      if(prior){
        await tx.execute(sql`UPDATE callcommand_support_links SET status='REPLACED',revoked_at=NOW(),revoke_reason='INTAKE_CODE_ROTATED',updated_at=NOW() WHERE tenant_id=${input.tenantId} AND id=${prior.id}`);
        await tx.execute(sql`UPDATE shared_secret_references SET revoked_at=COALESCE(revoked_at,NOW()) WHERE tenant_id=${input.tenantId} AND id=${prior.secret_reference_id}`);
      }
      const created=await tx.execute(sql`INSERT INTO callcommand_support_links(tenant_id,organization_id,contact_id,secret_reference_id,lookup_hmac,last4,status,issued_at,activated_at,expires_at,issued_by_user_id)
        VALUES(${input.tenantId},${input.organizationId},${input.contactId},${secret.id},${intakeSupportLinkHmac(input.tenantId,raw)},${raw.slice(-4)},'ACTIVE',NOW(),NOW(),NOW()+make_interval(days=>${input.expiresInDays}),${input.actorUserId})
        RETURNING id,organization_id,contact_id,last4,status,issued_at,activated_at,expires_at`);
      if(prior)await tx.execute(sql`UPDATE callcommand_support_links SET replaced_by_id=${created.rows[0].id} WHERE tenant_id=${input.tenantId} AND id=${prior.id}`);
      return {row:created.rows[0],raw};
    });}catch(error){if((error as {code?:string}).code!=='23505'||attempt===4)throw error;}
  }
  throw unavailable();
}

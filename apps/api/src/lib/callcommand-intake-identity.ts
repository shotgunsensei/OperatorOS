import {createHash,createHmac,randomInt} from 'node:crypto';
import {supportLinkLookupHmac} from './callcommand-msp.js';

export const INTAKE_SUPPORTLINK_PURPOSE='callcommand.support-link-intake-id';
export const INTENDED_BMS_MAILBOX='support@xodus-is.com';
export const MAX_CODE_FAILURES=2;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WORDS:Record<string,string>={zero:'0',oh:'0',one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9'};
export type IntakeIdentityState={failures:number;mode:'offer'|'manual'|'code_resolved';linkId?:string;receipts:string[]};
export type PrivateDirectoryMatch={linkId:string;organizationId:string;firstName:string;lastName:string;email:string;company:string;revision:string};
export function issueIntakeSupportLinkId():string{return Array.from({length:8},()=>String(randomInt(0,10))).join('');}
export function normalizeSpokenIntakeCode(raw:unknown):string|null {
  if(typeof raw!=='string'||raw.length>100)return null;
  const tokens=raw.trim().toLowerCase().split(/[\s,-]+/);
  if(!tokens.length||tokens.some(token=>!/^\d+$/.test(token)&&!(token in WORDS)))return null;
  const code=tokens.map(token=>WORDS[token]??token).join('');
  return /^(?:\d{6,8}|\d{10})$/.test(code)?code:null;
}
export function intakeSupportLinkHmac(tenantId:string,code:string):string {
  // Reuse the existing protected association-index key, with tenant/format separation.
  return createHmac('sha256',supportLinkLookupHmac('intake-index-v1'))
    .update(`intake-support-link-v1:${tenantId}:${code}`).digest('hex');
}
export function identityRevision(match:Omit<PrivateDirectoryMatch,'revision'>):string {
  return createHash('sha256').update(JSON.stringify(match)).digest('hex');
}
export function codeReceiptId(toolCallId:string):string{return createHash('sha256').update(toolCallId).digest('hex');}
export function publicIdentityResult(state:IntakeIdentityState) {
  return {ok:true,providerActionConfirmed:false,codeResolved:state.mode==='code_resolved',manualIntake:state.mode==='manual',
    attemptsRemaining:state.mode==='offer'?Math.max(0,MAX_CODE_FAILURES-state.failures):0,
    instruction:state.mode==='code_resolved'
      ? 'Directory details are resolved privately for email only. Do not ask for or read back stored personal details. Collect callback if offered, general issue and impact.'
      : state.mode==='manual'
        ? 'Continue with unverified first name, last name, company and follow-up contact, then incident details. Do not ask for or look up another code.'
        : 'That number could not be used. Caller may try once more or skip it and provide unverified name, company and contact details.',
    authenticated:false,customerAccess:false};
}
/** The same engine is used under the durable call-context lock; no failure reason escapes. */
export async function attemptIntakeCode(input:{state:IntakeIdentityState;toolCallId:string;raw:unknown;skip:boolean},ports:{
  allowed:()=>Promise<boolean>;lookup:(code:string)=>Promise<PrivateDirectoryMatch|null>;
}):Promise<{state:IntakeIdentityState;match:PrivateDirectoryMatch|null;event:'skip'|'resolved'|'failed'|null}> {
  const prior=input.state;const receipt=codeReceiptId(input.toolCallId);
  if(prior.mode==='code_resolved'&&input.skip&&!prior.receipts.includes(receipt)){
    return {state:{failures:prior.failures,mode:'manual',receipts:[...prior.receipts,receipt].slice(-3)},match:null,event:'skip'};
  }
  if(prior.mode!=='offer'||prior.failures>=MAX_CODE_FAILURES||prior.receipts.includes(receipt)){
    return {state:prior.failures>=MAX_CODE_FAILURES&&prior.mode==='offer'?{...prior,mode:'manual'}:prior,match:null,event:null};
  }
  const receipts=[...prior.receipts,receipt].slice(-3);
  if(input.skip)return {state:{...prior,mode:'manual',receipts},match:null,event:'skip'};
  const allowed=await ports.allowed();const code=normalizeSpokenIntakeCode(input.raw);
  const match=allowed&&code?await ports.lookup(code):null;
  if(match)return {state:{failures:prior.failures,mode:'code_resolved',linkId:match.linkId,receipts},match,event:'resolved'};
  const failures=Math.min(MAX_CODE_FAILURES,prior.failures+1);
  return {state:{failures,mode:failures>=MAX_CODE_FAILURES||!allowed?'manual':'offer',receipts},match:null,event:'failed'};
}

export const FIRST_CONTACT_FIELDS={firstName:100,lastName:100,company:160,contactEmail:254,callbackPhone:16,issue:500,impact:240} as const;
export type FirstContactField=keyof typeof FIRST_CONTACT_FIELDS;
export type FirstContactSnapshot={version:1;fields:Record<FirstContactField,string>;declinedFields:FirstContactField[];identitySource:'manual'|'code_resolved';identityRevision:string;revision:string;status:'awaiting_confirmation'|'confirmed'};
const plain=(value:unknown):value is Record<string,unknown>=>Boolean(value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value)));
function invalid():never{throw Object.assign(new Error('Please review the requested intake details.'),{code:'FIRST_CONTACT_DETAILS_INVALID',statusCode:400});}
export function safeContactEmail(value:string):boolean{return value.length<=254&&/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value);}
export function saveFirstContactSnapshot(value:unknown,previous:FirstContactSnapshot|null,identity:{source:'manual'|'code_resolved';revision:string}):FirstContactSnapshot {
  if(!plain(value)||Object.keys(value).some(key=>!['fields','declinedFields','callerConfirmed','confirmationRevision'].includes(key))||!plain(value.fields)||typeof value.callerConfirmed!=='boolean')invalid();
  const keys=Object.keys(FIRST_CONTACT_FIELDS) as FirstContactField[];
  if(Object.keys(value.fields).some(key=>!keys.includes(key as FirstContactField)))invalid();
  const declined=value.declinedFields;
  if(!Array.isArray(declined)||declined.length>7||new Set(declined).size!==declined.length||declined.some(key=>!keys.includes(key)))invalid();
  const fields={} as FirstContactSnapshot['fields'];
  for(const key of keys){
    const raw=value.fields[key];if(typeof raw!=='string'||raw.length>FIRST_CONTACT_FIELDS[key]||/[\u0000-\u001f\u007f]/.test(raw))invalid();
    const text=raw.trim().replace(/\s+/g,' ');const hidden=identity.source==='code_resolved'&&['firstName','lastName','company','contactEmail'].includes(key);
    if(hidden ? Boolean(text) : declined.includes(key) ? Boolean(text) : !text)invalid();
    if(key==='contactEmail'&&text&&!safeContactEmail(text))invalid();
    if(key==='callbackPhone'&&text&&!/^\+[1-9][0-9]{7,14}$/.test(text))invalid();
    if(/\b(?:password|passcode|one[- ]time code|otp|pin)\s*[:=]\s*\S/i.test(text))invalid();
    if(/\bsupport\s*link\b.{0,15}(?:\d[ -]*){6,10}/i.test(text))invalid();
    fields[key]=text;
  }
  const data={version:1 as const,fields,declinedFields:keys.filter(key=>declined.includes(key)),identitySource:identity.source,identityRevision:identity.revision};
  const revision=createHash('sha256').update(JSON.stringify(data)).digest('hex');
  if(value.callerConfirmed&&(!previous||previous.revision!==revision||value.confirmationRevision!==revision))invalid();
  return {...data,revision,status:value.callerConfirmed?'confirmed':'awaiting_confirmation'};
}
export function readFirstContactSnapshot(value:unknown):FirstContactSnapshot|null {
  if(!plain(value)||!plain(value._operatorosFirstContactV1))return null;
  const candidate=value._operatorosFirstContactV1;
  if(!['manual','code_resolved'].includes(String(candidate.identitySource))||typeof candidate.identityRevision!=='string')return null;
  try{
    const checked=saveFirstContactSnapshot({fields:candidate.fields,declinedFields:candidate.declinedFields,callerConfirmed:false},null,
      {source:candidate.identitySource as FirstContactSnapshot['identitySource'],revision:candidate.identityRevision});
    if(checked.revision!==candidate.revision||!['awaiting_confirmation','confirmed'].includes(String(candidate.status)))return null;
    return {...checked,status:candidate.status as FirstContactSnapshot['status']};
  }catch{return null;}
}
export function publicFirstContactReadback(snapshot:FirstContactSnapshot) {
  const {fields}=snapshot;
  return snapshot.identitySource==='code_resolved'?{callbackPhone:fields.callbackPhone,issue:fields.issue,impact:fields.impact}:fields;
}
/** Deployment mapping is exact tenant+Directory-organization, never caller text or inferred company initials. */
export function configuredIntakeTag(tenantId:string,organizationId:string,env:Record<string,string|undefined>=process.env):string|null {
  try{
    const mapping:unknown=JSON.parse(env.CALLCOMMAND_INTAKE_ROUTING_TAGS??'[]');
    if(!Array.isArray(mapping)||mapping.length>200||mapping.some(row=>!plain(row)||Object.keys(row).sort().join(',')!=='organizationId,tag,tenantId'
      ||!UUID.test(String(row.tenantId))||!UUID.test(String(row.organizationId))||!/^((?!UNVERIFIED$)[A-Z][A-Z0-9]{1,11})$/.test(String(row.tag))))return null;
    const matches=mapping.filter(row=>row.tenantId===tenantId&&row.organizationId===organizationId);
    return matches.length===1&&mapping.filter(row=>row.tenantId===tenantId&&row.tag===matches[0].tag).length===1?matches[0].tag:null;
  }catch{return null;}
}
function untrustedLine(value:string):string{return value.replace(/\[CLIENT:[^\]]*\]|#[^#\r\n]{1,120}#/gi,'[caller-provided marker removed]').replace(/[\r\n\u0000-\u001f\u007f]/g,' ').slice(0,700);}
export function formatBmsIntakeEmail(input:{tenantId:string;callId:string;createdAt:string;snapshot:FirstContactSnapshot;match:PrivateDirectoryMatch|null;env?:Record<string,string|undefined>}) {
  if(!UUID.test(input.callId)||!Number.isFinite(Date.parse(input.createdAt)))invalid();
  if(input.snapshot.status!=='confirmed'||input.snapshot.identitySource==='code_resolved'&&(!input.match||input.snapshot.identityRevision!==input.match.revision))invalid();
  if(input.snapshot.identitySource==='manual'&&input.match)invalid();
  const tag=input.match?configuredIntakeTag(input.tenantId,input.match.organizationId,input.env):null;
  const f=input.snapshot.fields;
  const body=[`CallCommandAI intake request - ${input.callId}`,`Received: ${new Date(input.createdAt).toISOString()}`,
    input.match?'Identity source: SupportLink directory match for email only; caller NOT authenticated.':'Identity source: caller-claimed / UNVERIFIED; manual association required.',
    `First name: ${untrustedLine(input.match?.firstName??f.firstName)||'Not provided'}`,
    `Last name: ${untrustedLine(input.match?.lastName??f.lastName)||'Not provided'}`,
    `Company: ${untrustedLine(input.match?.company??f.company)||'Not provided'}`,
    `Contact email: ${untrustedLine(input.match?.email??f.contactEmail)||'Not provided'}`,
    `Caller-reported callback: ${untrustedLine(f.callbackPhone)||'Not provided'}`,
    `Issue: ${untrustedLine(f.issue)||'Not provided'}`,`Impact: ${untrustedLine(f.impact)||'Not provided'}`,
    'Manual BMS triage required. The authenticated service sender is not the caller. Body fields/Reply-To do not establish BMS contact/account association.',
    'A local reference, email queue or provider acceptance does not confirm a BMS ticket. No BMS deduplication or workflow activation is assumed.'];
  return {destination:INTENDED_BMS_MAILBOX,subject:`[CallCommandAI][CLIENT:${tag??'UNVERIFIED'}] Intake ${input.callId}`,body:body.join('\n')};
}

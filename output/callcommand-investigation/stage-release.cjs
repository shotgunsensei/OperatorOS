const {execFileSync}=require('node:child_process');
const {readFileSync,writeFileSync}=require('node:fs');
const run=(args,input)=>execFileSync('git',['-c','gc.auto=0',...args],{input,encoding:'utf8'}).trimEnd();
const whole=[
'apps/api/src/lib/billing-service.ts','apps/api/src/lib/callcommand-lane-billing.ts',
'apps/api/src/lib/callcommand-number-billing.ts','apps/api/src/lib/callcommand-number-provider.ts',
'apps/api/src/lib/callcommand-realtime.ts','apps/api/src/lib/database-release-contract.ts','apps/api/src/lib/database-release.ts',
'apps/api/src/routes/callcommand-commercial-routes.ts','apps/api/src/routes/callcommand-realtime-routes.ts',
'apps/api/test/_setup.ts','apps/api/test/callcommand-commercial-security-contract.test.ts',
'apps/api/test/callcommand-number-provider.test.ts','apps/api/test/callcommand-phase35-lifecycle.test.ts',
'apps/api/test/callcommand-realtime.test.ts','apps/api/test/commerce-forward-model-static.test.ts',
'apps/api/test/database-release-contract.test.ts','apps/api/test/production-runtime-verifier.test.ts',
'apps/web/e2e/callcommand-commercial-contract.test.mjs','apps/web/src/components/module-shells/CallCommandCommercialWorkspace.tsx',
'apps/web/src/components/module-shells/CallCommandRoute.contract.ts','apps/web/src/lib/auth.ts',
'apps/api/src/lib/callcommand-setup-db-init.ts','apps/api/test/callcommand-guided-setup.test.ts',
'apps/web/e2e/callcommand-guided-setup.spec.ts','apps/web/src/components/module-shells/CallCommandSetup.tsx',
'apps/web/src/components/module-shells/CallCommandSetup.module.css',
'docs/callcommand/CALLCOMMAND_TENANT_SETUP_INVESTIGATION_2026-09-10.md'];
run(['add','--',...whole]);
function partial(path,transform){
 const base=execFileSync('git',['show',`HEAD:${path}`],{encoding:'utf8'}).replace(/\r\n/g,'\n');
 const current=readFileSync(path,'utf8').replace(/\r\n/g,'\n');
 const content=transform(base,current);
 if(content===base)throw Error(`No scoped change for ${path}`);
 const hash=run(['hash-object','-w','--stdin'],content);
 run(['update-index','--cacheinfo',`100644,${hash},${path}`]);
}
partial('apps/api/test/phase15-release-identity.test.ts',base=>base.replace("releaseVersion: 60,\n        stepCount: 60,\n        lastStep: 'forward_commerce_contract'","releaseVersion: 61,\n        stepCount: 61,\n        lastStep: 'callcommand_guided_setup'"));
partial('scripts/parity/run-browser-tests.mjs',base=>base.replace("      'e2e/twilio-compliance.spec.ts',","      'e2e/twilio-compliance.spec.ts',\n      'e2e/callcommand-guided-setup.spec.ts',"));
partial('apps/web/src/lib/help/companion-module-guides.ts',(base,current)=>{
 const line=current.split('\n').find(line=>line.includes("guidePage(call, 'call-setup'"));
 if(!line||base.includes("guidePage(call, 'call-setup'"))throw Error('Unexpected Help baseline');
 return base.replace(/(?=    guidePage\(call, 'call-calls')/,line+'\n');
});
for(const path of ['docs/IMPLEMENTATION_STATUS.md','docs/modules/MODULE_PARITY_INDEX.md'])partial(path,(base,current)=>{
 const end=current.indexOf('\n## Module clarity');
 if(end<0)throw Error('Missing pre-existing section');
 const titleEnd=base.indexOf('\n');
 return current.slice(0,end)+'\n'+base.slice(titleEnd+1);
});
writeFileSync('output/callcommand-investigation/staged-files.txt',run(['diff','--cached','--name-only'])+'\n');
console.log(run(['diff','--cached','--stat']));

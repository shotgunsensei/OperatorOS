import test from 'node:test';
import assert from 'node:assert/strict';
import { customerWorkspaceHref, customerWorkspaceResultLink, EMPTY_CUSTOMER_SELECTION, readCustomerWorkspaceSelection } from '../src/lib/customer-workspace-route.js';

const tenant='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const customer='11111111-1111-4111-8111-111111111111';
const site='22222222-2222-4222-8222-222222222222';
const contact='33333333-3333-4333-8333-333333333333';
const job='44444444-4444-4444-8444-444444444444';

test('navigation carries only qualified existing record IDs, with no customer facts or search text',()=>{
 const href=customerWorkspaceHref(tenant,{organizationId:customer,siteId:site,contactId:contact,jobId:job});
 const url=new URL(href,'https://example.invalid');
 assert.equal(url.pathname,'/app');
 assert.deepEqual([...url.searchParams.keys()],['page','cwTenant','cwCustomer','cwSite','cwContact','cwJob']);
 assert.deepEqual(readCustomerWorkspaceSelection(url.search,tenant),{selection:{organizationId:customer,siteId:site,contactId:contact,jobId:job},invalid:false});
});

test('a saved selection cannot select or switch to a different tenant',()=>{
 const href=customerWorkspaceHref(tenant,{...EMPTY_CUSTOMER_SELECTION,organizationId:customer});
 assert.deepEqual(readCustomerWorkspaceSelection(new URL(href,'https://example.invalid').search,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),{selection:EMPTY_CUSTOMER_SELECTION,invalid:true});
});

test('unqualified, duplicate, malformed and partial selection parameters fail closed',()=>{
 for(const search of [
  `?cwCustomer=${customer}`,
  `?cwTenant=${tenant}&cwCustomer=${customer}&cwCustomer=${customer}`,
  `?cwTenant=${tenant}&cwCustomer=${customer}&cwSite=not-an-id`,
  `?cwTenant=${tenant}&cwJob=${job}`,
  `?cwTenant=${tenant}&cwCustomer=//evil.invalid`,
  `?cwTenant=${tenant}&cwCustomer=${customer}&cwContact=`,
 ])assert.deepEqual(readCustomerWorkspaceSelection(search,tenant),{selection:EMPTY_CUSTOMER_SELECTION,invalid:true},search);
 assert.deepEqual(readCustomerWorkspaceSelection('?page=customer-workspace',tenant),{selection:EMPTY_CUSTOMER_SELECTION,invalid:false});
});

test('unsafe input cannot be converted into a navigation URL',()=>{
 assert.equal(customerWorkspaceHref(tenant,{...EMPTY_CUSTOMER_SELECTION,organizationId:'Customer name, not an ID'}),'/app?page=customer-workspace');
 assert.equal(customerWorkspaceHref(tenant,{organizationId:customer,siteId:'https://evil.invalid',contactId:null,jobId:null}),`/app?page=customer-workspace&cwTenant=${tenant}&cwCustomer=${customer}`);
});

test('only the existing UUID-bound SnapProof job/report destinations are opened',()=>{
 for(const kind of ['jobs','reports'])assert.equal(customerWorkspaceResultLink(`/modules/snapproofos/${kind}/${job}`),`/modules/snapproofos/${kind}/${job}`);
 for(const href of [`https://evil.invalid/modules/snapproofos/jobs/${job}`,`//evil.invalid/${job}`,`/modules/tradeflowkit/jobs/${job}`,`/modules/snapproofos/jobs/${job}?token=unexpected`,`/modules/snapproofos/jobs/${job}#fragment`,`/modules/snapproofos/jobs/%2e%2e`,`/modules/snapproofos/jobs/${job}/extra`,null])assert.equal(customerWorkspaceResultLink(href),null,String(href));
});

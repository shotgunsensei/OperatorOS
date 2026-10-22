import { after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import dns from 'node:dns';
import tls from 'node:tls';
import { syncBuiltinESMExports } from 'node:module';
const fetch=globalThis.fetch,connect=net.Socket.prototype.connect,lookup=dns.lookup,tlsConnect=tls.connect;
let attempts=0;
const deny=()=>{attempts++;throw new Error('PULSEDESK_TEST_EXTERNAL_NETWORK_FORBIDDEN');};
globalThis.fetch=deny;
net.Socket.prototype.connect=deny;
dns.lookup=Object.assign(deny,{__promisify__:deny});
tls.connect=deny;
syncBuiltinESMExports();
after(()=>{
  globalThis.fetch=fetch;net.Socket.prototype.connect=connect;dns.lookup=lookup;tls.connect=tlsConnect;syncBuiltinESMExports();
  assert.equal(attempts,0,'All provider/network behavior must use the explicit synthetic boundary');
});

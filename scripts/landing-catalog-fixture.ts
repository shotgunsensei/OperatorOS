/** Loopback-only public-page test fixture; no DB, credentials, checkout or enrollment. */
import http from 'node:http';
import { CORE_PRODUCTS, COMPANION_MODULES, FREE_WITH_ANY_ACCOUNT, COMPANION_MODULE_PRICE_CENTS, DEFAULT_ADDITIONAL_SEAT_PRICE_CENTS } from '../packages/sdk/src/products.js';
const catalog = { operatorOsMonthlyPriceCents:0, coreProducts:CORE_PRODUCTS, companionModules:COMPANION_MODULES,
  includedApps:FREE_WITH_ANY_ACCOUNT, billingInterval:'month', includedSeats:5, includedCompanionCount:1,
  companionModuleMonthlyPriceCents:COMPANION_MODULE_PRICE_CENTS, additionalSeatMonthlyPriceCents:DEFAULT_ADDITIONAL_SEAT_PRICE_CENTS,
  stripeConfigured:{tradeflowkit:false,pulsedesk:false,techdeck:false,companionModule:false,additionalSeat:false} };
let mode = 'ok';
const server = http.createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store');
  const url = new URL(request.url ?? '/', 'http://127.0.0.1:5101');
  if (url.pathname === '/__test/catalog-mode' && request.method === 'POST') {
    mode = url.searchParams.get('mode') ?? 'ok';
    response.end(JSON.stringify({mode}));
  } else if (url.pathname === '/v1/billing/catalog' && request.method === 'GET') {
    if (mode === 'failure') { response.statusCode = 503; response.end('{"error":"Catalog temporarily unavailable"}'); }
    else response.end(JSON.stringify(mode === 'malformed' ? {...catalog, coreProducts:[]} : catalog));
  } else {
    response.statusCode = url.pathname.startsWith('/v1/auth/') ? 401 : 404;
    response.end('{"error":"Anonymous public-page fixture"}');
  }
});
server.listen(5101, '127.0.0.1', () => console.log('Public catalog fixture listening on 127.0.0.1:5101'));

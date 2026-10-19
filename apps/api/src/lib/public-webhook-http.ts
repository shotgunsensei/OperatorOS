import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { request } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';

const ipv4 = new BlockList();
ipv4.addSubnet('0.0.0.0', 0, 'ipv4');
const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24],
  ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3],
] as const) blocked.addSubnet(address, prefix, 'ipv4');
const globalIpv6 = new BlockList();
globalIpv6.addSubnet('2000::', 3, 'ipv6');
for (const [address, prefix] of [
  ['2001::', 32], ['2001:2::', 48], ['2001:db8::', 32],
  ['2001:10::', 28], ['2001:20::', 28], ['2002::', 16], ['3fff::', 20],
] as const) blocked.addSubnet(address, prefix, 'ipv6');

/** BlockList also recognizes canonical and hexadecimal IPv4-mapped IPv6. */
export function isPublicWebhookAddress(address: string): boolean {
  const version = isIP(address);
  if (!version) return false;
  const family = version === 4 ? 'ipv4' : 'ipv6';
  if (blocked.check(address, family)) return false;
  return ipv4.check(address, family) || globalIpv6.check(address, family);
}

function unsafeAddress(): Error {
  return Object.assign(new Error('Webhook endpoint address is not public'), { code: 'WEBHOOK_SSRF_BLOCKED' });
}

function hostnameOf(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
}

export function validateOutboundWebhookUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch {
    throw Object.assign(new Error('Webhook endpoint URL is invalid'), { code: 'WEBHOOK_URL_INVALID' });
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443') {
    throw Object.assign(new Error('Webhook endpoints require credential-free HTTPS on the standard port'), { code: 'WEBHOOK_URL_UNSAFE' });
  }
  const hostname = hostnameOf(url);
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw unsafeAddress();
  }
  if (isIP(hostname) && !isPublicWebhookAddress(hostname)) throw unsafeAddress();
  return url;
}

export type WebhookDnsLookup = (hostname: string, options: { all: true; verbatim: true }) => Promise<LookupAddress[]>;
type Dependencies = { lookup: WebhookDnsLookup; request: typeof request };

/** Resolve once, then bind the HTTPS socket to that validated address set.
 * Keep the original URL for Host, SNI and normal TLS certificate validation.
 * A fresh agent prevents an unrelated pooled socket bypassing this lookup.
 */
export async function postPublicWebhook(
  endpoint: URL,
  input: { body: string; headers: Record<string, string>; signal?: AbortSignal },
  dependencies: Dependencies = { lookup, request },
): Promise<{ status: number }> {
  const url = validateOutboundWebhookUrl(endpoint.toString());
  const hostname = hostnameOf(url);
  const literalFamily = isIP(hostname);
  const deadline = AbortSignal.timeout(15_000);
  const signal = input.signal ? AbortSignal.any([deadline, input.signal]) : deadline;
  signal.throwIfAborted();
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await new Promise<LookupAddress[]>((resolve, reject) => {
      const onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
      void dependencies.lookup(hostname, { all: true, verbatim: true }).then(
        result => { signal.removeEventListener('abort', onAbort); resolve(result); },
        error => { signal.removeEventListener('abort', onAbort); reject(error); },
      );
    });
  if (!addresses.length || addresses.some(entry => !isPublicWebhookAddress(entry.address))) throw unsafeAddress();
  signal.throwIfAborted();
  const pinnedLookup: LookupFunction = (_host, options, callback) => {
    // The client can request all addresses for automatic family selection.
    // Neither form performs a second DNS lookup after validation.
    if (typeof options === 'object' && options.all) callback(null, addresses);
    else callback(null, addresses[0]!.address, addresses[0]!.family);
  };
  return new Promise((resolve, reject) => {
    const outgoing = dependencies.request(url, {
      method: 'POST', agent: false, lookup: pinnedLookup, signal,
      headers: { ...input.headers, 'content-length': String(Buffer.byteLength(input.body)) },
    }, response => {
      const status = response.statusCode ?? 502;
      // No redirects are followed and receiver-controlled response bodies
      // are never buffered or retained by the webhook worker.
      response.destroy();
      resolve({ status });
    });
    outgoing.once('upgrade', (response, socket) => {
      socket.destroy();
      resolve({ status: response.statusCode ?? 101 });
    });
    outgoing.once('error', reject);
    outgoing.once('close', () => reject(Object.assign(
      new Error('Webhook connection closed without a final response'), { code: 'WEBHOOK_RESPONSE_CLOSED' },
    )));
    outgoing.end(input.body);
  });
}

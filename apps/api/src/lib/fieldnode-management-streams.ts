import https, { type RequestOptions } from 'node:https';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import { createRequire } from 'node:module';
import WebSocket, { type RawData } from 'ws';
import { FieldNodeGatewayError, type FieldNodeTransportRequest } from './fieldnode-management-gateway.js';

export const FIELDNODE_RELAY_CHUNK_BYTES = 32768;
export const FIELDNODE_RELAY_QUEUE_FRAMES = 4;
export const FIELDNODE_RELAY_NODE_CHANNELS = 16;
export const FIELDNODE_AUTHORITY_RECHECK_MS = 3000;
const wsPackage: unknown = createRequire(import.meta.url)('ws/package.json');
const pinnedReceiverVersion = Boolean(wsPackage && typeof wsPackage === 'object' && 'version' in wsPackage && wsPackage.version === '8.21.3');
export interface FieldNodeStreamResponse {
  readonly statusCode: number;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly body: Readable;
}
type HttpsFactory = (url: URL, options: RequestOptions, callback: (response: IncomingMessage) => void) => ClientRequest;

/** Backpressure bounds the readable queue to four 32-KiB frames, not a whole download. */
export function fieldNodeChunkStream(source: Readable): Readable {
  return Readable.from((async function* () {
    try {
      for await (const value of source) {
        const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array);
        for (let offset = 0; offset < chunk.length; offset += FIELDNODE_RELAY_CHUNK_BYTES) {
          yield chunk.subarray(offset, offset + FIELDNODE_RELAY_CHUNK_BYTES);
        }
      }
    } finally { source.destroy(); }
  })(), { objectMode: true, highWaterMark: FIELDNODE_RELAY_QUEUE_FRAMES });
}

/** Only small error payloads are buffered; never buffer a successful download/SSE. */
export async function fieldNodeCollectError(body: Readable, limit = 65536, timeoutMs = 3000): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        for await (const chunk of body) {
          const value = Buffer.from(chunk as Uint8Array);
          bytes += value.length;
          if (bytes > limit) throw new FieldNodeGatewayError(502, 'FIELDNODE_UPSTREAM_INVALID');
          chunks.push(value);
        }
        return Buffer.concat(chunks).toString('utf8');
      })(),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { body.destroy(); reject(new FieldNodeGatewayError(503, 'FIELDNODE_UPSTREAM_UNAVAILABLE')); }, timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); body.destroy(); }
}

/** First headers have a hard deadline. The body remains cancellable for its whole lifetime. */
export function fieldNodeOpenStream(input: FieldNodeTransportRequest, factory: HttpsFactory = https.request): Promise<FieldNodeStreamResponse> {
  return new Promise((resolve, reject) => {
    let request: ClientRequest | undefined;
    let response: IncomingMessage | undefined;
    let completed = false;
    let headersReceived = false;
    const cleanup = () => {
      clearTimeout(timer);
      input.signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      if (completed) return;
      completed = true;
      cleanup();
      response?.destroy();
      request?.destroy();
      if (!headersReceived) reject(new FieldNodeGatewayError(503, 'FIELDNODE_UPSTREAM_UNAVAILABLE'));
    };
    const timer = setTimeout(abort, Math.min(input.timeoutMs, 120000));
    input.signal?.addEventListener('abort', abort, { once: true });
    if (input.signal?.aborted) { abort(); return; }
    try {
      request = factory(input.url, { method: input.method, headers: input.headers, rejectUnauthorized: true, maxHeaderSize: 16384 }, received => {
        response = received;
        if (completed) { received.destroy(); return; }
        headersReceived = true;
        clearTimeout(timer);
        received.once('close', () => { completed = true; cleanup(); });
        // Observe errors even if the caller rejects the response before piping it.
        received.on('error', () => {});
        resolve({ statusCode: received.statusCode ?? 502, headers: received.headers, body: fieldNodeChunkStream(received) });
      });
      request.on('error', () => abort());
      request.end(input.body);
    } catch { abort(); }
  });
}

export type FieldNodeSocketFactory = (url: URL, headers: Readonly<Record<string, string>>, timeoutMs: number) => WebSocket;
export const fieldNodeOpenSocket: FieldNodeSocketFactory = (url, headers, timeoutMs) => new WebSocket(url, {
  headers, rejectUnauthorized: true, followRedirects: false, maxPayload: 4096,
  perMessageDeflate: false, handshakeTimeout: Math.min(timeoutMs, 120000),
});

/** ws 8.21.3 has no public per-route receive limit after the shared upgrade.
 * Narrow only this receiver before attaching relay handlers; fail closed if
 * that pinned capability changes, rather than changing other modules' limits. */
export function fieldNodeLimitClientSocket(socket: WebSocket): boolean {
  if (!pinnedReceiverVersion) return false;
  const receiver: unknown = Reflect.get(socket, '_receiver');
  if (!receiver || typeof receiver !== 'object' || !Object.hasOwn(receiver, '_maxPayload')) return false;
  const previous: unknown = Reflect.get(receiver, '_maxPayload');
  if (typeof previous !== 'number' || !Number.isFinite(previous) || previous < 0) return false;
  try {
    const maximum = previous === 0 ? 4096 : Math.min(previous, 4096);
    return Reflect.set(receiver, '_maxPayload', maximum) && Reflect.get(receiver, '_maxPayload') === maximum;
  } catch { return false; }
}

/** A single serial text channel; no arbitrary WS endpoint, protocol or headers. */
export function fieldNodeRelaySerial(
  client: WebSocket, upstream: WebSocket, revalidate: () => Promise<boolean>,
  recheckMs = FIELDNODE_AUTHORITY_RECHECK_MS,
): () => void {
  let stopped = false;
  let checking = false;
  const pending: string[] = [];
  const close = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    pending.length = 0;
    for (const socket of [client, upstream]) {
      if (socket.readyState === WebSocket.OPEN) socket.close(1008, 'FieldNode authority or channel ended');
      else if (socket.readyState === WebSocket.CONNECTING) socket.terminate();
    }
  };
  const send = (socket: WebSocket, text: string) => {
    if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount + Buffer.byteLength(text) > 4 * 4096) { close(); return; }
    socket.send(text, { binary: false }, error => { if (error) close(); });
  };
  const text = (data: RawData, binary: boolean): string | null => {
    const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
    return binary || bytes.length > 4096 ? null : bytes.toString('utf8');
  };
  client.on('message', (data, binary) => {
    if (stopped) return;
    const value = text(data, binary);
    if (value === null) { close(); return; }
    if (upstream.readyState === WebSocket.CONNECTING) {
      if (pending.length >= FIELDNODE_RELAY_QUEUE_FRAMES) close();
      else pending.push(value);
    } else send(upstream, value);
  });
  upstream.on('open', () => { if (!stopped) for (const value of pending.splice(0)) send(upstream, value); });
  upstream.on('message', (data, binary) => {
    if (stopped) return;
    const value = text(data, binary);
    if (value === null) close(); else send(client, value);
  });
  upstream.on('upgrade', response => { if (response.headers['set-cookie']) close(); });
  for (const socket of [client, upstream]) { socket.on('close', close); socket.on('error', close); }
  const timer = setInterval(() => {
    if (checking || stopped) return;
    checking = true;
    void revalidate().then(valid => { if (!valid) close(); }, close).finally(() => { checking = false; });
  }, Math.min(recheckMs, FIELDNODE_AUTHORITY_RECHECK_MS));
  return close;
}

import { connect, isIP } from 'node:net';
import { isOperatorOSDeterministicProviderTestEnvironment } from './shared-service-safety.js';
import type { AttachmentScanner } from './shared-attachments.js';

function privateAddress(host: string): boolean {
  if (host === '127.0.0.1' || host === '::1') return true;
  if (isIP(host) !== 4) return false;
  const [first, second] = host.split('.').map(Number);
  return first === 10 || (first === 172 && second! >= 16 && second! <= 31) || (first === 192 && second === 168);
}

export function clamAvConfiguration(env: NodeJS.ProcessEnv = process.env) {
  // Test/runtime harnesses must never connect to an inherited live scanner.
  if (isOperatorOSDeterministicProviderTestEnvironment(env) || env.ATTACHMENT_SCANNER !== 'clamav') return null;
  const host = env.ATTACHMENT_CLAMAV_HOST?.trim() ?? '';
  const port = Number(env.ATTACHMENT_CLAMAV_PORT || 3310);
  const timeoutMs = Number(env.ATTACHMENT_CLAMAV_TIMEOUT_MS || 15_000);
  if (!privateAddress(host) || !Number.isInteger(port) || port < 1 || port > 65535
    || !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60_000) return null;
  return { host, port, timeoutMs };
}

function scanFailure() {
  return Object.assign(new Error('The file safety check could not finish. The file remains blocked.'), { code: 'ATTACHMENT_SCANNER_UNAVAILABLE' });
}

/** INSTREAM sends bytes only, never file paths or commands from customer input. */
export function createClamAvScanner(config: { host: string; port: number; timeoutMs: number }): AttachmentScanner {
  return {
    name: 'clamav', configured: true,
    async scan({ content }) {
      if (content.length === 0 || content.length > 25 * 1024 * 1024) throw scanFailure();
      return new Promise<'clean' | 'infected'>((resolve, reject) => {
        let settled = false;
        let sent = false;
        let response = Buffer.alloc(0);
        const socket = connect({ host: config.host, port: config.port });
        const timer = setTimeout(() => finish(), config.timeoutMs);
        function finish(result?: 'clean' | 'infected') {
          if (settled) return;
          settled = true; clearTimeout(timer); socket.destroy();
          if (result) resolve(result); else reject(scanFailure());
        }
        socket.on('error', () => finish());
        socket.on('end', () => {
          if (!sent) return finish();
          const result = response.toString('utf8');
          if (result === 'stream: OK\0') return finish('clean');
          if (/^stream: [^\u0000\r\n]+ FOUND\0$/.test(result)) return finish('infected');
          finish();
        });
        socket.on('close', () => { if (!settled) finish(); });
        socket.on('data', chunk => {
          if (response.length + chunk.length > 1024) return finish();
          response = Buffer.concat([response, chunk]);
        });
        socket.once('connect', () => {
          const write = (bytes: Buffer) => new Promise<void>((done, fail) => {
            socket.write(bytes, error => error ? fail(error) : done());
          });
          void (async () => {
            await write(Buffer.from('zINSTREAM\0'));
            for (let offset = 0; offset < content.length; offset += 64 * 1024) {
              if (settled) return;
              const chunk = content.subarray(offset, offset + 64 * 1024);
              const length = Buffer.alloc(4); length.writeUInt32BE(chunk.length);
              await write(Buffer.concat([length, chunk]));
            }
            await write(Buffer.alloc(4));
            sent = true;
          })().catch(() => finish());
        });
      });
    },
  };
}

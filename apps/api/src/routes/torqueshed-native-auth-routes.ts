import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireTenantMember, requireTenantModuleAccess } from '../lib/tenant-auth.js';
import { authenticate } from '../lib/auth.js';
import {
  createTorqueShedNativeAuthorization,
  exchangeTorqueShedNativeCode,
  refreshTorqueShedNativeSession,
  revokeTorqueShedNativeAccessToken,
  TORQUESHED_NATIVE_REDIRECT_URI,
  TorqueShedNativeAuthError,
} from '../lib/torqueshed-native-auth.js';

const authorizeGuards = [requireTenantMember, requireTenantModuleAccess('torqueshed')];

function body(request: FastifyRequest): Record<string, unknown> {
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
    throw new TorqueShedNativeAuthError('A JSON object is required', 'NATIVE_BODY_INVALID');
  }
  return request.body as Record<string, unknown>;
}

function text(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
  pattern?: RegExp,
): string {
  if (typeof value !== 'string') throw new TorqueShedNativeAuthError(`${field} is required`, 'NATIVE_INPUT_INVALID');
  const clean = value.trim();
  if (clean.length < minimum || clean.length > maximum || (pattern && !pattern.test(clean))) {
    throw new TorqueShedNativeAuthError(`${field} is invalid`, 'NATIVE_INPUT_INVALID');
  }
  return clean;
}

function handle(reply: FastifyReply, error: unknown): boolean {
  if (!(error instanceof TorqueShedNativeAuthError)) return false;
  reply.code(error.statusCode).send({ error: error.message, code: error.code });
  return true;
}

export async function registerTorqueShedNativeAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/v1/modules/torqueshed/native/authorize',
    { preHandler: authorizeGuards },
    async (request, reply) => {
      try {
        const input = body(request);
        const user = (request as any).user as { id: string };
        const context = (request as any).tenantContext as { tenantId: string };
        return await createTorqueShedNativeAuthorization({
          userId: user.id,
          tenantId: context.tenantId,
          state: text(input.state, 'state', 32, 160, /^[A-Za-z0-9_-]+$/),
          nonce: text(input.nonce, 'nonce', 32, 160, /^[A-Za-z0-9_-]+$/),
          codeChallenge: text(input.codeChallenge, 'codeChallenge', 43, 43, /^[A-Za-z0-9_-]+$/),
          redirectUri: text(input.redirectUri, 'redirectUri', 1, 200),
          deviceId: text(input.deviceId, 'deviceId', 24, 160, /^[A-Za-z0-9_-]+$/),
          deviceName: text(input.deviceName, 'deviceName', 1, 120),
        });
      } catch (error) {
        if (!handle(reply, error)) throw error;
      }
    },
  );

  app.post('/v1/public/torqueshed/native/exchange', async (request, reply) => {
    try {
      const input = body(request);
      return await exchangeTorqueShedNativeCode({
        code: text(input.code, 'code', 40, 100, /^tsn_c_[A-Za-z0-9_-]+$/),
        state: text(input.state, 'state', 32, 160, /^[A-Za-z0-9_-]+$/),
        nonce: text(input.nonce, 'nonce', 32, 160, /^[A-Za-z0-9_-]+$/),
        codeVerifier: text(input.codeVerifier, 'codeVerifier', 43, 128, /^[A-Za-z0-9._~-]+$/),
        deviceId: text(input.deviceId, 'deviceId', 24, 160, /^[A-Za-z0-9_-]+$/),
      });
    } catch (error) {
      if (!handle(reply, error)) throw error;
    }
  });

  app.post('/v1/public/torqueshed/native/refresh', async (request, reply) => {
    try {
      const input = body(request);
      return await refreshTorqueShedNativeSession({
        refreshToken: text(input.refreshToken, 'refreshToken', 40, 100, /^tsn_r_[A-Za-z0-9_-]+$/),
        deviceId: text(input.deviceId, 'deviceId', 24, 160, /^[A-Za-z0-9_-]+$/),
      });
    } catch (error) {
      if (!handle(reply, error)) throw error;
    }
  });

  app.post('/v1/modules/torqueshed/native/logout', { preHandler: authenticate }, async (request, reply) => {
    const auth = request.headers.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : '';
    await revokeTorqueShedNativeAccessToken(token);
    return reply.code(204).send();
  });

  app.get('/v1/public/torqueshed/native/config', async () => ({
    module: 'torqueshed',
    redirectUri: TORQUESHED_NATIVE_REDIRECT_URI,
    pkceMethod: 'S256',
    accessTokenType: 'opaque',
  }));
}

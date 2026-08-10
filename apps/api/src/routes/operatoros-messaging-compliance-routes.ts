import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  OPERATOROS_PRIVACY_VERSION,
  OPERATOROS_SMS_DISCLOSURE,
  OPERATOROS_SMS_DISCLOSURE_LANGUAGE,
  OPERATOROS_SMS_DISCLOSURE_VERSION,
  OPERATOROS_SMS_PROGRAM_NAME,
  OPERATOROS_TERMS_VERSION,
  OperatorOsMessagingInputError,
  recordOperatorOsSmsWebConsent,
} from '../lib/operatoros-messaging-compliance.js';

function securePublicReply(reply: FastifyReply): void {
  reply.header('Cache-Control', 'no-store');
  reply.header('Pragma', 'no-cache');
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('Referrer-Policy', 'no-referrer');
}

export async function registerOperatorOsMessagingComplianceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/public/operatoros/sms-consent', async (_request, reply) => {
    securePublicReply(reply);
    return {
      program: OPERATOROS_SMS_PROGRAM_NAME,
      consentCategory: 'service',
      disclosure: OPERATOROS_SMS_DISCLOSURE,
      disclosureVersion: OPERATOROS_SMS_DISCLOSURE_VERSION,
      disclosureLanguage: OPERATOROS_SMS_DISCLOSURE_LANGUAGE,
      privacyPolicyVersion: OPERATOROS_PRIVACY_VERSION,
      termsVersion: OPERATOROS_TERMS_VERSION,
      initialOptInMechanism: 'public_web_form',
    };
  });

  app.post('/v1/public/operatoros/sms-consent', async (request, reply) => {
    securePublicReply(reply);
    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return reply.code(400).send({ error: 'Submission was not accepted.', code: 'SMS_CONSENT_BODY_INVALID' });
    }
    try {
      const result = await recordOperatorOsSmsWebConsent({
        phoneNumber: (body as Record<string, unknown>).phoneNumber,
        smsConsent: (body as Record<string, unknown>).smsConsent,
        website: (body as Record<string, unknown>).website,
        clientAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });
      const reference = `SMS-${result.id.slice(0, 8).toUpperCase()}`;
      return reply.code(result.duplicate ? 200 : 201).send({
        accepted: true,
        duplicate: result.duplicate,
        status: result.status,
        reference,
      });
    } catch (error) {
      if (error instanceof OperatorOsMessagingInputError) {
        const status = error.code === 'SMS_CONSENT_RATE_LIMITED' ? 429 : 422;
        return reply.code(status).send({ error: error.message, code: error.code, field: error.field });
      }
      throw error;
    }
  });
}

import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware";
import { WebhookHandlers } from "./webhookHandlers";
import { grantEntitlementFromCheckout, recordPurchase, revokeEntitlement } from "./lib/grantEntitlement";
import { handleStripeEvent } from "./lib/stripeEventHandler";
import router from "./routes";
import ssoRouter from "./routes/sso";
import { logger } from "./lib/logger";
import { assertSsoConfigOrExit } from "./lib/ssoConfig";

assertSsoConfigOrExit();

const app: Express = express();

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res): Promise<void> => {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      res.status(400).json({ error: 'Missing stripe-signature' });
      return;
    }

    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;

      if (!Buffer.isBuffer(req.body)) {
        req.log.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer.');
        res.status(500).json({ error: 'Webhook processing error' });
        return;
      }

      await WebhookHandlers.processWebhook(req.body as Buffer, sig);

      const event = JSON.parse((req.body as Buffer).toString('utf8'));
      try {
        await handleStripeEvent(event, {
          grantEntitlement: grantEntitlementFromCheckout,
          recordPurchase,
          revokeEntitlement,
          logger: req.log,
        });
      } catch (fulfillErr: any) {
        req.log.error({ err: fulfillErr }, 'Webhook fulfillment error');
        res.status(500).json({ error: 'Fulfillment failed; will retry' });
        return;
      }

      res.status(200).json({ received: true });
    } catch (error: any) {
      req.log.error({ err: error }, 'Webhook error');
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

const allowedOrigins = [
  process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : '',
  process.env.REPLIT_DEPLOYMENT_URL ? `https://${process.env.REPLIT_DEPLOYMENT_URL}` : '',
  'http://localhost:5173',
].filter(Boolean);

app.use(cors({
  credentials: true,
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.some(allowed => origin.startsWith(allowed))) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(clerkMiddleware());

// OperatorOS SSO landing endpoint. Mounted at the root (NOT under `/api`)
// because OperatorOS sends users to `<app_origin>/sso?token=...`. The
// artifact.toml routes both `/sso` and `/api` to this server.
app.use("/", ssoRouter);

app.use("/api", router);

export default app;

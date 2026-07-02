import type { Express } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "../db";
import { getSessionSecret } from "../env";

import authRouter from "./auth";
import orgsRouter from "./orgs";
import ticketsRouter from "./tickets";
import departmentsRouter from "./departments";
import assetsRouter from "./assets";
import supplyRequestsRouter from "./supplyRequests";
import facilityRequestsRouter from "./facilityRequests";
import vendorsRouter from "./vendors";
import analyticsRouter from "./analytics";
import adminRouter from "./admin";
import notificationsRouter from "./notifications";
import onboardingRouter from "./onboarding";
import emailRouter from "./email";
import connectorsRouter from "./connectors";
import ssoRouter from "./sso";
import healthRouter from "./health";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    orgId?: string;
    authSource?: string;
    entraTenantId?: string;
    entraState?: string;
    entraNonce?: string;
    entraOrgId?: string;
    connectorOAuthState?: string;
    connectorOAuthId?: string;
    connectorOAuthProvider?: string;
    operatorOsUserId?: string;
    operatorOsTenantId?: string;
    operatorOsModuleSlug?: string;
    operatorOsEntitlementSnapshotId?: string;
    adminSupportOrgId?: string;
    adminSupportStartedAt?: string;
  }
}

const PgSession = connectPgSimple(session);

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  const isProduction = process.env.NODE_ENV === "production";

  const sessionStore = new PgSession({
    pool: pool as any,
    tableName: "session",
    createTableIfMissing: true,
    errorLog: (err: Error) => {
      console.error("[session-store error]", err.message, err.stack);
    },
  });

  console.log(`[session] Store initialized: table=session, secure=${isProduction}, sameSite=lax, maxAge=30d`);

  app.use(
    session({
      store: sessionStore,
      secret: getSessionSecret(),
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
      },
    })
  );

  app.use(healthRouter);
  app.use(authRouter);
  app.use(orgsRouter);
  app.use(ticketsRouter);
  app.use(departmentsRouter);
  app.use(assetsRouter);
  app.use(supplyRequestsRouter);
  app.use(facilityRequestsRouter);
  app.use(vendorsRouter);
  app.use(analyticsRouter);
  app.use(adminRouter);
  app.use(notificationsRouter);
  app.use(onboardingRouter);
  app.use(emailRouter);
  app.use(connectorsRouter);
  app.use(ssoRouter);

  return httpServer;
}

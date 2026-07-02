import type { Express, Request, Response } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import QRCode from "qrcode";
import {
  registerUser,
  authenticateUser,
  getUser,
  generateTOTPSecret,
  verifyTOTPToken,
  generateRecoveryCodes,
  enableMfa,
  disableMfa,
  useRecoveryCode,
  verifyPassword,
} from "./authService";
import { isAuthenticated } from "./middleware";
import { enforceHttps } from "./httpsEnforce";
import { csrfProtection, registerCsrfRoutes } from "./csrf";
import { sendAuthError } from "./errorPage";

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function isLocalAuthEnabled(): boolean {
  return !isProduction() && process.env.TECHDECK_ENABLE_LOCAL_AUTH === "true";
}

function operatorOsAuthUrl(): string {
  if (process.env.OPERATOROS_AUTH_URL) return process.env.OPERATOROS_AUTH_URL.replace(/\/$/, "");
  const base = (process.env.OPERATOROS_BASE_URL || "https://operatoros.net").replace(/\/$/, "");
  return `${base}/login`;
}

function sendOperatorOsManagedAuth(req: Request, res: Response, action: string) {
  res.setHeader("Location", operatorOsAuthUrl());
  return sendAuthError(
    req,
    res,
    410,
    "managed_by_operatoros",
    `${action} is managed by OperatorOS. Launch TechDeck from OperatorOS SSO.`,
  );
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    sendAuthError(req, res, 429, "rate_limited", "Too many attempts. Please try again later.");
  },
});

export function registerAuthRoutes(app: Express): void {
  app.use("/api/auth", enforceHttps);

  registerCsrfRoutes(app);

  app.post("/api/auth/register", authLimiter, csrfProtection, async (req: Request, res: Response) => {
    try {
      if (!isLocalAuthEnabled()) {
        return sendOperatorOsManagedAuth(req, res, "Registration");
      }

      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendAuthError(
          req,
          res,
          400,
          "invalid_input",
          parsed.error.issues[0]?.message || "Invalid input",
        );
      }

      const result = await registerUser(parsed.data);

      req.session.regenerate((err) => {
        if (err) {
          console.error("[auth] Session regeneration error:", err);
          return sendAuthError(req, res, 500, "registration_failed", "Registration failed");
        }
        req.session.userId = result.id;
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("[auth] Session save error:", saveErr);
            return sendAuthError(req, res, 500, "registration_failed", "Registration failed");
          }
          res.status(201).json({ success: true, userId: result.id });
        });
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Registration failed";
      if (message.includes("already exists")) {
        return sendAuthError(req, res, 409, "email_exists", message);
      }
      console.error("[auth] Registration error:", error);
      sendAuthError(req, res, 500, "registration_failed", "Registration failed");
    }
  });

  app.post("/api/auth/login", authLimiter, csrfProtection, async (req: Request, res: Response) => {
    try {
      if (!isLocalAuthEnabled()) {
        return sendOperatorOsManagedAuth(req, res, "Password login");
      }

      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendAuthError(req, res, 400, "invalid_input", "Invalid input");
      }

      const { user, requiresMfa } = await authenticateUser(
        parsed.data.email,
        parsed.data.password
      );

      req.session.regenerate((err) => {
        if (err) {
          console.error("[auth] Session regeneration error:", err);
          return sendAuthError(req, res, 500, "server_error", "Login failed");
        }

        req.session.userId = user.id;

        if (requiresMfa) {
          req.session.mfaPending = true;
          req.session.save(() => res.json({ requiresMfa: true }));
        } else {
          req.session.mfaPending = false;
          req.session.save(() => res.json({ success: true }));
        }
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Invalid credentials";
      if (message.toLowerCase().includes("locked")) {
        return sendAuthError(req, res, 423, "account_locked", message);
      }
      sendAuthError(req, res, 401, "invalid_credentials", message);
    }
  });

  app.post("/api/auth/mfa/validate", authLimiter, csrfProtection, async (req: Request, res: Response) => {
    try {
      if (!isLocalAuthEnabled()) {
        return sendOperatorOsManagedAuth(req, res, "MFA verification");
      }

      const userId = req.session?.userId;
      if (!userId || !req.session?.mfaPending) {
        return sendAuthError(req, res, 401, "mfa_session_missing", "No pending MFA session");
      }

      const { code } = req.body;
      if (!code || typeof code !== "string") {
        return sendAuthError(req, res, 400, "mfa_code_required", "MFA code is required");
      }

      const user = await getUser(userId);
      if (!user || !user.mfaSecret) {
        return sendAuthError(req, res, 401, "mfa_session_missing", "Invalid session");
      }

      const isValid = verifyTOTPToken(code, user.mfaSecret);

      if (!isValid) {
        const recoveryUsed = await useRecoveryCode(userId, code);
        if (!recoveryUsed) {
          return sendAuthError(req, res, 401, "mfa_code_invalid", "Invalid MFA code");
        }
      }

      req.session.mfaPending = false;
      req.session.save(() => res.json({ success: true }));
    } catch (error) {
      console.error("[auth] MFA validation error:", error);
      sendAuthError(req, res, 500, "server_error", "MFA validation failed");
    }
  });

  app.post("/api/auth/logout", csrfProtection, (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("[auth] Logout error:", err);
        return sendAuthError(req, res, 500, "logout_failed", "Logout failed");
      }
      res.clearCookie("connect.sid");
      res.json({ success: true });
    });
  });

  app.get("/api/auth/user", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      const user = await getUser(userId!);
      if (!user) {
        return sendAuthError(req, res, 404, "user_not_found", "User not found");
      }
      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
        isSystemAdmin: user.isSystemAdmin,
        mfaEnabled: user.mfaEnabled,
        createdAt: user.createdAt,
      });
    } catch (error) {
      console.error("[auth] Fetch user error:", error);
      sendAuthError(req, res, 500, "server_error", "Failed to fetch user");
    }
  });

  app.post("/api/auth/mfa/setup", isAuthenticated, csrfProtection, async (req: Request, res: Response) => {
    try {
      if (!isLocalAuthEnabled()) {
        return sendOperatorOsManagedAuth(req, res, "MFA setup");
      }

      const userId = req.session.userId!;
      const user = await getUser(userId);
      if (!user) {
        return sendAuthError(req, res, 404, "user_not_found", "User not found");
      }

      if (user.mfaEnabled) {
        return sendAuthError(req, res, 400, "invalid_input", "MFA is already enabled");
      }

      const { secret, otpauthUrl } = generateTOTPSecret(user.email || "user");
      const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

      req.session.pendingMfaSecret = secret;

      req.session.save(() => {
        res.json({
          secret,
          qrCode: qrCodeDataUrl,
        });
      });
    } catch (error) {
      console.error("[auth] MFA setup error:", error);
      sendAuthError(req, res, 500, "server_error", "MFA setup failed");
    }
  });

  app.post("/api/auth/mfa/verify", isAuthenticated, csrfProtection, async (req: Request, res: Response) => {
    try {
      if (!isLocalAuthEnabled()) {
        return sendOperatorOsManagedAuth(req, res, "MFA verification");
      }

      const userId = req.session.userId!;
      const pendingSecret = req.session.pendingMfaSecret;

      if (!pendingSecret) {
        return sendAuthError(req, res, 400, "mfa_setup_missing", "No MFA setup in progress. Start setup first.");
      }

      const { code } = req.body;
      if (!code || typeof code !== "string") {
        return sendAuthError(req, res, 400, "mfa_code_required", "Verification code is required");
      }

      const isValid = verifyTOTPToken(code, pendingSecret);
      if (!isValid) {
        return sendAuthError(req, res, 400, "mfa_code_invalid", "Invalid verification code. Please try again.");
      }

      const recoveryCodes = generateRecoveryCodes();
      await enableMfa(userId, pendingSecret, recoveryCodes);

      delete req.session.pendingMfaSecret;

      req.session.save(() => {
        res.json({
          success: true,
          recoveryCodes,
        });
      });
    } catch (error) {
      console.error("[auth] MFA verify error:", error);
      sendAuthError(req, res, 500, "server_error", "MFA verification failed");
    }
  });

  app.post("/api/auth/mfa/disable", isAuthenticated, csrfProtection, async (req: Request, res: Response) => {
    try {
      if (!isLocalAuthEnabled()) {
        return sendOperatorOsManagedAuth(req, res, "MFA changes");
      }

      const userId = req.session.userId!;
      const { password } = req.body;

      if (!password) {
        return sendAuthError(req, res, 400, "password_required", "Password is required to disable MFA");
      }

      const user = await getUser(userId);
      if (!user || !user.passwordHash) {
        return sendAuthError(req, res, 400, "invalid_input", "Invalid request");
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        return sendAuthError(req, res, 401, "password_invalid", "Invalid password");
      }

      await disableMfa(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("[auth] MFA disable error:", error);
      sendAuthError(req, res, 500, "mfa_disable_failed", "Failed to disable MFA");
    }
  });

  app.post("/api/auth/change-password", isAuthenticated, authLimiter, csrfProtection, async (req: Request, res: Response) => {
    try {
      if (!isLocalAuthEnabled()) {
        return sendOperatorOsManagedAuth(req, res, "Password changes");
      }

      const userId = req.session.userId!;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return sendAuthError(req, res, 400, "password_required", "Current and new password are required");
      }

      if (newPassword.length < 8) {
        return sendAuthError(req, res, 400, "password_too_short", "New password must be at least 8 characters");
      }

      const user = await getUser(userId);
      if (!user || !user.passwordHash) {
        return sendAuthError(req, res, 400, "invalid_input", "Invalid request");
      }

      const valid = await verifyPassword(currentPassword, user.passwordHash);
      if (!valid) {
        return sendAuthError(req, res, 401, "password_invalid", "Current password is incorrect");
      }

      const { hashPassword } = await import("./authService");
      const newHash = await hashPassword(newPassword);
      const { db } = await import("../db");
      const { users } = await import("@shared/models/auth");
      const { eq } = await import("drizzle-orm");
      await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, userId));

      res.json({ success: true });
    } catch (error) {
      console.error("[auth] Password change error:", error);
      sendAuthError(req, res, 500, "password_change_failed", "Failed to change password");
    }
  });

  app.get("/api/auth/admin-check", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const user = await getUser(userId);
      res.json({ isSystemAdmin: user?.isSystemAdmin === true });
    } catch {
      res.json({ isSystemAdmin: false });
    }
  });
}

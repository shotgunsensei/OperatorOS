import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (_env) return _env;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.errors.map((e) => `  ${e.path.join(".")}: ${e.message}`).join("\n");
    throw new Error(`Environment validation failed:\n${errors}`);
  }
  const env = result.data;
  if (env.NODE_ENV === "production" && !env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET must be set in production");
  }
  _env = env;
  return _env;
}

export function getSessionSecret(): string {
  const env = getEnv();
  return env.SESSION_SECRET || "pulsedesk-dev-secret-change-me-in-production";
}

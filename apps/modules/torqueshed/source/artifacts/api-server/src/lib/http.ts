import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { TorqueShedUser } from "@workspace/db";
import { currentUser } from "../routes/auth";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function asyncRoute(
  handler: (request: Request, response: Response) => Promise<unknown>,
): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}

export async function requireUser(request: Request): Promise<TorqueShedUser> {
  const user = await currentUser(request);
  if (!user) throw new HttpError(401, "authentication_required", "OperatorOS sign-in is required.");
  return user;
}

export function installErrorHandler() {
  return (
    error: unknown,
    _request: Request,
    response: Response,
    _next: NextFunction,
  ) => {
    if (error instanceof HttpError) {
      return response.status(error.status).json({ code: error.code, error: error.message });
    }
    response.log?.error({ err: error }, "request_failed");
    return response.status(500).json({ code: "internal_error", error: "The request could not be completed." });
  };
}

export function stringValue(
  value: unknown,
  field: string,
  options: { min?: number; max?: number; optional?: boolean } = {},
): string | null {
  if (value == null && options.optional) return null;
  if (typeof value !== "string") throw new HttpError(400, "invalid_request", `${field} must be text.`);
  const normalized = value.trim();
  const min = options.min ?? 1;
  const max = options.max ?? 5_000;
  if (normalized.length < min || normalized.length > max) {
    throw new HttpError(400, "invalid_request", `${field} must be between ${min} and ${max} characters.`);
  }
  return normalized;
}

export function numberValue(
  value: unknown,
  field: string,
  options: { min?: number; max?: number; optional?: boolean; integer?: boolean } = {},
): number | null {
  if ((value == null || value === "") && options.optional) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || (options.integer !== false && !Number.isInteger(parsed))) {
    throw new HttpError(400, "invalid_request", `${field} must be a valid number.`);
  }
  if (options.min != null && parsed < options.min) throw new HttpError(400, "invalid_request", `${field} is too small.`);
  if (options.max != null && parsed > options.max) throw new HttpError(400, "invalid_request", `${field} is too large.`);
  return parsed;
}

export function recordValue(value: unknown, field: string): Record<string, unknown> {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "invalid_request", `${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

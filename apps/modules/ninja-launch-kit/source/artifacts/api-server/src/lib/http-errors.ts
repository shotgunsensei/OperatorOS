import type { Response } from "express";
import type { ZodError } from "zod";

export type FieldError = { field: string; message: string };

/**
 * Convert a Zod error into a sanitized client-safe payload.
 * Avoids leaking schema internals or stack details.
 */
export function zodErrorPayload(err: ZodError): { error: string; fields: FieldError[] } {
  const fields: FieldError[] = err.issues.map((i) => ({
    field: i.path.length ? i.path.join(".") : "(root)",
    message: i.message,
  }));
  return { error: "Validation failed", fields };
}

export function sendValidationError(res: Response, err: ZodError): void {
  res.status(400).json(zodErrorPayload(err));
}

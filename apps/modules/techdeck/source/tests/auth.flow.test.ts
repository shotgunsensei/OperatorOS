import { describe, it, expect } from "vitest";
import { z } from "zod";

/**
 * Lightweight contract test for the auth registration payload schema.
 * Full end-to-end auth tests should run against a dedicated test DB; this is the scaffold.
 */
const registerPayload = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

describe("auth schema contract", () => {
  it("rejects short password", () => {
    const result = registerPayload.safeParse({ email: "a@b.com", password: "short", name: "A" });
    expect(result.success).toBe(false);
  });

  it("accepts valid payload", () => {
    const result = registerPayload.safeParse({ email: "a@b.com", password: "longenough", name: "A" });
    expect(result.success).toBe(true);
  });
});

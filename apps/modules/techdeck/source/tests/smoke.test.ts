import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("vitest is wired", () => {
    expect(1 + 1).toBe(2);
  });

  it("env has NODE_ENV", () => {
    expect(typeof process.env.NODE_ENV).toBe("string");
  });
});

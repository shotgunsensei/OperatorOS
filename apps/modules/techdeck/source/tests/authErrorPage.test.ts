import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { sendAuthError, renderAuthErrorPage, wantsHtml } from "../server/auth/errorPage";

function buildApp() {
  const app = express();
  app.get("/boom", (req, res) => {
    sendAuthError(req, res, 401, "invalid_credentials", "Bad creds");
  });
  app.get("/rate", (req, res) => {
    sendAuthError(req, res, 429, "rate_limited", "Too many attempts");
  });
  return app;
}

describe("auth error page (content negotiation)", () => {
  it("returns JSON by default for API clients (no Accept header)", async () => {
    const res = await request(buildApp()).get("/boom");
    expect(res.status).toBe(401);
    expect(res.type).toMatch(/json/);
    expect(res.body).toEqual({ message: "Bad creds", code: "invalid_credentials" });
  });

  it("returns JSON when Accept: application/json", async () => {
    const res = await request(buildApp())
      .get("/boom")
      .set("Accept", "application/json");
    expect(res.status).toBe(401);
    expect(res.type).toMatch(/json/);
    expect(res.body.code).toBe("invalid_credentials");
  });

  it("renders an HTML error page when the browser sends Accept: text/html", async () => {
    const res = await request(buildApp())
      .get("/boom")
      .set("Accept", "text/html,application/xhtml+xml");
    expect(res.status).toBe(401);
    expect(res.type).toMatch(/html/);
    expect(res.text).toContain("Those sign-in details didn&#39;t work");
    expect(res.text).toContain('data-testid="auth-error-card"');
    expect(res.text).toContain('href="/login"');
  });

  it("falls back to a generic title when the code is unknown", () => {
    const html = renderAuthErrorPage("totally_unknown_code", "oops");
    expect(html).toContain("We couldn&#39;t complete your request");
    expect(html).toContain("Error code: totally_unknown_code");
  });

  it("escapes HTML in the message so it can't break out of the page", () => {
    const html = renderAuthErrorPage("invalid_credentials", "<script>alert(1)</script>");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("uses friendly copy for rate-limited responses", async () => {
    const res = await request(buildApp())
      .get("/rate")
      .set("Accept", "text/html");
    expect(res.status).toBe(429);
    expect(res.text).toContain("Too many attempts");
  });

  it("wantsHtml returns false when no Accept header is present", () => {
    const fakeReq = { headers: {}, accepts: () => "application/json" } as any;
    expect(wantsHtml(fakeReq)).toBe(false);
  });
});

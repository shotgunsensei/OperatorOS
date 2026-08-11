import assert from "node:assert/strict";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import http, { type Server } from "node:http";
import test from "node:test";

type JsonRecord = Record<string, any>;

async function listen(server: Server): Promise<string> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Server did not bind to a TCP port");
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
}

async function requestJson(
  baseUrl: string,
  path: string,
  options: RequestInit & { json?: unknown } = {},
  cookie?: string,
) {
  const headers = new Headers(options.headers);
  if (cookie) headers.set("cookie", cookie);
  if (options.json !== undefined) headers.set("content-type", "application/json");
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
    body: options.json === undefined ? options.body : JSON.stringify(options.json),
    redirect: options.redirect ?? "manual",
  });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as JsonRecord) : null;
  return { response, body };
}

test("OperatorOS launch drives the persistent, tenant-isolated TorqueShed workflow", async () => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  assert.ok(databaseUrl, "TEST_DATABASE_URL is required and must point to a disposable database");

  const identities: Record<string, JsonRecord> = {
    "launch-alpha": {
      user: { id: "operator-alpha", email: "alpha@example.com", displayName: "Alpha Builder", platformRole: "user" },
      tenant: { id: "tenant-alpha", slug: "alpha", name: "Alpha Garage", role: "owner" },
    },
    "launch-beta": {
      user: { id: "operator-beta", email: "beta@example.com", displayName: "Beta Builder", platformRole: "user" },
      tenant: { id: "tenant-beta", slug: "beta", name: "Beta Garage", role: "owner" },
    },
    "launch-alpha-second-tenant": {
      user: { id: "operator-alpha", email: "alpha@example.com", displayName: "Alpha Builder", platformRole: "user" },
      tenant: { id: "tenant-gamma", slug: "gamma", name: "Gamma Garage", role: "member" },
    },
  };
  const operatorOs = http.createServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/sso/consume") {
      response.writeHead(404).end();
      return;
    }
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      const payload = JSON.parse(body) as { token?: string; moduleId?: string };
      const identity = payload.token ? identities[payload.token] : undefined;
      if (!identity || payload.moduleId !== "torqueshed") {
        response.writeHead(401, { "content-type": "application/json" }).end(JSON.stringify({ code: "INVALID_TOKEN" }));
        return;
      }
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, module: { id: "torqueshed" }, ...identity }));
    });
  });

  const operatorOsUrl = await listen(operatorOs);
  process.env.DATABASE_URL = databaseUrl;
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  process.env.TORQUE_ASSIST_ADAPTER = "test";
  process.env.OPERATOROS_API_URL = operatorOsUrl;
  process.env.OPERATOROS_APP_URL = `${operatorOsUrl}/app-shell`;
  process.env.OPERATOROS_AUTH_URL = `${operatorOsUrl}/auth`;

  const [{ default: app }, database, migrator] = await Promise.all([
    import("../artifacts/api-server/src/app"),
    import("@workspace/db"),
    import("drizzle-orm/node-postgres/migrator"),
  ]);
  await migrator.migrate(database.db, {
    migrationsFolder: fileURLToPath(new URL("../lib/db/drizzle", import.meta.url)),
  });

  const publicTables = await database.pool.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public' order by tablename",
  );
  if (publicTables.rows.length) {
    const tableList = publicTables.rows.map(({ tablename }) => `\"${tablename.replaceAll('"', '""')}\"`).join(", ");
    await database.pool.query(`truncate table ${tableList} restart identity cascade`);
  }

  const apiServer = http.createServer(app);
  const apiUrl = await listen(apiServer);
  process.env.TORQUESHED_PUBLIC_URL = apiUrl;

  const signIn = async (token: string) => {
    const response = await fetch(`${apiUrl}/sso?token=${encodeURIComponent(token)}`, { redirect: "manual" });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), `${apiUrl}/?signed_in=operatoros`);
    const setCookie = response.headers.get("set-cookie");
    assert.ok(setCookie?.startsWith("torqueshed_session="));
    return setCookie.split(";", 1)[0]!;
  };

  try {
    const alphaCookie = await signIn("launch-alpha");
    const betaCookie = await signIn("launch-beta");
    const alphaSecondTenantCookie = await signIn("launch-alpha-second-tenant");

    const me = await requestJson(apiUrl, "/api/auth/me", {}, alphaCookie);
    assert.equal(me.response.status, 200);
    assert.equal(me.body.user.tenant.id, "tenant-alpha");
    const secondTenantMe = await requestJson(apiUrl, "/api/auth/me", {}, alphaSecondTenantCookie);
    assert.equal(secondTenantMe.response.status, 200);
    assert.equal(secondTenantMe.body.user.tenant.id, "tenant-gamma");
    const originalTenantAfterSecondLaunch = await requestJson(apiUrl, "/api/auth/me", {}, alphaCookie);
    assert.equal(originalTenantAfterSecondLaunch.body.user.tenant.id, "tenant-alpha");

    const createdVehicle = await requestJson(apiUrl, "/api/vehicles", {
      method: "POST",
      json: {
        year: 1997,
        make: "Ford",
        model: "Ranger",
        trim: "XLT",
        engine: "4.0L V6",
        transmission: "5-speed manual",
        drivetrain: "4WD",
        mileage: 181200,
        vin: "1FTCR15X0VTA12345",
        nickname: "Trail Ranger",
      },
    }, alphaCookie);
    assert.equal(createdVehicle.response.status, 201);
    const vehicleId = createdVehicle.body.vehicle.id as string;

    const maintenance = await requestJson(apiUrl, `/api/vehicles/${vehicleId}/records`, {
      method: "POST",
      json: {
        kind: "maintenance",
        title: "Engine oil and filter",
        description: "5W-30 synthetic and inspection",
        mileage: 181250,
        costCents: 4899,
        laborMinutes: 35,
        parts: [{ name: "Oil filter", quantity: 1 }],
        performedAt: "2026-07-16T12:00:00.000Z",
      },
    }, alphaCookie);
    assert.equal(maintenance.response.status, 201);

    const diagnostic = await requestJson(apiUrl, "/api/diagnostics", {
      method: "POST",
      json: {
        vehicleId,
        title: "Lean bank one under load",
        customerConcern: "Hesitation during warm acceleration",
        symptoms: "Intermittent stumble above 2500 RPM",
        conditions: { coolantTemperatureF: 195, ambientTemperatureF: 82 },
        freezeFrame: { rpm: 2680, shortTermFuelTrimPercent: 18.2 },
      },
    }, alphaCookie);
    assert.equal(diagnostic.response.status, 201);
    const diagnosticId = diagnostic.body.session.id as string;

    const code = await requestJson(apiUrl, `/api/diagnostics/${diagnosticId}/codes`, {
      method: "POST",
      json: { code: "P0171", description: "System too lean bank 1", freezeFrame: { rpm: 2680 } },
    }, alphaCookie);
    assert.equal(code.response.status, 201);

    const measurement = await requestJson(apiUrl, `/api/diagnostics/${diagnosticId}/entries`, {
      method: "POST",
      json: { kind: "measurement", title: "Fuel pressure", value: "35", unit: "psi", outcome: "Below specification under load" },
    }, alphaCookie);
    assert.equal(measurement.response.status, 201);

    const alphaUser = await database.pool.query<{ id: string }>(
      "select id from torqueshed_users where operatoros_user_id = $1 and tenant_id = $2",
      ["operator-alpha", "tenant-alpha"],
    );
    assert.equal(alphaUser.rowCount, 1);
    await database.db.insert(database.tokenLedgerEntries).values({
      tenantId: "tenant-alpha",
      ownerUserId: alphaUser.rows[0]!.id,
      delta: 4,
      entryType: "test_grant",
      description: "Integration test token grant",
      externalEventId: "integration-test-grant-alpha",
    });

    const idempotencyKey = "diagnostic-alpha-p0171-0001";
    const firstAnalysis = await requestJson(apiUrl, `/api/diagnostics/${diagnosticId}/assist`, {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey },
      json: {},
    }, alphaCookie);
    assert.equal(firstAnalysis.response.status, 200);
    assert.equal(firstAnalysis.body.analysis.status, "completed");
    assert.equal(firstAnalysis.body.analysis.chargedTokens, 2);
    assert.equal(firstAnalysis.body.tokens.available, 2);

    const retriedAnalysis = await requestJson(apiUrl, `/api/diagnostics/${diagnosticId}/assist`, {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey },
      json: {},
    }, alphaCookie);
    assert.equal(retriedAnalysis.response.status, 200);
    assert.equal(retriedAnalysis.body.analysis.id, firstAnalysis.body.analysis.id);
    assert.equal(retriedAnalysis.body.tokens.available, 2);

    const usageCharges = await database.pool.query<{ count: number; delta: number }>(
      "select count(*)::int as count, coalesce(sum(delta), 0)::int as delta from token_ledger_entries where owner_user_id = $1 and entry_type = 'torque_assist_usage'",
      [alphaUser.rows[0]!.id],
    );
    assert.deepEqual(usageCharges.rows[0], { count: 1, delta: -2 });

    const listing = await requestJson(apiUrl, "/api/listings", {
      method: "POST",
      json: { listingType: "sell", category: "parts", title: "Ranger manual hubs", description: "Used pair, inspected and ready to install.", condition: "Used — working", price: 125, locationLabel: "Richmond, VA", status: "published" },
    }, alphaCookie);
    assert.equal(listing.response.status, 201);
    const listingId = listing.body.listing.id as string;

    const post = await requestJson(apiUrl, "/api/posts", {
      method: "POST",
      json: { vehicleId, kind: "build_update", category: "diagnostics", title: "Found the lean-condition cause", body: "Fuel pressure dropped under load, so the confirmation plan moved upstream before any parts were ordered." },
    }, alphaCookie);
    assert.equal(post.response.status, 201);
    const postId = post.body.post.id as string;

    const reloaded = await requestJson(apiUrl, "/api/dashboard", {}, alphaCookie);
    assert.equal(reloaded.response.status, 200);
    assert.ok(reloaded.body.vehicles.some((vehicle: JsonRecord) => vehicle.id === vehicleId));
    assert.ok(reloaded.body.diagnostics.some((session: JsonRecord) => session.id === diagnosticId));
    assert.ok(reloaded.body.listings.some((item: JsonRecord) => item.id === listingId));
    assert.ok(reloaded.body.posts.some((item: JsonRecord) => item.id === postId));

    const vehicleDetails = await requestJson(apiUrl, `/api/vehicles/${vehicleId}`, {}, alphaCookie);
    assert.equal(vehicleDetails.response.status, 200);
    assert.equal(vehicleDetails.body.records.length, 1);
    assert.equal(vehicleDetails.body.diagnostics.length, 1);

    for (const [path, method, json] of [
      [`/api/vehicles/${vehicleId}`, "GET", undefined],
      [`/api/vehicles/${vehicleId}/records`, "POST", { kind: "repair", title: "Unauthorized record" }],
      [`/api/posts/${postId}/reactions/like`, "PUT", undefined],
      [`/api/listings/${listingId}/favorite`, "PUT", undefined],
    ] as const) {
      const isolated = await requestJson(apiUrl, path, { method, json }, betaCookie);
      assert.equal(isolated.response.status, 404, `${method} ${path} must be tenant-isolated`);
    }

    const betaDashboard = await requestJson(apiUrl, "/api/dashboard", {}, betaCookie);
    assert.equal(betaDashboard.response.status, 200);
    assert.equal(betaDashboard.body.vehicles.length, 0);
    assert.equal(betaDashboard.body.posts.length, 0);
    assert.equal(betaDashboard.body.listings.length, 0);

    const logout = await requestJson(apiUrl, "/api/auth/logout", { method: "POST", json: {} }, alphaCookie);
    assert.equal(logout.response.status, 200);
    assert.equal(logout.body.returnTo, `${operatorOsUrl}/app-shell/app`);
    assert.match(logout.response.headers.get("set-cookie") ?? "", /torqueshed_session=;/);

    const signedOut = await requestJson(apiUrl, "/api/auth/me", {}, alphaCookie);
    assert.equal(signedOut.response.status, 401);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    throw error;
  } finally {
    await close(apiServer);
    await database.pool.end();
    await close(operatorOs);
  }
});

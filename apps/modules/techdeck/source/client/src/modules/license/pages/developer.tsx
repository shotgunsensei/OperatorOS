import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Code, Terminal, FileCode } from "lucide-react";

export default function DeveloperPage() {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://your-app.replit.app";

  const curlExample = `curl -X POST ${baseUrl}/api/license/validate \\
  -H "Content-Type: application/json" \\
  -d '{
    "productSlug": "my-app-pro",
    "licenseKey": "SNV-XXXX-XXXX-XXXX-XXXX",
    "deviceFingerprint": "unique-device-id-here"
  }'`;

  const jsExample = `async function validateLicense(licenseKey, deviceFingerprint) {
  const response = await fetch("${baseUrl}/api/license/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      productSlug: "my-app-pro",
      licenseKey,
      deviceFingerprint,
    }),
  });

  const result = await response.json();

  if (result.valid) {
    console.log("License valid!", result.remainingActivations, "activations left");
    if (result.expiresAt) {
      console.log("Expires:", new Date(result.expiresAt).toLocaleDateString());
    }
  } else {
    console.error("License invalid:", result.reason);
  }

  return result;
}

// Usage
validateLicense("SNV-XXXX-XXXX-XXXX-XXXX", getDeviceFingerprint());`;

  const nodeExample = `const crypto = require("crypto");
const os = require("os");

function getDeviceFingerprint() {
  const info = [os.hostname(), os.platform(), os.arch(), os.cpus()[0]?.model].join("|");
  return crypto.createHash("sha256").update(info).digest("hex").substring(0, 32);
}

async function checkLicense(key) {
  const res = await fetch("${baseUrl}/api/license/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      productSlug: "my-app-pro",
      licenseKey: key,
      deviceFingerprint: getDeviceFingerprint(),
    }),
  });
  return res.json();
}`;

  const responseExample = `// Success (new activation)
{
  "valid": true,
  "reason": "activated",
  "remainingActivations": 4,
  "expiresAt": "2025-12-31T00:00:00.000Z"
}

// Success (already activated on this device)
{
  "valid": true,
  "reason": "already_activated",
  "remainingActivations": 4,
  "expiresAt": null
}

// Failure examples
{ "valid": false, "reason": "invalid_key" }
{ "valid": false, "reason": "key_revoked" }
{ "valid": false, "reason": "key_expired", "expiresAt": "2024-01-01T00:00:00.000Z" }
{ "valid": false, "reason": "max_activations_reached", "remainingActivations": 0 }
{ "valid": false, "reason": "product_inactive" }
{ "valid": false, "reason": "rate_limited" }`;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-developer-title">
          Developer
        </h1>
        <p className="text-sm text-muted-foreground">
          Integrate license validation into your application using the public API.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">API Endpoint</CardTitle>
          </div>
          <CardDescription>
            POST to validate a license key. No authentication required.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="default">POST</Badge>
            <code className="text-sm font-mono" data-testid="text-api-url">
              {baseUrl}/api/license/validate
            </code>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">Request body</p>
            <div className="text-xs text-muted-foreground space-y-1">
              <p><code className="font-mono">productSlug</code> - Your product's slug identifier</p>
              <p><code className="font-mono">licenseKey</code> - The SNV-XXXX-XXXX-XXXX-XXXX key</p>
              <p><code className="font-mono">deviceFingerprint</code> - Unique device identifier (you define)</p>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">Rate limits</p>
            <p className="text-xs text-muted-foreground">30 requests per minute per IP address.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">cURL Example</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <pre className="rounded-md bg-muted p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap" data-testid="code-curl">
            {curlExample}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">JavaScript / Browser</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <pre className="rounded-md bg-muted p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap" data-testid="code-js">
            {jsExample}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Code className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">Node.js Example</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <pre className="rounded-md bg-muted p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap" data-testid="code-node">
            {nodeExample}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Response Format</CardTitle>
          <CardDescription>
            All responses include <code className="font-mono text-xs">valid</code> (boolean) and <code className="font-mono text-xs">reason</code> (string).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="rounded-md bg-muted p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap" data-testid="code-response">
            {responseExample}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

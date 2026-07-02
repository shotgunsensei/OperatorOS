import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, ArrowRight, Building2, CheckCircle2, ShieldCheck } from "lucide-react";
import pulsedeskTitleLogo from "@assets/pulsedecktitleandlogo_1775753913991.png";
import heroImage from "@assets/Modern_healthcare_tech_in_action_1775753913992.png";
import { PulseDivider, PulseLine } from "@/components/pulse-line";
import { EcosystemFooter } from "@/components/ecosystem-footer";

const SSO_RELAUNCH_ERRORS = new Set([
  "expired",
  "consume_failed",
  "issuer_mismatch",
  "audience_mismatch",
  "env_mismatch",
  "signature_invalid",
  "unsupported_alg",
  "managed_by_operatoros",
  "local_auth_disabled",
]);

const ERROR_MESSAGES: Record<string, string> = {
  invalid_session: "Session expired. Launch PulseDesk again from OperatorOS.",
  state_mismatch: "Authentication state mismatch. Launch PulseDesk again from OperatorOS.",
  sso_not_configured: "PulseDesk SSO is not configured on this instance.",
  missing_token: "No launch token was provided. Launch PulseDesk from OperatorOS.",
  bad_request: "The launch token was malformed. Launch PulseDesk again from OperatorOS.",
  signature_invalid: "The launch token signature is invalid. Launch PulseDesk again from OperatorOS.",
  expired: "The launch link expired. Launch PulseDesk again from OperatorOS.",
  clock_skew: "The launch token timing is off. Check your device clock and relaunch from OperatorOS.",
  consume_failed: "The launch link was already used or rejected. Launch PulseDesk again from OperatorOS.",
  sso_consume_unavailable: "OperatorOS is temporarily unreachable. Try again from the Command Center.",
  audience_mismatch: "The launch token was issued for a different module.",
  env_mismatch: "The launch token was issued for a different environment.",
  issuer_mismatch: "The launch token came from an unrecognized issuer.",
  entitlement_disabled: "This tenant does not currently have PulseDesk entitlement.",
  managed_by_operatoros: "PulseDesk sign-in is managed by OperatorOS.",
  local_auth_disabled: "Local PulseDesk credentials are disabled. Launch from OperatorOS.",
};

function normalizeLaunchUrl(baseUrl: string | null): string {
  if (!baseUrl) return "https://app.operatoros.net/app/apps/pulsedesk";
  const normalized = baseUrl.replace(/\/+$/, "");
  return normalized.endsWith("/app/apps/pulsedesk")
    ? normalized
    : `${normalized}/app/apps/pulsedesk`;
}

export default function AuthPage() {
  const [operatorOsBaseUrl, setOperatorOsBaseUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showRelaunchPrompt, setShowRelaunchPrompt] = useState(false);

  useEffect(() => {
    fetch("/api/public/sso-config", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.baseUrl) setOperatorOsBaseUrl(data.baseUrl);
      })
      .catch(() => {});

    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (error) {
      setErrorMessage(ERROR_MESSAGES[error] || "PulseDesk could not complete the OperatorOS launch.");
      if (SSO_RELAUNCH_ERRORS.has(error)) setShowRelaunchPrompt(true);
      window.history.replaceState({}, "", "/login");
    }
  }, []);

  const launchUrl = normalizeLaunchUrl(operatorOsBaseUrl);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex flex-1">
        <div className="hidden lg:flex lg:w-[45%] bg-primary items-center justify-center p-12 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary to-[hsl(213,65%,22%)]" />

          <div className="absolute bottom-0 left-0 right-0 opacity-[0.06]">
            <PulseLine variant="full" width="100%" height={80} color="white" animate />
          </div>
          <div className="absolute top-[30%] left-0 right-0 opacity-[0.04]">
            <PulseLine variant="minimal" width="100%" height={40} color="white" animate={false} />
          </div>

          <div className="relative max-w-md text-center flex flex-col items-center">
            <img src={pulsedeskTitleLogo} alt="PulseDesk" className="h-12 mb-6 drop-shadow-lg" />
            <p className="text-[11px] uppercase tracking-[0.2em] text-accent/80 font-medium mb-4">OperatorOS SSO Module</p>

            <div className="rounded-lg overflow-hidden shadow-2xl shadow-black/30 mb-8 border border-white/10">
              <img src={heroImage} alt="Healthcare operations dashboard" className="w-full max-w-sm object-cover" />
            </div>

            <p className="text-primary-foreground/60 text-sm leading-relaxed max-w-xs mx-auto">
              PulseDesk sessions start in OperatorOS, then open with tenant, role, and module entitlement already verified.
            </p>

            <div className="my-6">
              <PulseDivider className="text-white/30" />
            </div>

            <div className="grid grid-cols-3 gap-6 text-center">
              <div>
                <div className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-white/10 border border-white/10 mb-2">
                  <ShieldCheck className="h-5 w-5 text-accent" />
                </div>
                <p className="text-[11px] text-primary-foreground/50 mt-1 font-medium">SSO</p>
              </div>
              <div>
                <div className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-white/10 border border-white/10 mb-2">
                  <Building2 className="h-5 w-5 text-accent" />
                </div>
                <p className="text-[11px] text-primary-foreground/50 mt-1 font-medium">Tenant Scoped</p>
              </div>
              <div>
                <div className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-white/10 border border-white/10 mb-2">
                  <Activity className="h-5 w-5 text-accent" />
                </div>
                <p className="text-[11px] text-primary-foreground/50 mt-1 font-medium">Operations</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-6 bg-background">
          <div className="w-full max-w-md space-y-5">
            <div className="lg:hidden text-center mb-2">
              <img src={pulsedeskTitleLogo} alt="PulseDesk" className="h-10 mx-auto mb-3" />
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mt-1 font-medium">OperatorOS SSO Module</p>
            </div>

            <Card data-testid="card-operatoros-managed-auth">
              <CardHeader>
                <CardTitle>Launch PulseDesk from OperatorOS</CardTitle>
                <CardDescription>
                  PulseDesk no longer accepts standalone credentials. Use the Command Center to issue a tenant-aware SSO launch.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {errorMessage && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" data-testid="pulsedesk-sso-error">
                    {errorMessage}
                  </div>
                )}
                {showRelaunchPrompt && (
                  <div className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground" data-testid="pulsedesk-relaunch-prompt">
                    Get a fresh launch link from OperatorOS before reopening PulseDesk.
                  </div>
                )}
                <Button asChild className="w-full gap-2" data-testid="button-launch-operatoros">
                  <a href={launchUrl}>
                    Open OperatorOS Command Center <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
                <div className="grid gap-2 text-xs text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" />
                    <span>OperatorOS validates the user, tenant, role, subscription, and PulseDesk entitlement.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" />
                    <span>PulseDesk creates a module session only after a valid SSO handoff.</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      <EcosystemFooter />
    </div>
  );
}

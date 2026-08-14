import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PulseLoader } from "@/components/pulse-line";
import {
  Mail,
  Copy,
  Check,
  Lock,
  Send,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
  MailPlus,
  RefreshCw,
  Server,
  Plug,
  Power,
  Loader2,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  Inbox,
  Unplug,
  ExternalLink,
  Settings,
  Save,
  Trash2,
} from "lucide-react";
import { SiGoogle } from "react-icons/si";

function MicrosoftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 21 21" fill="currentColor">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
import { canManageSettings } from "@/lib/permissions";

interface EmailSettingsData {
  id: string;
  orgId: string;
  inboundAlias: string;
  enabled: boolean;
  defaultDepartmentId: string | null;
  defaultAssigneeId: string | null;
  allowedSenderDomains: string[] | null;
  autoCreateContacts: boolean;
  appendRepliesToTickets: boolean;
  unknownSenderAction: string;
}

interface InboundEvent {
  id: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  status: string;
  statusReason: string;
  ticketId: string | null;
  createdAt: string;
}

interface Connector {
  id: string;
  orgId: string;
  provider: "google" | "microsoft" | "imap" | "forwarding";
  label: string;
  status: string;
  emailAddress: string | null;
  imapHost: string | null;
  imapPort: number;
  imapTls: boolean;
  imapFolder: string | null;
  pollIntervalSeconds: number;
  lastPolledAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  emailsProcessed: number;
  enabled: boolean;
  hasCredentials: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Department {
  id: string;
  name: string;
}

interface MemberWithUser {
  userId: string;
  role: string;
  user: { id: string; fullName: string; username: string } | null;
}

const STATUS_ICON: Record<string, any> = {
  created: { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/20" },
  threaded: { icon: MessageSquare, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/20" },
  rejected: { icon: XCircle, color: "text-rose-600", bg: "bg-rose-50 dark:bg-rose-950/20" },
  failed: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/20" },
  accepted: { icon: Check, color: "text-sky-600", bg: "bg-sky-50 dark:bg-sky-950/20" },
};

const PROVIDER_INFO: Record<string, { name: string; description: string; icon: any; color: string }> = {
  google: { name: "Google Workspace", description: "Connect Gmail or Google Workspace inbox via OAuth", icon: SiGoogle, color: "text-red-500" },
  microsoft: { name: "Microsoft 365", description: "Connect Outlook or Microsoft 365 inbox via OAuth", icon: MicrosoftIcon, color: "text-blue-600" },
  forwarding: { name: "Email Forwarding", description: "Forward emails from any provider to your PulseDesk address", icon: Mail, color: "text-violet-600" },
  imap: { name: "Generic IMAP", description: "Connect any IMAP-compatible mailbox (legacy fallback)", icon: Server, color: "text-slate-600" },
};

function ConnectorStatusBadge({ connector }: { connector: Connector }) {
  if (!connector.enabled) {
    return <Badge variant="outline" className="text-[10px] border-slate-300 text-slate-500">Disabled</Badge>;
  }
  if (connector.status === "active" && connector.consecutiveFailures === 0) {
    return <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Connected</Badge>;
  }
  if (connector.status === "active" && connector.consecutiveFailures > 0) {
    return <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Degraded</Badge>;
  }
  if (connector.status === "error" || connector.status === "disabled") {
    return <Badge className="text-[10px] bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">Error</Badge>;
  }
  if (connector.status === "pending_auth") {
    return <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600">Needs Auth</Badge>;
  }
  return <Badge variant="outline" className="text-[10px]">{connector.status}</Badge>;
}

function HealthDot({ connector }: { connector: Connector }) {
  if (!connector.enabled) return <div className="h-2.5 w-2.5 rounded-full bg-slate-400 shrink-0" />;
  if (connector.status === "active" && connector.consecutiveFailures === 0) {
    return <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />;
  }
  if (connector.consecutiveFailures > 0 && connector.consecutiveFailures < 5) {
    return <div className="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0" />;
  }
  if (connector.status === "error" || connector.status === "disabled" || connector.consecutiveFailures >= 5) {
    return <div className="h-2.5 w-2.5 rounded-full bg-rose-500 shrink-0" />;
  }
  return <div className="h-2.5 w-2.5 rounded-full bg-slate-400 shrink-0" />;
}

function needsReauth(connector: Connector): boolean {
  if (connector.provider !== "google" && connector.provider !== "microsoft") return false;
  if (connector.status === "pending_auth") return true;
  if (!connector.hasCredentials) return true;
  if (connector.status === "error" && connector.lastError) {
    const err = connector.lastError.toLowerCase();
    if (err.includes("token") || err.includes("auth") || err.includes("revok") ||
        err.includes("expired") || err.includes("invalid_grant") || err.includes("unauthorized") ||
        err.includes("refresh") || err.includes("consent") || err.includes("403") || err.includes("401")) {
      return true;
    }
  }
  if (connector.consecutiveFailures >= 3 && connector.status === "error") return true;
  return false;
}

export default function EmailSettingsPage() {
  const { membership } = useAuth();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [domainsInput, setDomainsInput] = useState("");
  const [testForm, setTestForm] = useState({ fromEmail: "", fromName: "", subject: "", body: "" });
  const [imapForm, setImapForm] = useState({ imapHost: "", imapPort: 993, imapUser: "", imapPassword: "", imapTls: true, imapPollIntervalSeconds: 120, imapFolder: "INBOX" });
  const [showImapPassword, setShowImapPassword] = useState(false);
  const [showImapSection, setShowImapSection] = useState(false);
  const [googleAppForm, setGoogleAppForm] = useState({ clientId: "", clientSecret: "" });
  const [microsoftAppForm, setMicrosoftAppForm] = useState({ clientId: "", clientSecret: "" });
  const [showGoogleAppCreds, setShowGoogleAppCreds] = useState(false);
  const [showMicrosoftAppCreds, setShowMicrosoftAppCreds] = useState(false);
  const [showGoogleSecret, setShowGoogleSecret] = useState(false);
  const [showMicrosoftSecret, setShowMicrosoftSecret] = useState(false);

  const isAdmin = membership && canManageSettings(membership.role);

  useEffect(() => {
    document.title = "Connected Inboxes | PulseDesk";
    return () => { document.title = "PulseDesk"; };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connectorSuccess") === "true") {
      toast({ title: "Connected successfully", description: "Your email account has been linked" });
      window.history.replaceState({}, "", window.location.pathname);
      queryClient.invalidateQueries({ queryKey: ["/api/connectors"] });
    }
    const connectorError = params.get("connectorError");
    if (connectorError) {
      toast({ title: "Connection failed", description: decodeURIComponent(connectorError), variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const { data: settingsResponse, isLoading } = useQuery<{
    eligible: boolean;
    plan: string;
    settings: EmailSettingsData | null;
  }>({
    queryKey: ["/api/email/settings"],
  });

  const { data: connectors, isLoading: connectorsLoading } = useQuery<Connector[]>({
    queryKey: ["/api/connectors"],
    enabled: !!settingsResponse?.eligible,
    refetchInterval: 30000,
  });

  const { data: departments } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
    enabled: !!settingsResponse?.eligible,
  });

  const { data: members } = useQuery<MemberWithUser[]>({
    queryKey: ["/api/orgs/members"],
    enabled: !!settingsResponse?.eligible,
  });

  const { data: events } = useQuery<InboundEvent[]>({
    queryKey: ["/api/email/events"],
    enabled: !!settingsResponse?.eligible && !!settingsResponse?.settings,
  });

  const { data: oauthConfigStatus, refetch: refetchConfigStatus } = useQuery<{ google: boolean; microsoft: boolean; googleClientIdSet: boolean; microsoftClientIdSet: boolean }>({
    queryKey: ["/api/connectors/oauth/config-status"],
    enabled: !!settingsResponse?.eligible,
  });

  const { data: oauthAppConfig } = useQuery<{ googleClientIdSet: boolean; googleClientId: string | null; microsoftClientIdSet: boolean; microsoftClientId: string | null }>({
    queryKey: ["/api/email/oauth-app-config"],
    enabled: !!settingsResponse?.eligible && !!settingsResponse?.settings,
  });

  useEffect(() => {
    if (oauthAppConfig?.googleClientId) setGoogleAppForm(f => ({ ...f, clientId: oauthAppConfig.googleClientId! }));
    if (oauthAppConfig?.microsoftClientId) setMicrosoftAppForm(f => ({ ...f, clientId: oauthAppConfig.microsoftClientId! }));
  }, [oauthAppConfig]);

  const saveOAuthAppCredsMutation = useMutation({
    mutationFn: async (data: { provider: "google" | "microsoft"; clientId: string; clientSecret?: string }) => {
      const res = await apiRequest("PATCH", "/api/email/oauth-app-config", data);
      return await res.json();
    },
    onSuccess: (_data, vars) => {
      toast({ title: `${vars.provider === "google" ? "Google" : "Microsoft"} credentials saved` });
      queryClient.invalidateQueries({ queryKey: ["/api/email/oauth-app-config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/connectors/oauth/config-status"] });
      if (vars.provider === "google") { setShowGoogleAppCreds(false); setGoogleAppForm(f => ({ ...f, clientSecret: "" })); }
      else { setShowMicrosoftAppCreds(false); setMicrosoftAppForm(f => ({ ...f, clientSecret: "" })); }
    },
    onError: (err: any) => toast({ title: "Failed to save credentials", description: err.message, variant: "destructive" }),
  });

  const clearOAuthAppCredsMutation = useMutation({
    mutationFn: async (provider: "google" | "microsoft") => {
      const res = await apiRequest("DELETE", `/api/email/oauth-app-config/${provider}`);
      return await res.json();
    },
    onSuccess: (_data, provider) => {
      toast({ title: `${provider === "google" ? "Google" : "Microsoft"} credentials cleared` });
      queryClient.invalidateQueries({ queryKey: ["/api/email/oauth-app-config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/connectors/oauth/config-status"] });
      if (provider === "google") setGoogleAppForm({ clientId: "", clientSecret: "" });
      else setMicrosoftAppForm({ clientId: "", clientSecret: "" });
    },
    onError: (err: any) => toast({ title: "Failed to clear credentials", description: err.message, variant: "destructive" }),
  });

  const [testEmailForm, setTestEmailForm] = useState({ fromEmail: "", fromName: "", subject: "", body: "" });
  const [testEmailOpen, setTestEmailOpen] = useState(false);
  const [outboundTestRecipient, setOutboundTestRecipient] = useState("");

  const { data: outboundStatus } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/email/outbound/status"],
    enabled: !!settingsResponse?.eligible,
  });

  const outboundTestMutation = useMutation({
    mutationFn: async (to: string) => {
      const res = await apiRequest("POST", "/api/email/outbound/test", { to });
      return res.json();
    },
    onSuccess: () => toast({ title: "Test email sent", description: `Check ${outboundTestRecipient} (and spam folder).` }),
    onError: (err: any) => toast({ title: "Send failed", description: err.message, variant: "destructive" }),
  });

  const testEmailMutation = useMutation({
    mutationFn: async (data: typeof testEmailForm) => {
      const res = await apiRequest("POST", "/api/email/test-inbound", data);
      return await res.json();
    },
    onSuccess: (data: any) => {
      if (data.status === "created") {
        toast({ title: "Ticket created!", description: `${data.reason} from test email` });
        setTestEmailForm({ fromEmail: "", fromName: "", subject: "", body: "" });
        setTestEmailOpen(false);
      } else if (data.status === "threaded") {
        toast({ title: "Reply threaded", description: data.reason });
      } else {
        toast({ title: "Email processed", description: `Status: ${data.status} — ${data.reason}`, variant: data.status === "rejected" ? "destructive" : "default" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/email/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
    },
    onError: (err: any) => toast({ title: "Test failed", description: err.message, variant: "destructive" }),
  });

  const { data: imapStatus } = useQuery<{
    configured: boolean;
    imapHost: string | null;
    imapPort: number;
    imapUser: string | null;
    imapTls: boolean;
    imapEnabled: boolean;
    imapPollIntervalSeconds: number;
    imapFolder: string;
    imapLastPolledAt: string | null;
    imapLastError: string | null;
    imapConsecutiveFailures: number;
    imapEmailsProcessed: number;
    pollerRunning: boolean;
    pollerDisabled: boolean;
  }>({
    queryKey: ["/api/email/imap/status"],
    enabled: !!settingsResponse?.eligible && !!settingsResponse?.settings,
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (imapStatus?.configured) {
      setImapForm(prev => ({
        ...prev,
        imapHost: imapStatus.imapHost || prev.imapHost,
        imapPort: imapStatus.imapPort || prev.imapPort,
        imapUser: imapStatus.imapUser || prev.imapUser,
        imapTls: imapStatus.imapTls,
        imapPollIntervalSeconds: imapStatus.imapPollIntervalSeconds || prev.imapPollIntervalSeconds,
        imapFolder: imapStatus.imapFolder || prev.imapFolder,
      }));
    }
  }, [imapStatus?.configured]);

  const initMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/email/settings/initialize"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/settings"] });
      toast({ title: "Connected Inboxes activated", description: "Your inbound email address has been created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<EmailSettingsData>) => apiRequest("PATCH", "/api/email/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/settings"] });
      toast({ title: "Settings saved" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/email/test-inbound", data);
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/events"] });
      toast({ title: `Test result: ${data.status}`, description: data.reason || data.statusReason });
    },
    onError: (err: any) => toast({ title: "Test failed", description: err.message, variant: "destructive" }),
  });

  const createConnectorMutation = useMutation({
    mutationFn: async (data: { provider: string; label?: string; emailAddress?: string; imapHost?: string; imapPort?: number; imapUser?: string; imapPassword?: string; imapTls?: boolean; imapFolder?: string; pollIntervalSeconds?: number }) => {
      const res = await apiRequest("POST", "/api/connectors", data);
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/connectors"] });
      toast({ title: "Connector created", description: `${PROVIDER_INFO[data.provider]?.name || data.provider} connector added` });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const disconnectMutation = useMutation({
    mutationFn: async (connectorId: string) => {
      const res = await apiRequest("POST", `/api/connectors/${connectorId}/disconnect`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connectors"] });
      toast({ title: "Disconnected", description: "Connector has been disconnected" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const toggleConnectorMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const res = await apiRequest("PATCH", `/api/connectors/${id}`, { enabled });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connectors"] });
      toast({ title: "Connector updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const testConnectorMutation = useMutation({
    mutationFn: async (connectorId: string) => {
      const res = await apiRequest("POST", `/api/connectors/${connectorId}/test`);
      return await res.json();
    },
    onSuccess: (data: any) => {
      if (data.success) {
        toast({ title: "Connection successful", description: `Mailbox: ${data.mailboxInfo?.exists || 0} messages, ${data.mailboxInfo?.unseen || 0} unseen` });
      } else {
        toast({ title: "Connection failed", description: data.error, variant: "destructive" });
      }
    },
    onError: (err: any) => toast({ title: "Test failed", description: err.message, variant: "destructive" }),
  });

  const pollConnectorMutation = useMutation({
    mutationFn: async (connectorId: string) => {
      const res = await apiRequest("POST", `/api/connectors/${connectorId}/poll`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connectors"] });
      toast({ title: "Sync completed" });
    },
    onError: (err: any) => toast({ title: "Sync failed", description: err.message, variant: "destructive" }),
  });

  const deleteConnectorMutation = useMutation({
    mutationFn: (connectorId: string) => apiRequest("DELETE", `/api/connectors/${connectorId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connectors"] });
      toast({ title: "Connector removed" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const imapConfigMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/email/imap/configure", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/imap/status"] });
      toast({ title: "IMAP configuration saved" });
      setImapForm(f => ({ ...f, imapPassword: "" }));
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const imapToggleMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", "/api/email/imap", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/imap/status"] });
      toast({ title: "IMAP polling updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const imapTestMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/email/imap/test", data);
      return await res.json();
    },
    onSuccess: (data: any) => {
      if (data.success) {
        toast({ title: "Connection successful", description: `Mailbox: ${data.mailboxInfo?.exists || 0} messages, ${data.mailboxInfo?.unseen || 0} unseen` });
      } else {
        toast({ title: "Connection failed", description: data.error, variant: "destructive" });
      }
    },
    onError: (err: any) => toast({ title: "Test failed", description: err.message, variant: "destructive" }),
  });

  const imapResetMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/email/imap/reset"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/imap/status"] });
      toast({ title: "Poller reset", description: "IMAP poller has been reset and restarted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const startOAuth = async (connectorId: string, provider?: "google" | "microsoft") => {
    try {
      const res = await apiRequest("GET", `/api/connectors/${connectorId}/oauth/start`);
      const data = await res.json();
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      }
    } catch (err: any) {
      let description = err.message || "Unknown error";
      let code: string | undefined;
      try {
        const parsed = JSON.parse(description.replace(/^\d+:\s*/, ""));
        if (parsed.error) description = parsed.error;
        if (parsed.code) code = parsed.code;
      } catch {}
      if (code === "OAUTH_NOT_CONFIGURED") {
        if (provider === "google") setShowGoogleAppCreds(true);
        if (provider === "microsoft") setShowMicrosoftAppCreds(true);
        toast({
          title: "OAuth credentials required",
          description: description + " Expand the credentials section below to configure.",
          variant: "destructive",
        });
      } else {
        toast({ title: "OAuth failed", description, variant: "destructive" });
      }
    }
  };

  const handleConnectOAuth = async (provider: "google" | "microsoft") => {
    const existing = connectors?.find(c => c.provider === provider);
    if (existing) {
      if (existing.status === "pending_auth" || existing.status === "error") {
        await startOAuth(existing.id, provider);
      } else if (existing.status === "disabled" || !existing.enabled) {
        try {
          await apiRequest("PATCH", `/api/connectors/${existing.id}`, { enabled: true });
          queryClient.invalidateQueries({ queryKey: ["/api/connectors"] });
          toast({ title: "Connector re-enabled", description: `${PROVIDER_INFO[provider].name} has been re-enabled` });
        } catch (err: any) {
          toast({ title: "Error", description: err.message, variant: "destructive" });
        }
      } else if (existing.status === "active") {
        toast({ title: "Already connected", description: `${PROVIDER_INFO[provider].name} is already connected` });
      } else {
        await startOAuth(existing.id, provider);
      }
      return;
    }
    try {
      const res = await apiRequest("POST", "/api/connectors", { provider });
      const created = await res.json();
      await startOAuth(created.id, provider);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading) return <PulseLoader />;

  if (!isAdmin) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Connected Inboxes" description="Mail connector management" />
        <div className="flex-1 overflow-auto p-6">
          <Card className="max-w-lg mx-auto text-center p-8">
            <Lock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2" data-testid="text-admin-required">Admin Access Required</h3>
            <p className="text-sm text-muted-foreground">Only administrators can manage Connected Inboxes settings.</p>
          </Card>
        </div>
      </div>
    );
  }

  if (!settingsResponse?.eligible) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Connected Inboxes" description="Enterprise mail connector management" />
        <div className="flex-1 overflow-auto p-6">
          <Card className="max-w-xl mx-auto" data-testid="email-locked-card">
            <CardContent className="p-8 text-center">
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-primary/10 mb-4">
                <Lock className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">OperatorOS Access Required</h3>
              <p className="text-muted-foreground mb-4">
                Connected Inboxes is available to active PulseDesk tenants unless OperatorOS explicitly disables email automation.
                Contact your OperatorOS admin to review this tenant's PulseDesk module entitlement.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 text-left">
                <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50">
                  <SiGoogle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  <span className="text-sm">Google Workspace & Gmail OAuth integration</span>
                </div>
                <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50">
                  <MicrosoftIcon className="h-4 w-4 mt-0.5 shrink-0" />
                  <span className="text-sm">Microsoft 365 & Outlook OAuth integration</span>
                </div>
                <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50">
                  <Mail className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span className="text-sm">Email forwarding from any provider</span>
                </div>
                <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50">
                  <MessageSquare className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span className="text-sm">Automatic reply threading into tickets</span>
                </div>
              </div>
              <Button data-testid="button-operatoros-email-access" className="gap-2" disabled>
                Access managed by OperatorOS
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const settings = settingsResponse.settings;
  const inboundAddress = settings ? `${settings.inboundAlias}@pulsedesk.support` : null;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied to clipboard" });
  };

  const handleSaveDomains = () => {
    const domains = domainsInput.split(",").map(d => d.trim()).filter(Boolean);
    updateMutation.mutate({ allowedSenderDomains: domains } as any);
  };

  if (!settings) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Connected Inboxes" description="Enterprise mail connector management" />
        <div className="flex-1 overflow-auto p-6">
          <Card className="max-w-xl mx-auto text-center" data-testid="email-init-card">
            <CardContent className="p-8">
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-primary/10 mb-4">
                <Inbox className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Set Up Connected Inboxes</h3>
              <p className="text-muted-foreground mb-6">
                Connect your email accounts to automatically create support tickets from inbound messages.
              </p>
              <Button
                data-testid="button-activate-email"
                onClick={() => initMutation.mutate()}
                disabled={initMutation.isPending}
                size="lg"
                className="gap-2"
              >
                <MailPlus className="h-4 w-4" />
                {initMutation.isPending ? "Setting up..." : "Activate Connected Inboxes"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const googleConnector = connectors?.find(c => c.provider === "google");
  const microsoftConnector = connectors?.find(c => c.provider === "microsoft");
  const forwardingConnector = connectors?.find(c => c.provider === "forwarding");
  const imapConnectors = connectors?.filter(c => c.provider === "imap") || [];
  const activeConnectors = connectors?.filter(c => c.status === "active" && c.enabled) || [];

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Connected Inboxes" description="Manage mail connectors and inbound email automation" />
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="max-w-3xl mx-auto space-y-6">

          <Card data-testid="card-connector-google">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-red-50 dark:bg-red-950/30 flex items-center justify-center shrink-0">
                  <SiGoogle className="h-5 w-5 text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">Google Workspace</h3>
                    {googleConnector && <ConnectorStatusBadge connector={googleConnector} />}
                  </div>
                  {googleConnector?.status === "active" ? (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {googleConnector.emailAddress || "Connected"}
                      {googleConnector.lastPolledAt && ` · Last sync: ${new Date(googleConnector.lastPolledAt).toLocaleString()}`}
                      {` · ${googleConnector.emailsProcessed} emails processed`}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-0.5">Connect Gmail or Google Workspace inbox via OAuth</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {googleConnector && needsReauth(googleConnector) ? (
                    <>
                      <Button size="sm" className="gap-2 bg-amber-600 hover:bg-amber-700 text-white" onClick={() => handleConnectOAuth("google")} data-testid="button-reauth-google">
                        <RefreshCw className="h-3 w-3" /> Re-authorize
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs h-8 text-rose-600 hover:text-rose-700 gap-1" onClick={() => { if (confirm("Disconnect Google? This will revoke access tokens.")) disconnectMutation.mutate(googleConnector.id); }} data-testid="button-disconnect-google">
                        <Unplug className="h-3 w-3" /> Disconnect
                      </Button>
                    </>
                  ) : googleConnector && googleConnector.hasCredentials ? (
                    <>
                      <Button variant="outline" size="sm" className="text-xs h-8 gap-1" onClick={() => testConnectorMutation.mutate(googleConnector.id)} disabled={testConnectorMutation.isPending} data-testid="button-test-google">
                        <Plug className="h-3 w-3" /> Test
                      </Button>
                      <Button variant="outline" size="sm" className="text-xs h-8 gap-1" onClick={() => pollConnectorMutation.mutate(googleConnector.id)} disabled={pollConnectorMutation.isPending} data-testid="button-sync-google">
                        <RefreshCw className="h-3 w-3" /> Sync
                      </Button>
                      <Switch checked={googleConnector.enabled} onCheckedChange={(checked) => toggleConnectorMutation.mutate({ id: googleConnector.id, enabled: checked })} data-testid="switch-google-enabled" />
                      <Button variant="ghost" size="sm" className="text-xs h-8 text-rose-600 hover:text-rose-700 gap-1" onClick={() => { if (confirm("Disconnect Google? This will revoke access tokens.")) disconnectMutation.mutate(googleConnector.id); }} data-testid="button-disconnect-google">
                        <Unplug className="h-3 w-3" /> Disconnect
                      </Button>
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      {oauthConfigStatus && !oauthConfigStatus.google && (
                        <span className="text-[10px] text-amber-600 font-medium">Not configured</span>
                      )}
                      <Button size="sm" className="gap-2" onClick={() => handleConnectOAuth("google")} data-testid="button-connect-google">
                        <ExternalLink className="h-3 w-3" /> Connect
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              {googleConnector?.lastError && (
                <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/20">
                  <AlertTriangle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-rose-700 dark:text-rose-400">
                      {needsReauth(googleConnector) ? "Re-authorization Required" : `Error (${googleConnector.consecutiveFailures} failures)`}
                    </p>
                    <p className="text-xs text-rose-600 dark:text-rose-400">{googleConnector.lastError}</p>
                    {needsReauth(googleConnector) && (
                      <Button size="sm" variant="outline" className="mt-2 text-xs h-7 gap-1 border-rose-300 text-rose-700 hover:bg-rose-50" onClick={() => startOAuth(googleConnector.id, "google")} data-testid="button-reauth-google-inline">
                        <RefreshCw className="h-3 w-3" /> Re-authorize Now
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-3 border-t pt-3">
                <button
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowGoogleAppCreds(v => !v)}
                  data-testid="button-toggle-google-app-creds"
                >
                  <Settings className="h-3 w-3" />
                  <span>OAuth App Credentials</span>
                  {oauthAppConfig?.googleClientIdSet
                    ? <span className="ml-1 text-[10px] font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded-full">Configured</span>
                    : <span className="ml-1 text-[10px] font-medium text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded-full">Not set</span>
                  }
                  <ChevronDown className={`h-3 w-3 ml-auto transition-transform ${showGoogleAppCreds ? "rotate-180" : ""}`} />
                </button>
                {showGoogleAppCreds && (
                  <div className="mt-3 space-y-3" data-testid="section-google-app-creds">
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Enter your Google Cloud OAuth 2.0 credentials. These are stored encrypted per-organization and override any server-wide configuration.{" "}
                      <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="underline text-blue-600">Get credentials →</a>
                    </p>
                    <div className="space-y-2">
                      <div>
                        <label className="text-[11px] font-medium text-foreground mb-1 block">Client ID</label>
                        <input
                          type="text"
                          className="w-full text-xs font-mono border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                          placeholder="xxxx.apps.googleusercontent.com"
                          value={googleAppForm.clientId}
                          onChange={e => setGoogleAppForm(f => ({ ...f, clientId: e.target.value }))}
                          data-testid="input-google-client-id"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-foreground mb-1 block">Client Secret</label>
                        <div className="relative">
                          <input
                            type={showGoogleSecret ? "text" : "password"}
                            className="w-full text-xs font-mono border rounded-md px-3 py-2 pr-10 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                            placeholder={oauthAppConfig?.googleClientIdSet ? "Leave blank to keep existing secret" : "GOCSPX-…"}
                            value={googleAppForm.clientSecret}
                            onChange={e => setGoogleAppForm(f => ({ ...f, clientSecret: e.target.value }))}
                            data-testid="input-google-client-secret"
                          />
                          <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowGoogleSecret(v => !v)} data-testid="button-toggle-google-secret">
                            {showGoogleSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1"
                          disabled={!googleAppForm.clientId || (!googleAppForm.clientSecret && !oauthAppConfig?.googleClientIdSet) || saveOAuthAppCredsMutation.isPending}
                          onClick={() => saveOAuthAppCredsMutation.mutate({ provider: "google", clientId: googleAppForm.clientId, clientSecret: googleAppForm.clientSecret || "" })}
                          data-testid="button-save-google-app-creds"
                        >
                          <Save className="h-3 w-3" /> Save
                        </Button>
                        {oauthAppConfig?.googleClientIdSet && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs gap-1 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                            disabled={clearOAuthAppCredsMutation.isPending}
                            onClick={() => { if (confirm("Remove Google OAuth app credentials?")) clearOAuthAppCredsMutation.mutate("google"); }}
                            data-testid="button-clear-google-app-creds"
                          >
                            <Trash2 className="h-3 w-3" /> Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-connector-microsoft">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center shrink-0">
                  <MicrosoftIcon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">Microsoft 365</h3>
                    {microsoftConnector && <ConnectorStatusBadge connector={microsoftConnector} />}
                  </div>
                  {microsoftConnector?.status === "active" ? (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {microsoftConnector.emailAddress || "Connected"}
                      {microsoftConnector.lastPolledAt && ` · Last sync: ${new Date(microsoftConnector.lastPolledAt).toLocaleString()}`}
                      {` · ${microsoftConnector.emailsProcessed} emails processed`}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-0.5">Connect Outlook or Microsoft 365 inbox via OAuth</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {microsoftConnector && needsReauth(microsoftConnector) ? (
                    <>
                      <Button size="sm" className="gap-2 bg-amber-600 hover:bg-amber-700 text-white" onClick={() => handleConnectOAuth("microsoft")} data-testid="button-reauth-microsoft">
                        <RefreshCw className="h-3 w-3" /> Re-authorize
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs h-8 text-rose-600 hover:text-rose-700 gap-1" onClick={() => { if (confirm("Disconnect Microsoft 365? This will revoke access tokens.")) disconnectMutation.mutate(microsoftConnector.id); }} data-testid="button-disconnect-microsoft">
                        <Unplug className="h-3 w-3" /> Disconnect
                      </Button>
                    </>
                  ) : microsoftConnector && microsoftConnector.hasCredentials ? (
                    <>
                      <Button variant="outline" size="sm" className="text-xs h-8 gap-1" onClick={() => testConnectorMutation.mutate(microsoftConnector.id)} disabled={testConnectorMutation.isPending} data-testid="button-test-microsoft">
                        <Plug className="h-3 w-3" /> Test
                      </Button>
                      <Button variant="outline" size="sm" className="text-xs h-8 gap-1" onClick={() => pollConnectorMutation.mutate(microsoftConnector.id)} disabled={pollConnectorMutation.isPending} data-testid="button-sync-microsoft">
                        <RefreshCw className="h-3 w-3" /> Sync
                      </Button>
                      <Switch checked={microsoftConnector.enabled} onCheckedChange={(checked) => toggleConnectorMutation.mutate({ id: microsoftConnector.id, enabled: checked })} data-testid="switch-microsoft-enabled" />
                      <Button variant="ghost" size="sm" className="text-xs h-8 text-rose-600 hover:text-rose-700 gap-1" onClick={() => { if (confirm("Disconnect Microsoft 365? This will revoke access tokens.")) disconnectMutation.mutate(microsoftConnector.id); }} data-testid="button-disconnect-microsoft">
                        <Unplug className="h-3 w-3" /> Disconnect
                      </Button>
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      {oauthConfigStatus && !oauthConfigStatus.microsoft && (
                        <span className="text-[10px] text-amber-600 font-medium">Not configured</span>
                      )}
                      <Button size="sm" className="gap-2" onClick={() => handleConnectOAuth("microsoft")} data-testid="button-connect-microsoft">
                        <ExternalLink className="h-3 w-3" /> Connect
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              {microsoftConnector?.lastError && (
                <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/20">
                  <AlertTriangle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-rose-700 dark:text-rose-400">
                      {needsReauth(microsoftConnector) ? "Re-authorization Required" : `Error (${microsoftConnector.consecutiveFailures} failures)`}
                    </p>
                    <p className="text-xs text-rose-600 dark:text-rose-400">{microsoftConnector.lastError}</p>
                    {needsReauth(microsoftConnector) && (
                      <Button size="sm" variant="outline" className="mt-2 text-xs h-7 gap-1 border-rose-300 text-rose-700 hover:bg-rose-50" onClick={() => startOAuth(microsoftConnector.id, "microsoft")} data-testid="button-reauth-microsoft-inline">
                        <RefreshCw className="h-3 w-3" /> Re-authorize Now
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-3 border-t pt-3">
                <button
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowMicrosoftAppCreds(v => !v)}
                  data-testid="button-toggle-microsoft-app-creds"
                >
                  <Settings className="h-3 w-3" />
                  <span>OAuth App Credentials</span>
                  {oauthAppConfig?.microsoftClientIdSet
                    ? <span className="ml-1 text-[10px] font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded-full">Configured</span>
                    : <span className="ml-1 text-[10px] font-medium text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded-full">Not set</span>
                  }
                  <ChevronDown className={`h-3 w-3 ml-auto transition-transform ${showMicrosoftAppCreds ? "rotate-180" : ""}`} />
                </button>
                {showMicrosoftAppCreds && (
                  <div className="mt-3 space-y-3" data-testid="section-microsoft-app-creds">
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Enter your Microsoft Azure App Registration credentials. These are stored encrypted per-organization and override any server-wide configuration.{" "}
                      <a href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noopener noreferrer" className="underline text-blue-600">Azure Portal →</a>
                    </p>
                    <div className="space-y-2">
                      <div>
                        <label className="text-[11px] font-medium text-foreground mb-1 block">Client ID (Application ID)</label>
                        <input
                          type="text"
                          className="w-full text-xs font-mono border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                          value={microsoftAppForm.clientId}
                          onChange={e => setMicrosoftAppForm(f => ({ ...f, clientId: e.target.value }))}
                          data-testid="input-microsoft-client-id"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-foreground mb-1 block">Client Secret</label>
                        <div className="relative">
                          <input
                            type={showMicrosoftSecret ? "text" : "password"}
                            className="w-full text-xs font-mono border rounded-md px-3 py-2 pr-10 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                            placeholder={oauthAppConfig?.microsoftClientIdSet ? "Leave blank to keep existing secret" : "Enter client secret value"}
                            value={microsoftAppForm.clientSecret}
                            onChange={e => setMicrosoftAppForm(f => ({ ...f, clientSecret: e.target.value }))}
                            data-testid="input-microsoft-client-secret"
                          />
                          <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowMicrosoftSecret(v => !v)} data-testid="button-toggle-microsoft-secret">
                            {showMicrosoftSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1"
                          disabled={!microsoftAppForm.clientId || (!microsoftAppForm.clientSecret && !oauthAppConfig?.microsoftClientIdSet) || saveOAuthAppCredsMutation.isPending}
                          onClick={() => saveOAuthAppCredsMutation.mutate({ provider: "microsoft", clientId: microsoftAppForm.clientId, clientSecret: microsoftAppForm.clientSecret || "" })}
                          data-testid="button-save-microsoft-app-creds"
                        >
                          <Save className="h-3 w-3" /> Save
                        </Button>
                        {oauthAppConfig?.microsoftClientIdSet && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs gap-1 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                            disabled={clearOAuthAppCredsMutation.isPending}
                            onClick={() => { if (confirm("Remove Microsoft OAuth app credentials?")) clearOAuthAppCredsMutation.mutate("microsoft"); }}
                            data-testid="button-clear-microsoft-app-creds"
                          >
                            <Trash2 className="h-3 w-3" /> Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-connector-forwarding">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center shrink-0">
                  <Mail className="h-5 w-5 text-violet-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">Email Forwarding</h3>
                    {forwardingConnector && <ConnectorStatusBadge connector={forwardingConnector} />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Forward emails from any provider to your PulseDesk address</p>
                </div>
                {!forwardingConnector && (
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => createConnectorMutation.mutate({ provider: "forwarding" })} disabled={createConnectorMutation.isPending} data-testid="button-setup-forwarding">
                    <MailPlus className="h-3 w-3" /> Set Up
                  </Button>
                )}
              </div>
              {(forwardingConnector || inboundAddress) && (
                <div className="mt-3 space-y-4">
                  <div>
                    <p className="text-xs font-medium text-foreground mb-1.5">Your Inbound Alias</p>
                    <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                      <code className="flex-1 text-sm font-mono" data-testid="text-inbound-address">{inboundAddress}</code>
                      <Button variant="ghost" size="sm" onClick={() => handleCopy(inboundAddress!)} data-testid="button-copy-address">
                        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">This is the address identifier used to route emails to your organization</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground mb-1.5">Webhook URL (for SendGrid / Mailgun)</p>
                    <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                      <code className="flex-1 text-xs font-mono break-all" data-testid="text-webhook-url">{`${window.location.origin}/api/email/inbound/sendgrid`}</code>
                      <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/api/email/inbound/sendgrid`); toast({ title: "Copied!" }); }} data-testid="button-copy-webhook">
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-2 px-1 border-t pt-3">
                    <div className="border rounded-lg p-3 bg-background mb-2">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-medium text-foreground flex items-center gap-2">
                          <Send className="h-3 w-3" /> Outbound notifications
                        </p>
                        <Badge variant={outboundStatus?.enabled ? "default" : "secondary"} className="text-[10px]" data-testid="badge-outbound-status">
                          {outboundStatus?.enabled ? "Enabled" : "Not configured"}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mb-2">
                        {outboundStatus?.enabled
                          ? "Ticket-update emails are sent automatically when SendGrid is configured."
                          : "Set SENDGRID_API_KEY in your environment to enable automatic ticket update emails."}
                      </p>
                      <div className="flex gap-2">
                        <Input
                          type="email"
                          placeholder="you@example.com"
                          value={outboundTestRecipient}
                          onChange={(e) => setOutboundTestRecipient(e.target.value)}
                          className="h-8 text-xs"
                          data-testid="input-outbound-test-to"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 h-8 text-xs whitespace-nowrap"
                          disabled={!outboundStatus?.enabled || !outboundTestRecipient || outboundTestMutation.isPending}
                          onClick={() => outboundTestMutation.mutate(outboundTestRecipient)}
                          data-testid="button-send-test-outbound"
                        >
                          <Send className={`h-3 w-3 ${outboundTestMutation.isPending ? "animate-pulse" : ""}`} />
                          Send test
                        </Button>
                      </div>
                    </div>
                    <p className="font-medium text-foreground">Setup Instructions:</p>
                    <div className="space-y-2">
                      <div>
                        <p className="font-medium text-foreground/80">Option A: SendGrid Inbound Parse</p>
                        <ol className="list-decimal list-inside space-y-0.5 ml-1">
                          <li>In SendGrid, go to Settings → Inbound Parse</li>
                          <li>Add your domain and point its MX record to <code className="text-[10px] bg-muted px-1 rounded">mx.sendgrid.net</code></li>
                          <li>Set the Destination URL to the webhook URL above</li>
                          <li>Check "POST the raw, full MIME message" or leave unchecked for parsed mode</li>
                          <li>Emails sent to <code className="text-[10px] bg-muted px-1 rounded">{inboundAddress?.split("@")[0]}@yourdomain.com</code> will create tickets</li>
                        </ol>
                      </div>
                      <div>
                        <p className="font-medium text-foreground/80">Option B: Mailgun Inbound Routing</p>
                        <ol className="list-decimal list-inside space-y-0.5 ml-1">
                          <li>In Mailgun, go to Receiving → Create Route</li>
                          <li>Set match expression to <code className="text-[10px] bg-muted px-1 rounded">match_recipient("{inboundAddress?.split("@")[0]}@yourdomain.com")</code></li>
                          <li>Set action to forward to: <code className="text-[10px] bg-muted px-1 rounded">{window.location.origin}/api/email/inbound/mailgun</code></li>
                        </ol>
                      </div>
                      <div>
                        <p className="font-medium text-foreground/80">Option C: Test Manually</p>
                        <p>Use the "Test Inbound Email" card below to simulate an incoming email and verify ticket creation works</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-test-email">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center shrink-0">
                    <Send className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">Test Inbound Email</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Simulate an incoming email to verify ticket creation works</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => setTestEmailOpen(!testEmailOpen)} data-testid="button-toggle-test-email">
                  <Send className="h-3 w-3" /> {testEmailOpen ? "Close" : "Send Test"}
                </Button>
              </div>
              {testEmailOpen && (
                <div className="mt-4 space-y-3 border-t pt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium mb-1 block">From Email *</label>
                      <Input
                        value={testEmailForm.fromEmail}
                        onChange={(e) => setTestEmailForm(f => ({ ...f, fromEmail: e.target.value }))}
                        placeholder="sender@example.com"
                        type="email"
                        className="h-8 text-xs"
                        data-testid="input-test-from-email"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium mb-1 block">From Name</label>
                      <Input
                        value={testEmailForm.fromName}
                        onChange={(e) => setTestEmailForm(f => ({ ...f, fromName: e.target.value }))}
                        placeholder="John Doe"
                        className="h-8 text-xs"
                        data-testid="input-test-from-name"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block">Subject *</label>
                    <Input
                      value={testEmailForm.subject}
                      onChange={(e) => setTestEmailForm(f => ({ ...f, subject: e.target.value }))}
                      placeholder="Test support request"
                      className="h-8 text-xs"
                      data-testid="input-test-subject"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block">Body</label>
                    <Textarea
                      value={testEmailForm.body}
                      onChange={(e) => setTestEmailForm(f => ({ ...f, body: e.target.value }))}
                      placeholder="This is a test email to verify ticket creation..."
                      rows={3}
                      className="text-xs"
                      data-testid="input-test-body"
                    />
                  </div>
                  <Button
                    size="sm"
                    className="gap-2"
                    onClick={() => testEmailMutation.mutate(testEmailForm)}
                    disabled={testEmailMutation.isPending || !testEmailForm.fromEmail || !testEmailForm.subject}
                    data-testid="button-send-test-email"
                  >
                    <Send className="h-3 w-3" /> {testEmailMutation.isPending ? "Sending..." : "Send Test Email"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="border rounded-lg" data-testid="card-connector-imap-section">
            <button
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
              onClick={() => setShowImapSection(!showImapSection)}
              data-testid="button-toggle-imap-section"
            >
              {showImapSection ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              <Server className="h-4 w-4 text-slate-600" />
              <div className="flex-1">
                <span className="text-sm font-medium">Advanced: Generic IMAP</span>
                <span className="text-xs text-muted-foreground ml-2">(Legacy fallback)</span>
              </div>
              {imapConnectors.length > 0 && (
                <Badge variant="outline" className="text-[10px]">{imapConnectors.length} configured</Badge>
              )}
              {imapStatus?.configured && (
                <Badge variant="outline" className="text-[10px]">Legacy IMAP active</Badge>
              )}
            </button>

            {showImapSection && (
              <div className="border-t p-4 space-y-4">
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Legacy Connection Method</p>
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Generic IMAP is a fallback for providers that don't support OAuth. We recommend using Google or Microsoft OAuth connectors when possible for better security and reliability.
                    </p>
                  </div>
                </div>

                {imapConnectors.map(connector => (
                  <div key={connector.id} className="rounded-lg border p-3" data-testid={`connector-imap-${connector.id}`}>
                    <div className="flex items-center gap-3">
                      <HealthDot connector={connector} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{connector.emailAddress || connector.imapHost || "IMAP"}</span>
                          <ConnectorStatusBadge connector={connector} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {connector.imapHost}:{connector.imapPort}
                          {connector.lastPolledAt && ` · Last sync: ${new Date(connector.lastPolledAt).toLocaleString()}`}
                          {` · ${connector.emailsProcessed} emails`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="outline" size="sm" className="text-xs h-7 gap-1" onClick={() => testConnectorMutation.mutate(connector.id)} disabled={testConnectorMutation.isPending} data-testid={`button-test-imap-${connector.id}`}>
                          <Plug className="h-3 w-3" /> Test
                        </Button>
                        <Button variant="outline" size="sm" className="text-xs h-7 gap-1" onClick={() => pollConnectorMutation.mutate(connector.id)} disabled={pollConnectorMutation.isPending} data-testid={`button-sync-imap-${connector.id}`}>
                          <RefreshCw className="h-3 w-3" /> Sync
                        </Button>
                        <Switch checked={connector.enabled} onCheckedChange={(checked) => toggleConnectorMutation.mutate({ id: connector.id, enabled: checked })} data-testid={`switch-imap-${connector.id}`} />
                        <Button variant="ghost" size="sm" className="text-xs h-7 text-rose-600" onClick={() => { if (confirm("Remove this IMAP connector?")) deleteConnectorMutation.mutate(connector.id); }} data-testid={`button-delete-imap-${connector.id}`}>
                          <XCircle className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    {connector.lastError && (
                      <div className="mt-2 flex items-start gap-2 p-2 rounded bg-rose-50 dark:bg-rose-950/20">
                        <AlertTriangle className="h-3 w-3 text-rose-600 mt-0.5 shrink-0" />
                        <p className="text-xs text-rose-600">{connector.lastError} ({connector.consecutiveFailures} failures)</p>
                      </div>
                    )}
                  </div>
                ))}

                {imapStatus?.configured && (
                  <div className="rounded-lg border p-3 border-amber-200 dark:border-amber-800" data-testid="legacy-imap-status">
                    <div className="flex items-center gap-3">
                      <div className={`h-2.5 w-2.5 rounded-full ${imapStatus.imapEnabled && !imapStatus.pollerDisabled ? "bg-emerald-500 animate-pulse" : imapStatus.pollerDisabled ? "bg-rose-500" : "bg-slate-400"}`} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">Legacy IMAP</span>
                          <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600">Legacy</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {imapStatus.imapUser}@{imapStatus.imapHost}:{imapStatus.imapPort}
                          {imapStatus.imapLastPolledAt && ` · Last poll: ${new Date(imapStatus.imapLastPolledAt).toLocaleString()}`}
                          {` · ${imapStatus.imapEmailsProcessed} emails`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {imapStatus.pollerDisabled && (
                          <Button variant="outline" size="sm" onClick={() => imapResetMutation.mutate()} disabled={imapResetMutation.isPending} data-testid="button-imap-reset" className="gap-1 text-xs h-7">
                            <RefreshCw className="h-3 w-3" /> Reset
                          </Button>
                        )}
                        <Switch data-testid="switch-imap-enabled" checked={imapStatus.imapEnabled} onCheckedChange={(checked) => imapToggleMutation.mutate({ imapEnabled: checked })} disabled={imapToggleMutation.isPending} />
                      </div>
                    </div>
                    {imapStatus.imapLastError && (
                      <div className="mt-2 flex items-start gap-2 p-2 rounded bg-rose-50 dark:bg-rose-950/20">
                        <AlertTriangle className="h-3 w-3 text-rose-600 mt-0.5 shrink-0" />
                        <p className="text-xs text-rose-600">{imapStatus.imapLastError} ({imapStatus.imapConsecutiveFailures} failures)</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="border rounded-lg p-4 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground">{imapStatus?.configured ? "Update Legacy IMAP Connection" : "Add New IMAP Connector"}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>IMAP Host *</Label>
                      <Input data-testid="input-imap-host" value={imapForm.imapHost} onChange={(e) => setImapForm({ ...imapForm, imapHost: e.target.value })} placeholder="imap.gmail.com" className="mt-1" />
                    </div>
                    <div>
                      <Label>Port</Label>
                      <Input data-testid="input-imap-port" type="number" value={imapForm.imapPort} onChange={(e) => setImapForm({ ...imapForm, imapPort: parseInt(e.target.value) || 993 })} className="mt-1" />
                    </div>
                  </div>
                  <div>
                    <Label>Username / Email *</Label>
                    <Input data-testid="input-imap-user" value={imapForm.imapUser} onChange={(e) => setImapForm({ ...imapForm, imapUser: e.target.value })} placeholder="support@yourdomain.com" className="mt-1" />
                  </div>
                  <div>
                    <Label>Password *</Label>
                    <div className="relative mt-1">
                      <Input data-testid="input-imap-password" type={showImapPassword ? "text" : "password"} value={imapForm.imapPassword} onChange={(e) => setImapForm({ ...imapForm, imapPassword: e.target.value })} placeholder={imapStatus?.configured ? "Leave blank to keep existing" : "App password or IMAP password"} className="pr-10" />
                      <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3" onClick={() => setShowImapPassword(!showImapPassword)}>
                        {showImapPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Switch data-testid="switch-imap-tls" checked={imapForm.imapTls} onCheckedChange={(checked) => setImapForm({ ...imapForm, imapTls: checked })} />
                      <Label>Use TLS</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label>Poll every</Label>
                      <Select value={String(imapForm.imapPollIntervalSeconds)} onValueChange={(val) => setImapForm({ ...imapForm, imapPollIntervalSeconds: parseInt(val) })}>
                        <SelectTrigger className="w-28" data-testid="select-imap-interval"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="60">60s</SelectItem>
                          <SelectItem value="120">2 min</SelectItem>
                          <SelectItem value="300">5 min</SelectItem>
                          <SelectItem value="600">10 min</SelectItem>
                          <SelectItem value="900">15 min</SelectItem>
                          <SelectItem value="1800">30 min</SelectItem>
                          <SelectItem value="3600">60 min</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Folder</Label>
                      <Input data-testid="input-imap-folder" value={imapForm.imapFolder} onChange={(e) => setImapForm({ ...imapForm, imapFolder: e.target.value })} placeholder="INBOX" className="mt-1 w-32" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button data-testid="button-imap-test" variant="outline" onClick={() => imapTestMutation.mutate({ imapHost: imapForm.imapHost || imapStatus?.imapHost, imapPort: imapForm.imapPort || imapStatus?.imapPort, imapUser: imapForm.imapUser || imapStatus?.imapUser, imapPassword: imapForm.imapPassword || undefined, imapTls: imapForm.imapTls })} disabled={imapTestMutation.isPending || !(imapForm.imapHost || imapStatus?.imapHost)} className="gap-1">
                      {imapTestMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
                      Test Connection
                    </Button>
                    {imapStatus?.configured ? (
                      <Button data-testid="button-imap-save" onClick={() => imapConfigMutation.mutate(imapForm)} disabled={imapConfigMutation.isPending || !imapForm.imapHost || !imapForm.imapUser || (!imapForm.imapPassword && !imapStatus?.configured)} className="gap-1">
                        {imapConfigMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                        Update Configuration
                      </Button>
                    ) : (
                      <Button data-testid="button-imap-add-connector" onClick={() => {
                        if (!imapForm.imapHost || !imapForm.imapUser || !imapForm.imapPassword) {
                          toast({ title: "Missing fields", description: "Host, username, and password are required", variant: "destructive" });
                          return;
                        }
                        createConnectorMutation.mutate({
                          provider: "imap",
                          imapHost: imapForm.imapHost,
                          imapPort: imapForm.imapPort,
                          imapUser: imapForm.imapUser,
                          imapPassword: imapForm.imapPassword,
                          imapTls: imapForm.imapTls,
                          imapFolder: imapForm.imapFolder,
                          pollIntervalSeconds: imapForm.imapPollIntervalSeconds,
                        });
                      }} disabled={createConnectorMutation.isPending} className="gap-1">
                        {createConnectorMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                        Add IMAP Connector
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <Card data-testid="card-email-toggle">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Processing Rules</CardTitle>
              <CardDescription>Configure how inbound emails are handled</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Enable Inbound Processing</Label>
                  <p className="text-xs text-muted-foreground">Accept inbound emails and create tickets</p>
                </div>
                <Switch data-testid="switch-email-enabled" checked={settings.enabled} onCheckedChange={(checked) => updateMutation.mutate({ enabled: checked } as any)} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Auto-create Contacts</Label>
                  <p className="text-xs text-muted-foreground">Create contact records for new senders</p>
                </div>
                <Switch data-testid="switch-auto-contacts" checked={settings.autoCreateContacts} onCheckedChange={(checked) => updateMutation.mutate({ autoCreateContacts: checked } as any)} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Thread Replies</Label>
                  <p className="text-xs text-muted-foreground">Append email replies to existing ticket threads</p>
                </div>
                <Switch data-testid="switch-thread-replies" checked={settings.appendRepliesToTickets} onCheckedChange={(checked) => updateMutation.mutate({ appendRepliesToTickets: checked } as any)} />
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-email-routing">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Routing & Defaults</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Default Department</Label>
                <Select value={settings.defaultDepartmentId || "none"} onValueChange={(val) => updateMutation.mutate({ defaultDepartmentId: val === "none" ? null : val } as any)}>
                  <SelectTrigger className="mt-1" data-testid="select-default-dept"><SelectValue placeholder="No default" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No default</SelectItem>
                    {departments?.map((d) => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Default Assignee</Label>
                <Select value={settings.defaultAssigneeId || "none"} onValueChange={(val) => updateMutation.mutate({ defaultAssigneeId: val === "none" ? null : val } as any)}>
                  <SelectTrigger className="mt-1" data-testid="select-default-assignee"><SelectValue placeholder="No default" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {members?.filter(m => m.user).map((m) => (<SelectItem key={m.userId} value={m.userId}>{m.user!.fullName || m.user!.username}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Unknown Sender Behavior</Label>
                <Select value={settings.unknownSenderAction} onValueChange={(val) => updateMutation.mutate({ unknownSenderAction: val } as any)}>
                  <SelectTrigger className="mt-1" data-testid="select-unknown-sender"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="create_ticket">Create ticket (default)</SelectItem>
                    <SelectItem value="reject">Reject email</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">What to do when an email arrives from an unknown sender</p>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-sender-domains">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Allowed Sender Domains
              </CardTitle>
              <CardDescription>Only accept emails from these domains. Leave empty to accept all.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {settings.allowedSenderDomains && settings.allowedSenderDomains.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {settings.allowedSenderDomains.map((d, i) => (
                    <Badge key={i} variant="secondary">{d}</Badge>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input data-testid="input-sender-domains" value={domainsInput} onChange={(e) => setDomainsInput(e.target.value)} placeholder="example.com, hospital.org" className="flex-1" />
                <Button variant="outline" onClick={handleSaveDomains} data-testid="button-save-domains">Save</Button>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-test-inbound">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Send className="h-4 w-4" />
                Test Inbound Email
              </CardTitle>
              <CardDescription>Simulate an inbound email to verify your configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>From Email *</Label>
                  <Input data-testid="input-test-from" value={testForm.fromEmail} onChange={(e) => setTestForm({ ...testForm, fromEmail: e.target.value })} placeholder="sender@example.com" className="mt-1" />
                </div>
                <div>
                  <Label>From Name</Label>
                  <Input data-testid="input-test-name" value={testForm.fromName} onChange={(e) => setTestForm({ ...testForm, fromName: e.target.value })} placeholder="John Smith" className="mt-1" />
                </div>
              </div>
              <div>
                <Label>Subject *</Label>
                <Input data-testid="input-test-subject" value={testForm.subject} onChange={(e) => setTestForm({ ...testForm, subject: e.target.value })} placeholder="Equipment malfunction in Room 301" className="mt-1" />
              </div>
              <div>
                <Label>Body</Label>
                <textarea data-testid="input-test-body" value={testForm.body} onChange={(e) => setTestForm({ ...testForm, body: e.target.value })} placeholder="Describe the issue..." className="mt-1 w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <Button data-testid="button-send-test" onClick={() => testMutation.mutate(testForm)} disabled={testMutation.isPending || !testForm.fromEmail || !testForm.subject} className="gap-2">
                <Send className="h-4 w-4" />
                {testMutation.isPending ? "Sending..." : "Send Test Email"}
              </Button>
            </CardContent>
          </Card>

          <Card data-testid="card-email-events">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Recent Processing Log
              </CardTitle>
              <CardDescription>History of inbound email processing events</CardDescription>
            </CardHeader>
            <CardContent>
              {!events || events.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No inbound email events yet</p>
              ) : (
                <div className="space-y-2">
                  {events.map((event) => {
                    const statusInfo = STATUS_ICON[event.status] || STATUS_ICON.failed;
                    const Icon = statusInfo.icon;
                    return (
                      <div key={event.id} className={`flex items-start gap-3 p-3 rounded-lg ${statusInfo.bg}`} data-testid={`event-${event.id}`}>
                        <Icon className={`h-4 w-4 mt-0.5 ${statusInfo.color}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{event.subject || "(no subject)"}</span>
                            <Badge variant="outline" className="text-[10px] shrink-0">{event.status}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            From: {event.fromName || event.fromEmail} &middot; {new Date(event.createdAt).toLocaleString()}
                          </p>
                          {event.statusReason && (
                            <p className="text-xs text-muted-foreground mt-0.5">{event.statusReason}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

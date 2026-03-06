function getApiBase(): string {
  if (typeof window !== 'undefined') {
    const mobileApiUrl = (window as any).__CAPACITOR_API_URL__;
    if (mobileApiUrl) return mobileApiUrl + '/v1';
    return '/api';
  }
  return (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001') + '/v1';
}

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const base = getApiBase();
  const url = `${base}${path}`;
  const headers: Record<string, string> = {};
  if (opts?.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, {
    ...opts,
    headers: { ...headers, ...(opts?.headers as Record<string, string>) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface DetectedInfo {
  framework: string;
  language: string;
  hasDockerfile: boolean;
  hasVercel: boolean;
  hasRender: boolean;
  hasRailway: boolean;
  hasFly: boolean;
  hasSupabase: boolean;
  hasStripe: boolean;
  scripts: { install?: string; build?: string; start?: string; test?: string };
  portsHint?: number;
}

export interface Risk {
  code: string;
  message: string;
  fixable: boolean;
}

export interface Recommendation {
  target: string;
  reason: string;
}

export interface AnalyzeResult {
  workspaceId: string;
  detected: DetectedInfo;
  risks: Risk[];
  recommendations: Recommendation[];
}

export interface PlanStep {
  id: string;
  title: string;
  description: string;
  userAction: boolean;
  canAutoFix: boolean;
  autoFixAction?: string;
  verification?: string;
}

export interface PublishPlan {
  ok: boolean;
  planId: string;
  selectedTarget: { platform: string; type: string };
  steps: PlanStep[];
  requiredEnvVars: Array<{ key: string; description: string; example?: string }>;
  dnsGuide?: { records: Array<{ type: string; name: string; value: string }>; notes: string[] };
  storeGuide?: { tracks: string[]; assets: string[] };
}

export interface ArtifactsResult {
  ok: boolean;
  proposedChanges: { files: Array<{ path: string; purpose: string }>; diff: string };
  notes: string[];
}

export interface ProofResult {
  ok: boolean;
  build: { ok: boolean; tail: string; durationMs: number };
  verify: { ok: boolean; steps: Array<{ name: string; ok: boolean; tail: string }> };
  nextActions: string[];
}

export interface ExplainResult {
  plainEnglishSummary: string;
  risksExplained: string[];
  recommendedEnvVarsExplained: string[];
}

export const publishApi = {
  analyze: (workspaceId: string) =>
    request<AnalyzeResult>('/publish/analyze', {
      method: 'POST',
      body: JSON.stringify({ workspaceId }),
    }),

  plan: (workspaceId: string, intent: string, preferences?: { platform?: string }) =>
    request<PublishPlan>('/publish/plan', {
      method: 'POST',
      body: JSON.stringify({ workspaceId, intent, preferences }),
    }),

  artifacts: (workspaceId: string, platform: string) =>
    request<ArtifactsResult>('/publish/artifacts', {
      method: 'POST',
      body: JSON.stringify({ workspaceId, platform }),
    }),

  proof: (workspaceId: string, planId?: string) =>
    request<ProofResult>('/publish/proof', {
      method: 'POST',
      body: JSON.stringify({ workspaceId, planId }),
    }),

  explain: (workspaceId: string, planId: string) =>
    request<ExplainResult>('/publish/explain', {
      method: 'POST',
      body: JSON.stringify({ workspaceId, planId }),
    }),
};

export type ExecFn = (cmd: string, timeoutSec?: number) => Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}>;

export interface DetectionResult {
  workspaceId: string;
  detected: {
    framework: 'nextjs' | 'react-vite' | 'fastapi' | 'express' | 'go' | 'dotnet' | 'expo' | 'flutter' | 'unknown';
    language: 'ts' | 'js' | 'py' | 'go' | 'cs' | 'dart' | 'unknown';
    hasDockerfile: boolean;
    hasVercel: boolean;
    hasRender: boolean;
    hasRailway: boolean;
    hasFly: boolean;
    hasSupabase: boolean;
    hasStripe: boolean;
    scripts: { install?: string; build?: string; start?: string; test?: string };
    portsHint?: number;
  };
  risks: Array<{ code: string; message: string; fixable: boolean }>;
  recommendations: Array<{ target: string; reason: string }>;
}

export interface PlanStep {
  id: string;
  title: string;
  description: string;
  userAction: boolean;
  canAutoFix: boolean;
  autoFixAction?: 'generateArtifacts' | 'applyPatch' | 'runCommand';
  verification?: 'build' | 'verify' | 'healthcheck';
}

export interface PublishPlan {
  ok: boolean;
  planId: string;
  selectedTarget: {
    platform: string;
    type: 'web' | 'mobile';
  };
  steps: PlanStep[];
  requiredEnvVars: Array<{ key: string; description: string; example?: string }>;
  dnsGuide?: {
    records: Array<{ type: 'A' | 'CNAME' | 'TXT'; name: string; value: string }>;
    notes: string[];
  };
  storeGuide?: {
    tracks: string[];
    assets: string[];
  };
}

export interface ArtifactsResult {
  ok: boolean;
  proposedChanges: {
    files: Array<{ path: string; purpose: string }>;
    diff: string;
  };
  notes: string[];
}

export interface ProofResult {
  ok: boolean;
  build: { ok: boolean; tail: string; durationMs: number };
  verify: { ok: boolean; steps: Array<{ name: string; ok: boolean; tail: string }> };
  nextActions: string[];
}

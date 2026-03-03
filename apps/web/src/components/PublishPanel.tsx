'use client';

import { useState } from 'react';
import {
  publishApi,
  type AnalyzeResult,
  type PublishPlan,
  type ArtifactsResult,
  type ProofResult,
  type ExplainResult,
} from '@/lib/publish';
import { api } from '@/lib/api';

type WizardStep = 'idle' | 'analyzing' | 'detected' | 'planning' | 'planned' | 'artifacts' | 'proofing' | 'proof_done' | 'error';

interface Props {
  workspaceId: string;
}

const frameworkLabels: Record<string, string> = {
  nextjs: 'Next.js',
  'react-vite': 'React (Vite)',
  fastapi: 'FastAPI',
  express: 'Express.js',
  go: 'Go',
  dotnet: '.NET',
  expo: 'Expo / React Native',
  flutter: 'Flutter',
  unknown: 'Unknown',
};

const languageLabels: Record<string, string> = {
  ts: 'TypeScript',
  js: 'JavaScript',
  py: 'Python',
  go: 'Go',
  cs: 'C#',
  dart: 'Dart',
  unknown: 'Unknown',
};

const intentLabels: Record<string, string> = {
  'web-domain': 'Web Domain',
  'mobile-store': 'Mobile Store',
  pwa: 'PWA',
};

export default function PublishPanel({ workspaceId }: Props) {
  const [step, setStep] = useState<WizardStep>('idle');
  const [detection, setDetection] = useState<AnalyzeResult | null>(null);
  const [plan, setPlan] = useState<PublishPlan | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactsResult | null>(null);
  const [proof, setProof] = useState<ProofResult | null>(null);
  const [explain, setExplain] = useState<ExplainResult | null>(null);
  const [intent, setIntent] = useState<string>('web-domain');
  const [error, setError] = useState<string | null>(null);
  const [patchApplied, setPatchApplied] = useState(false);
  const [stepStatuses, setStepStatuses] = useState<Record<string, 'pending' | 'running' | 'done' | 'fail'>>({});
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleAnalyze = async () => {
    setStep('analyzing');
    setError(null);
    setDetection(null);
    setPlan(null);
    setArtifacts(null);
    setProof(null);
    setExplain(null);
    setPatchApplied(false);
    setStepStatuses({});
    try {
      const result = await publishApi.analyze(workspaceId);
      setDetection(result);
      setStep('detected');
    } catch (e: any) {
      setError(e.message);
      setStep('error');
    }
  };

  const handlePlan = async () => {
    setStep('planning');
    setError(null);
    try {
      const result = await publishApi.plan(workspaceId, intent);
      setPlan(result);
      const statuses: Record<string, 'pending'> = {};
      result.steps.forEach((s) => { statuses[s.id] = 'pending'; });
      setStepStatuses(statuses);
      setStep('planned');
    } catch (e: any) {
      setError(e.message);
      setStep('error');
    }
  };

  const updateStepStatus = (stepId: string, status: 'pending' | 'running' | 'done' | 'fail') => {
    setStepStatuses((prev) => ({ ...prev, [stepId]: status }));
  };

  const findStepByAction = (action: string) => plan?.steps.find((s) => s.autoFixAction === action);
  const findStepByVerification = (v: string) => plan?.steps.find((s) => s.verification === v);

  const handleArtifacts = async () => {
    if (!plan) return;
    setError(null);
    const artifactStep = findStepByAction('generateArtifacts');
    if (artifactStep) updateStepStatus(artifactStep.id, 'running');
    try {
      const result = await publishApi.artifacts(workspaceId, plan.selectedTarget.platform);
      setArtifacts(result);
      setStep('artifacts');
      if (artifactStep) updateStepStatus(artifactStep.id, 'done');
    } catch (e: any) {
      setError(e.message);
      if (artifactStep) updateStepStatus(artifactStep.id, 'fail');
    }
  };

  const handleApplyPatch = async () => {
    if (!artifacts?.proposedChanges.diff) return;
    setError(null);
    try {
      const result = await api.applyPatch(workspaceId, artifacts.proposedChanges.diff);
      if (result.success) {
        setPatchApplied(true);
      } else {
        setError(result.error ?? 'Failed to apply patch');
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleProof = async () => {
    setStep('proofing');
    setError(null);
    const proofStep = findStepByVerification('build');
    if (proofStep) updateStepStatus(proofStep.id, 'running');
    try {
      const result = await publishApi.proof(workspaceId, plan?.planId);
      setProof(result);
      setStep('proof_done');
      if (proofStep) updateStepStatus(proofStep.id, result.ok ? 'done' : 'fail');
    } catch (e: any) {
      setError(e.message);
      setStep('error');
      if (proofStep) updateStepStatus(proofStep.id, 'fail');
    }
  };

  const handleExplain = async () => {
    if (!plan) return;
    try {
      const result = await publishApi.explain(workspaceId, plan.planId);
      setExplain(result);
    } catch { /* silently fail if no key */ }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const sectionStyle: React.CSSProperties = {
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
  };

  const badgeStyle = (color: string): React.CSSProperties => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 600,
    background: color + '22',
    color,
    marginRight: 6,
  });

  const btnStyle = (variant: 'primary' | 'secondary' | 'danger' = 'primary', disabled = false): React.CSSProperties => ({
    padding: '8px 16px',
    borderRadius: 6,
    border: 'none',
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    background: variant === 'primary' ? '#238636' : variant === 'danger' ? '#da3633' : '#30363d',
    color: '#fff',
    marginRight: 8,
  });

  const stepIconStyle = (status: string): string => {
    if (status === 'done') return '✅';
    if (status === 'running') return '⏳';
    if (status === 'fail') return '❌';
    return '⬜';
  };

  return (
    <div
      data-testid="publish-panel"
      style={{ height: '100%', overflow: 'auto', padding: 16, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14, gap: 10 }}>
        <span style={{ fontSize: 18, fontWeight: 700 }}>Publish Assistant</span>
        <span style={{ fontSize: 11, color: '#8b949e' }}>Powered by Shotgun Ninjas</span>
      </div>

      {step === 'idle' && (
        <div style={sectionStyle}>
          <p style={{ color: '#8b949e', fontSize: 13, marginBottom: 12 }}>
            The Publish Assistant helps you deploy your workspace to production. Click Analyze to get started.
          </p>
          <button data-testid="btn-analyze" onClick={handleAnalyze} style={btnStyle('primary')}>
            Analyze Workspace
          </button>
        </div>
      )}

      {step === 'analyzing' && (
        <div style={sectionStyle}>
          <span style={{ color: '#58a6ff' }}>Analyzing workspace...</span>
        </div>
      )}

      {error && (
        <div style={{ ...sectionStyle, borderColor: '#da3633' }}>
          <span style={{ color: '#f85149' }}>Error: {error}</span>
          <button data-testid="btn-retry" onClick={handleAnalyze} style={{ ...btnStyle('secondary'), marginLeft: 12 }}>
            Retry
          </button>
        </div>
      )}

      {detection && step !== 'idle' && step !== 'analyzing' && (
        <div style={sectionStyle} data-testid="section-detection">
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Detection Results</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <span style={badgeStyle('#58a6ff')}>{frameworkLabels[detection.detected.framework] || detection.detected.framework}</span>
            <span style={badgeStyle('#8b949e')}>{languageLabels[detection.detected.language] || detection.detected.language}</span>
            {detection.detected.hasDockerfile && <span style={badgeStyle('#3fb950')}>Dockerfile</span>}
            {detection.detected.hasVercel && <span style={badgeStyle('#000')}>Vercel</span>}
            {detection.detected.hasSupabase && <span style={badgeStyle('#3ecf8e')}>Supabase</span>}
            {detection.detected.portsHint && <span style={badgeStyle('#d29922')}>Port {detection.detected.portsHint}</span>}
          </div>

          {detection.detected.scripts.build && (
            <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 4 }}>
              Build: <code style={{ color: '#c9d1d9' }}>{detection.detected.scripts.build}</code>
            </div>
          )}
          {detection.detected.scripts.start && (
            <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 4 }}>
              Start: <code style={{ color: '#c9d1d9' }}>{detection.detected.scripts.start}</code>
            </div>
          )}

          {detection.risks.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#d29922', marginBottom: 4 }}>Risks</div>
              {detection.risks.map((r, i) => (
                <div key={i} style={{ fontSize: 12, color: '#f0883e', marginBottom: 2 }}>
                  {r.fixable ? '🔧' : '⚠️'} {r.message}
                </div>
              ))}
            </div>
          )}

          {detection.recommendations.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#3fb950', marginBottom: 4 }}>Recommendations</div>
              {detection.recommendations.map((r, i) => (
                <div key={i} style={{ fontSize: 12, color: '#8b949e', marginBottom: 2 }}>
                  <span style={{ fontWeight: 600, color: '#58a6ff' }}>{r.target}</span>: {r.reason}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {detection && (step === 'detected' || step === 'error') && (
        <div style={sectionStyle} data-testid="section-intent">
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Choose Deployment Intent</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {(['web-domain', 'mobile-store', 'pwa'] as const).map((i) => (
              <button
                key={i}
                data-testid={`btn-intent-${i}`}
                onClick={() => setIntent(i)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: intent === i ? '2px solid #58a6ff' : '1px solid #30363d',
                  background: intent === i ? '#1f2937' : '#0d1117',
                  color: intent === i ? '#58a6ff' : '#8b949e',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {intentLabels[i]}
              </button>
            ))}
          </div>
          <button data-testid="btn-generate-plan" onClick={handlePlan} style={btnStyle('primary')}>
            Generate Plan
          </button>
        </div>
      )}

      {step === 'planning' && (
        <div style={sectionStyle}>
          <span style={{ color: '#58a6ff' }}>Generating deployment plan...</span>
        </div>
      )}

      {plan && step !== 'idle' && step !== 'analyzing' && step !== 'detected' && step !== 'planning' && (
        <>
          <div style={sectionStyle} data-testid="section-plan">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                Deployment Plan
                <span style={{ ...badgeStyle('#58a6ff'), marginLeft: 8 }}>{plan.selectedTarget.platform}</span>
                <span style={badgeStyle('#8b949e')}>{plan.selectedTarget.type}</span>
              </div>
              <button data-testid="btn-explain" onClick={handleExplain} style={btnStyle('secondary')} title="Get AI explanation">
                Explain
              </button>
            </div>

            {plan.steps.map((s) => (
              <div
                key={s.id}
                data-testid={`plan-step-${s.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '8px 0',
                  borderBottom: '1px solid #21262d',
                }}
              >
                <span style={{ fontSize: 14, flexShrink: 0 }}>{stepIconStyle(stepStatuses[s.id] ?? 'pending')}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{s.title}</div>
                  <div style={{ fontSize: 12, color: '#8b949e' }}>{s.description}</div>
                  {s.userAction && <span style={badgeStyle('#d29922')}>Manual</span>}
                  {s.canAutoFix && <span style={badgeStyle('#3fb950')}>Auto-fix</span>}
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button data-testid="btn-artifacts" onClick={handleArtifacts} style={btnStyle('primary')}>
                Generate Artifacts
              </button>
              <button data-testid="btn-proof" onClick={handleProof} style={btnStyle('secondary')}>
                Run Proof (Build/Verify)
              </button>
            </div>
          </div>

          {plan.requiredEnvVars.length > 0 && (
            <div style={sectionStyle} data-testid="section-env-vars">
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Required Environment Variables</div>
              {plan.requiredEnvVars.map((v, i) => (
                <div key={i} style={{ fontSize: 12, marginBottom: 6 }}>
                  <code style={{ color: '#58a6ff', fontWeight: 600 }}>{v.key}</code>
                  <span style={{ color: '#8b949e', marginLeft: 8 }}>{v.description}</span>
                  {v.example && (
                    <button
                      onClick={() => copyToClipboard(v.example!)}
                      style={{ marginLeft: 8, background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer', fontSize: 11 }}
                    >
                      {copiedText === v.example ? 'Copied!' : 'Copy example'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {plan.dnsGuide && (
            <div style={sectionStyle} data-testid="section-dns">
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>DNS Configuration</div>
              {plan.dnsGuide.records.map((r, i) => (
                <div key={i} style={{ fontSize: 12, marginBottom: 4, display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={badgeStyle('#58a6ff')}>{r.type}</span>
                  <code style={{ color: '#c9d1d9' }}>{r.name}</code>
                  <span style={{ color: '#8b949e' }}>→</span>
                  <code style={{ color: '#3fb950' }}>{r.value}</code>
                  <button
                    onClick={() => copyToClipboard(r.value)}
                    style={{ background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer', fontSize: 11 }}
                  >
                    {copiedText === r.value ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              ))}
              {plan.dnsGuide.notes.map((n, i) => (
                <div key={i} style={{ fontSize: 11, color: '#8b949e', marginTop: 4 }}>{n}</div>
              ))}
            </div>
          )}

          {plan.storeGuide && (
            <div style={sectionStyle} data-testid="section-store">
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Store Submission</div>
              <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 4 }}>Tracks: {plan.storeGuide.tracks.join(' → ')}</div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Required Assets:</div>
              {plan.storeGuide.assets.map((a, i) => (
                <div key={i} style={{ fontSize: 12, color: '#8b949e', marginLeft: 12 }}>• {a}</div>
              ))}
            </div>
          )}
        </>
      )}

      {artifacts && (
        <div style={sectionStyle} data-testid="section-artifacts">
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Generated Artifacts</div>
          {artifacts.notes.map((n, i) => (
            <div key={i} style={{ fontSize: 12, color: '#8b949e', marginBottom: 4 }}>{n}</div>
          ))}
          {artifacts.proposedChanges.files.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {artifacts.proposedChanges.files.map((f, i) => (
                <div key={i} style={{ fontSize: 12, marginBottom: 4 }}>
                  <code style={{ color: '#58a6ff' }}>{f.path}</code>
                  <span style={{ color: '#8b949e', marginLeft: 8 }}>{f.purpose}</span>
                </div>
              ))}
            </div>
          )}
          {artifacts.proposedChanges.diff && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>Diff Preview</div>
              <pre
                data-testid="diff-preview"
                style={{
                  background: '#0d1117',
                  border: '1px solid #30363d',
                  borderRadius: 6,
                  padding: 10,
                  fontSize: 11,
                  overflow: 'auto',
                  maxHeight: 200,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {artifacts.proposedChanges.diff.split('\n').map((line, i) => (
                  <div
                    key={i}
                    style={{
                      color: line.startsWith('+') ? '#3fb950' : line.startsWith('-') ? '#f85149' : line.startsWith('@@') ? '#d2a8ff' : '#8b949e',
                    }}
                  >
                    {line}
                  </div>
                ))}
              </pre>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  data-testid="btn-apply-patch"
                  onClick={handleApplyPatch}
                  disabled={patchApplied}
                  style={btnStyle(patchApplied ? 'secondary' : 'primary', patchApplied)}
                >
                  {patchApplied ? 'Patch Applied' : 'Apply Patch'}
                </button>
                <button
                  onClick={() => copyToClipboard(artifacts.proposedChanges.diff)}
                  style={btnStyle('secondary')}
                >
                  {copiedText === artifacts.proposedChanges.diff ? 'Copied!' : 'Copy Diff'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 'proofing' && (
        <div style={sectionStyle}>
          <span style={{ color: '#58a6ff' }}>Running proof (build + verify)... This may take a minute.</span>
        </div>
      )}

      {proof && (
        <div style={sectionStyle} data-testid="section-proof">
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>
            Proof Results
            <span style={{ ...badgeStyle(proof.ok ? '#3fb950' : '#da3633'), marginLeft: 8 }}>
              {proof.ok ? 'PASSED' : 'FAILED'}
            </span>
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              Build {proof.build.ok ? '✅' : '❌'}
              <span style={{ color: '#8b949e', fontWeight: 400, marginLeft: 8 }}>
                {(proof.build.durationMs / 1000).toFixed(1)}s
              </span>
            </div>
            <pre
              style={{
                background: '#0d1117',
                border: '1px solid #30363d',
                borderRadius: 6,
                padding: 8,
                fontSize: 11,
                overflow: 'auto',
                maxHeight: 120,
                whiteSpace: 'pre-wrap',
                color: '#8b949e',
              }}
            >
              {proof.build.tail}
            </pre>
          </div>

          {proof.verify.steps.map((s, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                {s.name} {s.ok ? '✅' : '❌'}
              </div>
              <pre
                style={{
                  background: '#0d1117',
                  border: '1px solid #30363d',
                  borderRadius: 6,
                  padding: 8,
                  fontSize: 11,
                  overflow: 'auto',
                  maxHeight: 100,
                  whiteSpace: 'pre-wrap',
                  color: '#8b949e',
                }}
              >
                {s.tail}
              </pre>
            </div>
          ))}

          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Next Actions</div>
            {proof.nextActions.map((a, i) => (
              <div key={i} style={{ fontSize: 12, color: '#3fb950', marginBottom: 2 }}>→ {a}</div>
            ))}
          </div>
        </div>
      )}

      {explain && (
        <div style={sectionStyle} data-testid="section-explain">
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>AI Explanation</div>
          <div style={{ fontSize: 13, color: '#c9d1d9', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
            {explain.plainEnglishSummary}
          </div>
        </div>
      )}

      {(step !== 'idle' && step !== 'analyzing') && (
        <div style={{ marginTop: 8 }}>
          <button data-testid="btn-restart" onClick={() => { setStep('idle'); setError(null); }} style={btnStyle('secondary')}>
            Start Over
          </button>
        </div>
      )}
    </div>
  );
}

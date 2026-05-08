'use client';

import { useState, useEffect, useRef } from 'react';
import { Zap } from 'lucide-react';
import { colors } from '../SaasLayout';
import { useToast } from '../Toast';
import { aiApi } from '@/lib/auth';

interface AiTool {
  type: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  minPlan: string;
  actionCost: number;
  available: boolean;
  locked: boolean;
}

interface UsageStats {
  plan: string;
  monthly: { used: number; limit: number; percentage: number; remaining: number };
  stats: { totalActions: number; successActions: number; totalTokens: number; byTool: Record<string, number> };
  provider: { name: string; configured: boolean };
}

interface HistoryItem {
  id: string;
  toolType: string;
  toolName: string;
  input: string;
  outputPreview: string;
  tokenCount: number;
  durationMs: number;
  status: string;
  createdAt: string;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  toolType: string;
  promptText: string;
  usageCount: number;
  createdAt: string;
}

type Tab = 'tools' | 'templates' | 'history' | 'usage';
type TabIcon = string | JSX.Element;

export default function AiToolsPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('tools');
  const [tools, setTools] = useState<AiTool[]>([]);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [plan, setPlan] = useState('starter');
  const [loading, setLoading] = useState(true);

  const [activeTool, setActiveTool] = useState<AiTool | null>(null);
  const [input, setInput] = useState('');
  const [result, setResult] = useState('');
  const [executing, setExecuting] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('');

  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplDesc, setTplDesc] = useState('');
  const [tplTool, setTplTool] = useState('quick_action');
  const [tplPrompt, setTplPrompt] = useState('');
  const [tplSaving, setTplSaving] = useState(false);

  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [toolsData, usageData] = await Promise.all([
        aiApi.getTools(),
        aiApi.getUsage(),
      ]);
      setTools(toolsData.tools);
      setPlan(toolsData.plan);
      setUsage(usageData);
    } catch (err) {
      toast('Failed to load AI tools', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory() {
    try {
      const data = await aiApi.getHistory(30);
      setHistory(data.history);
    } catch { toast('Failed to load history', 'error'); }
  }

  async function loadTemplates() {
    try {
      const data = await aiApi.getTemplates();
      setTemplates(data.templates);
    } catch (err: any) {
      if (err?.code === 'FEATURE_LOCKED') {
        setTemplates([]);
      } else {
        toast('Failed to load templates', 'error');
      }
    }
  }

  useEffect(() => {
    if (tab === 'history') loadHistory();
    if (tab === 'templates') loadTemplates();
    if (tab === 'usage') aiApi.getUsage().then(setUsage).catch(() => {});
  }, [tab]);

  async function handleExecute() {
    if (!activeTool || !input.trim()) return;
    setExecuting(true);
    setResult('');
    try {
      const res = await aiApi.execute(activeTool.type, input.trim(), selectedTemplate || undefined);
      setResult(res.result);
      toast(`Generated in ${(res.durationMs / 1000).toFixed(1)}s`, 'success');
      aiApi.getUsage().then(setUsage).catch(() => {});
    } catch (err: any) {
      if (err?.code === 'AI_ACCESS_DENIED') {
        toast(err.error || err.message || 'AI access denied', 'error');
      } else {
        toast(err?.error || 'AI processing failed', 'error');
      }
    } finally {
      setExecuting(false);
    }
  }

  async function handleSaveTemplate() {
    if (!tplName.trim() || !tplPrompt.trim()) return;
    setTplSaving(true);
    try {
      await aiApi.createTemplate({ name: tplName, description: tplDesc, toolType: tplTool, promptText: tplPrompt });
      toast('Template saved', 'success');
      setShowTemplateForm(false);
      setTplName(''); setTplDesc(''); setTplPrompt('');
      loadTemplates();
    } catch (err: any) {
      toast(err?.error || 'Failed to save template', 'error');
    } finally {
      setTplSaving(false);
    }
  }

  async function handleDeleteTemplate(id: string) {
    try {
      await aiApi.deleteTemplate(id);
      toast('Template deleted', 'success');
      loadTemplates();
    } catch { toast('Failed to delete template', 'error'); }
  }

  const tabs: { key: Tab; label: string; icon: TabIcon }[] = [
    { key: 'tools', label: 'AI Tools', icon: <Zap size={14} strokeWidth={2} style={{ verticalAlign: 'middle' }} /> },
    { key: 'templates', label: 'Templates', icon: '📋' },
    { key: 'history', label: 'History', icon: '🕐' },
    { key: 'usage', label: 'Usage', icon: '📊' },
  ];

  const planBadgeColors: Record<string, string> = {
    starter: colors.textMuted,
    pro: colors.accent,
    elite: colors.accentPurple,
  };

  if (loading) {
    return (
      <div style={{ padding: 'clamp(16px, 3vw, 40px)' }} data-testid="ai-tools-page">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', paddingTop: 80 }}>
          <div style={{ width: 40, height: 40, border: `3px solid ${colors.border}`, borderTop: `3px solid ${colors.accent}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <div style={{ color: colors.textMuted, fontSize: 14 }}>Loading AI tools...</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ padding: 'clamp(16px, 3vw, 40px)', maxWidth: 1200 }} data-testid="ai-tools-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>
            <span style={{ background: 'linear-gradient(135deg, #58a6ff, #bc8cff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              AI Operations Assistant
            </span>
          </h1>
          <p style={{ fontSize: 14, color: colors.textMuted, margin: 0 }}>
            AI-powered tools to supercharge your operations
          </p>
        </div>
        {usage && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: colors.bgSecondary, border: `1px solid ${colors.border}`,
            borderRadius: 10, padding: '10px 16px',
          }} data-testid="ai-usage-badge">
            <div style={{ fontSize: 12, color: colors.textMuted }}>AI Credits</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: usage.monthly.percentage > 80 ? colors.accentYellow : '#fff' }}>
              {usage.monthly.limit >= 9999 ? '∞' : `${usage.monthly.used}/${usage.monthly.limit}`}
            </div>
            <div style={{
              width: 60, height: 6, borderRadius: 3,
              background: colors.bgHover,
            }}>
              <div style={{
                width: `${Math.min(usage.monthly.percentage, 100)}%`,
                height: '100%', borderRadius: 3,
                background: usage.monthly.percentage > 80
                  ? usage.monthly.percentage > 95 ? '#f85149' : colors.accentYellow
                  : colors.accent,
                transition: 'width 0.3s',
              }} />
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: `1px solid ${colors.border}`, paddingBottom: 0 }}>
        {tabs.map(t => (
          <button key={t.key} data-testid={`tab-${t.key}`}
            onClick={() => setTab(t.key)}
            style={{
              padding: '10px 16px', border: 'none', cursor: 'pointer',
              background: 'transparent',
              color: tab === t.key ? colors.accent : colors.textMuted,
              fontSize: 13, fontWeight: 600,
              borderBottom: tab === t.key ? `2px solid ${colors.accent}` : '2px solid transparent',
              transition: 'color 0.15s',
            }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'tools' && (
        <div>
          {activeTool ? (
            <ToolExecutor
              tool={activeTool}
              input={input}
              setInput={setInput}
              result={result}
              executing={executing}
              onExecute={handleExecute}
              onBack={() => { setActiveTool(null); setResult(''); setInput(''); setSelectedTemplate(''); }}
              templates={templates}
              selectedTemplate={selectedTemplate}
              setSelectedTemplate={setSelectedTemplate}
              plan={plan}
              resultRef={resultRef}
              toast={toast}
            />
          ) : (
            <ToolGrid tools={tools} plan={plan} onSelect={(tool) => {
              if (tool.locked) {
                toast(`${tool.name} requires ${tool.minPlan.charAt(0).toUpperCase() + tool.minPlan.slice(1)} plan`, 'error');
                return;
              }
              setActiveTool(tool);
              setResult('');
              setInput('');
              if (plan !== 'starter') loadTemplates();
            }} />
          )}
        </div>
      )}

      {tab === 'templates' && (
        <TemplatesPanel
          templates={templates}
          plan={plan}
          tools={tools}
          showForm={showTemplateForm}
          setShowForm={setShowTemplateForm}
          tplName={tplName} setTplName={setTplName}
          tplDesc={tplDesc} setTplDesc={setTplDesc}
          tplTool={tplTool} setTplTool={setTplTool}
          tplPrompt={tplPrompt} setTplPrompt={setTplPrompt}
          tplSaving={tplSaving}
          onSave={handleSaveTemplate}
          onDelete={handleDeleteTemplate}
          onUse={(tpl) => {
            const tool = tools.find(t => t.type === tpl.toolType);
            if (tool) {
              setActiveTool(tool);
              setSelectedTemplate(tpl.id);
              setInput('');
              setResult('');
              setTab('tools');
            }
          }}
        />
      )}

      {tab === 'history' && <HistoryPanel history={history} />}
      {tab === 'usage' && <UsagePanel usage={usage} tools={tools} />}
    </div>
  );
}

function ToolGrid({ tools, plan, onSelect }: { tools: AiTool[]; plan: string; onSelect: (t: AiTool) => void }) {
  const categories = [...new Set(tools.map(t => t.category))];

  return (
    <div>
      {categories.map(cat => (
        <div key={cat} style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: colors.textMuted, margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {cat}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {tools.filter(t => t.category === cat).map(tool => (
              <div key={tool.type} data-testid={`ai-tool-${tool.type}`}
                onClick={() => onSelect(tool)}
                style={{
                  background: colors.bgSecondary, border: `1px solid ${colors.border}`,
                  borderRadius: 12, padding: 24, cursor: 'pointer', position: 'relative',
                  opacity: tool.locked ? 0.5 : 1,
                  transition: 'border-color 0.15s, transform 0.15s',
                }}
                onMouseEnter={e => {
                  if (!tool.locked) {
                    e.currentTarget.style.borderColor = colors.accent;
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = colors.border;
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {tool.locked && (
                  <div style={{
                    position: 'absolute', top: 12, right: 12,
                    fontSize: 10, padding: '3px 8px', borderRadius: 4,
                    background: 'rgba(188,140,255,0.15)', color: colors.accentPurple,
                    fontWeight: 600,
                  }}>🔒 {tool.minPlan.charAt(0).toUpperCase() + tool.minPlan.slice(1)}+</div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 12,
                    background: tool.locked ? colors.bgHover : 'rgba(88,166,255,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
                  }}>{tool.icon}</div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{tool.name}</div>
                    <div style={{ fontSize: 11, color: colors.textDim }}>
                      {tool.actionCost} credit{tool.actionCost > 1 ? 's' : ''} per use
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: colors.textMuted, lineHeight: 1.5 }}>{tool.description}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ToolExecutor({
  tool, input, setInput, result, executing, onExecute, onBack,
  templates, selectedTemplate, setSelectedTemplate, plan, resultRef, toast,
}: {
  tool: AiTool;
  input: string;
  setInput: (v: string) => void;
  result: string;
  executing: boolean;
  onExecute: () => void;
  onBack: () => void;
  templates: Template[];
  selectedTemplate: string;
  setSelectedTemplate: (v: string) => void;
  plan: string;
  resultRef: React.RefObject<HTMLDivElement>;
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const toolTemplates = templates.filter(t => t.toolType === tool.type);

  const placeholders: Record<string, string> = {
    quick_action: 'Ask anything about your operations...',
    notes_summarizer: 'Paste notes or meeting minutes to summarize...',
    task_breakdown: 'Describe the goal or task to break down...',
    project_planner: 'Describe the project you need a plan for...',
    bulk_operations: 'Describe what you need to organize or batch-process...',
    automation_suggestions: 'Describe your current workflow or processes...',
  };

  return (
    <div>
      <button onClick={onBack} data-testid="button-back-tools"
        style={{
          background: 'none', border: 'none', color: colors.accent,
          fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
        ← Back to tools
      </button>

      <div style={{
        background: colors.bgSecondary, border: `1px solid ${colors.border}`,
        borderRadius: 16, padding: 28, marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'rgba(88,166,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
          }}>{tool.icon}</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{tool.name}</div>
            <div style={{ fontSize: 13, color: colors.textMuted }}>{tool.description}</div>
          </div>
        </div>

        {toolTemplates.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6, display: 'block' }}>Use Template</label>
            <select data-testid="select-template"
              value={selectedTemplate}
              onChange={e => setSelectedTemplate(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                background: colors.bg, border: `1px solid ${colors.border}`,
                color: '#fff', fontSize: 13, outline: 'none',
              }}>
              <option value="">No template</option>
              {toolTemplates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}

        <textarea data-testid="input-ai-prompt"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={placeholders[tool.type] || 'Enter your request...'}
          rows={6}
          style={{
            width: '100%', padding: '14px 16px', borderRadius: 10,
            background: colors.bg, border: `1px solid ${colors.border}`,
            color: '#fff', fontSize: 14, lineHeight: 1.6,
            resize: 'vertical', outline: 'none', boxSizing: 'border-box',
            fontFamily: 'inherit',
          }}
          onFocus={e => e.target.style.borderColor = colors.accent}
          onBlur={e => e.target.style.borderColor = colors.border}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
          <div style={{ fontSize: 12, color: colors.textDim }}>
            {input.length}/10,000 characters • {tool.actionCost} credit{tool.actionCost > 1 ? 's' : ''}
          </div>
          <button data-testid="button-execute-ai"
            onClick={onExecute}
            disabled={executing || !input.trim()}
            style={{
              padding: '10px 28px', borderRadius: 8, border: 'none',
              background: executing || !input.trim() ? colors.bgHover : 'linear-gradient(135deg, #58a6ff, #bc8cff)',
              color: executing || !input.trim() ? colors.textDim : '#fff',
              fontSize: 14, fontWeight: 600, cursor: executing || !input.trim() ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
            {executing ? (
              <>
                <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
                Generating...
              </>
            ) : (
              <>{tool.icon} Generate</>
            )}
          </button>
        </div>
      </div>

      {result && (
        <div ref={resultRef} style={{
          background: colors.bgSecondary, border: `1px solid ${colors.border}`,
          borderRadius: 16, padding: 28,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>Result</div>
            <button data-testid="button-copy-result"
              onClick={() => {
                navigator.clipboard.writeText(result);
                toast('Copied to clipboard', 'success');
              }}
              style={{
                padding: '6px 14px', borderRadius: 6, border: `1px solid ${colors.border}`,
                background: 'transparent', color: colors.textMuted, fontSize: 12,
                cursor: 'pointer',
              }}>
              📋 Copy
            </button>
          </div>
          <div data-testid="ai-result-output" style={{
            fontSize: 14, color: colors.text, lineHeight: 1.7,
            whiteSpace: 'pre-wrap', fontFamily: 'inherit',
          }}>
            <MarkdownRenderer text={result} />
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function MarkdownRenderer({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: JSX.Element[] = [];

  lines.forEach((line, i) => {
    if (line.startsWith('### ')) {
      elements.push(<h4 key={i} style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: '16px 0 8px' }}>{line.slice(4)}</h4>);
    } else if (line.startsWith('## ')) {
      elements.push(<h3 key={i} style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: '20px 0 10px' }}>{line.slice(3)}</h3>);
    } else if (line.startsWith('# ')) {
      elements.push(<h2 key={i} style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: '20px 0 10px' }}>{line.slice(2)}</h2>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <div key={i} style={{ paddingLeft: 16, margin: '4px 0', display: 'flex', gap: 8 }}>
          <span style={{ color: colors.accent }}>•</span>
          <span><InlineMarkdown text={line.slice(2)} /></span>
        </div>
      );
    } else if (/^\d+\.\s/.test(line)) {
      const match = line.match(/^(\d+)\.\s(.*)$/);
      if (match) {
        elements.push(
          <div key={i} style={{ paddingLeft: 16, margin: '4px 0', display: 'flex', gap: 8 }}>
            <span style={{ color: colors.accent, fontWeight: 600, minWidth: 18 }}>{match[1]}.</span>
            <span><InlineMarkdown text={match[2]} /></span>
          </div>
        );
      }
    } else if (line.startsWith('|') && line.endsWith('|')) {
      if (line.includes('---')) return;
      const cells = line.split('|').filter(Boolean).map(c => c.trim());
      elements.push(
        <div key={i} style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${colors.border}` }}>
          {cells.map((cell, j) => (
            <div key={j} style={{
              flex: 1, padding: '8px 12px', fontSize: 12,
              color: i === 0 ? colors.textMuted : colors.text,
              fontWeight: i === 0 ? 600 : 400,
            }}>
              <InlineMarkdown text={cell} />
            </div>
          ))}
        </div>
      );
    } else if (line.trim() === '') {
      elements.push(<div key={i} style={{ height: 8 }} />);
    } else {
      elements.push(<div key={i} style={{ margin: '4px 0' }}><InlineMarkdown text={line} /></div>);
    }
  });

  return <>{elements}</>;
}

function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} style={{ color: '#fff', fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function TemplatesPanel({
  templates, plan, tools, showForm, setShowForm,
  tplName, setTplName, tplDesc, setTplDesc, tplTool, setTplTool, tplPrompt, setTplPrompt,
  tplSaving, onSave, onDelete, onUse,
}: {
  templates: Template[];
  plan: string;
  tools: AiTool[];
  showForm: boolean;
  setShowForm: (v: boolean) => void;
  tplName: string; setTplName: (v: string) => void;
  tplDesc: string; setTplDesc: (v: string) => void;
  tplTool: string; setTplTool: (v: string) => void;
  tplPrompt: string; setTplPrompt: (v: string) => void;
  tplSaving: boolean;
  onSave: () => void;
  onDelete: (id: string) => void;
  onUse: (tpl: Template) => void;
}) {
  if (plan === 'starter') {
    return (
      <div style={{
        textAlign: 'center', padding: '60px 20px',
        background: colors.bgSecondary, borderRadius: 16,
        border: `1px solid ${colors.border}`,
      }} data-testid="templates-locked">
        <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>Prompt Templates</h3>
        <p style={{ fontSize: 14, color: colors.textMuted, margin: '0 0 20px', maxWidth: 400, marginLeft: 'auto', marginRight: 'auto' }}>
          Save and reuse your best prompts. Create templates with {'{{input}}'} placeholders for dynamic content.
        </p>
        <div style={{
          display: 'inline-block', padding: '4px 12px', borderRadius: 6,
          background: 'rgba(88,166,255,0.1)', color: colors.accent, fontSize: 12, fontWeight: 600,
        }}>🔒 Upgrade to Pro to unlock templates</div>
      </div>
    );
  }

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 8, boxSizing: 'border-box' as const,
    background: colors.bg, border: `1px solid ${colors.border}`,
    color: '#fff', fontSize: 13, outline: 'none', fontFamily: 'inherit',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 14, color: colors.textMuted }}>{templates.length} template{templates.length !== 1 ? 's' : ''}</div>
        <button data-testid="button-new-template"
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: '8px 16px', borderRadius: 8, border: 'none',
            background: colors.accent, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
          {showForm ? 'Cancel' : '+ New Template'}
        </button>
      </div>

      {showForm && (
        <div style={{
          background: colors.bgSecondary, border: `1px solid ${colors.border}`,
          borderRadius: 12, padding: 24, marginBottom: 20,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: colors.textMuted, display: 'block', marginBottom: 4 }}>Name</label>
              <input data-testid="input-template-name" value={tplName} onChange={e => setTplName(e.target.value)}
                placeholder="My template" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: colors.textMuted, display: 'block', marginBottom: 4 }}>Tool</label>
              <select data-testid="select-template-tool" value={tplTool} onChange={e => setTplTool(e.target.value)}
                style={inputStyle}>
                {tools.filter(t => !t.locked).map(t => (
                  <option key={t.type} value={t.type}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: colors.textMuted, display: 'block', marginBottom: 4 }}>Description</label>
            <input data-testid="input-template-desc" value={tplDesc} onChange={e => setTplDesc(e.target.value)}
              placeholder="What this template does" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: colors.textMuted, display: 'block', marginBottom: 4 }}>
              Prompt Text <span style={{ color: colors.textDim }}>(use {'{{input}}'} for dynamic content)</span>
            </label>
            <textarea data-testid="input-template-prompt" value={tplPrompt} onChange={e => setTplPrompt(e.target.value)}
              placeholder={'Summarize the following in 3 bullet points:\n\n{{input}}'}
              rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <button data-testid="button-save-template" onClick={onSave} disabled={tplSaving || !tplName.trim() || !tplPrompt.trim()}
            style={{
              padding: '8px 20px', borderRadius: 8, border: 'none',
              background: tplSaving || !tplName.trim() || !tplPrompt.trim() ? colors.bgHover : colors.accent,
              color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
            {tplSaving ? 'Saving...' : 'Save Template'}
          </button>
        </div>
      )}

      {templates.length === 0 && !showForm ? (
        <div style={{
          textAlign: 'center', padding: '60px 20px',
          background: colors.bgSecondary, borderRadius: 16,
          border: `1px solid ${colors.border}`,
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ color: colors.textMuted, fontSize: 14 }}>No templates yet. Create your first reusable prompt template.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {templates.map(tpl => (
            <div key={tpl.id} data-testid={`template-${tpl.id}`}
              style={{
                background: colors.bgSecondary, border: `1px solid ${colors.border}`,
                borderRadius: 12, padding: 20,
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{tpl.name}</div>
                <div style={{ fontSize: 10, color: colors.textDim, background: colors.bgHover, padding: '2px 8px', borderRadius: 4 }}>
                  {tools.find(t => t.type === tpl.toolType)?.name || tpl.toolType}
                </div>
              </div>
              {tpl.description && (
                <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 8 }}>{tpl.description}</div>
              )}
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 12 }}>
                Used {tpl.usageCount} time{tpl.usageCount !== 1 ? 's' : ''}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button data-testid={`button-use-template-${tpl.id}`}
                  onClick={() => onUse(tpl)}
                  style={{
                    flex: 1, padding: '6px 12px', borderRadius: 6, border: 'none',
                    background: colors.accent, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}>Use</button>
                <button data-testid={`button-delete-template-${tpl.id}`}
                  onClick={() => onDelete(tpl.id)}
                  style={{
                    padding: '6px 12px', borderRadius: 6, border: `1px solid ${colors.border}`,
                    background: 'transparent', color: '#f85149', fontSize: 12, cursor: 'pointer',
                  }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryPanel({ history }: { history: HistoryItem[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (history.length === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: '60px 20px',
        background: colors.bgSecondary, borderRadius: 16,
        border: `1px solid ${colors.border}`,
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🕐</div>
        <div style={{ color: colors.textMuted, fontSize: 14 }}>No AI actions yet. Try using a tool to get started.</div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    success: colors.accentGreen,
    error: '#f85149',
    rate_limited: colors.accentYellow,
  };

  return (
    <div>
      <div style={{ fontSize: 14, color: colors.textMuted, marginBottom: 16 }}>{history.length} recent actions</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {history.map(item => (
          <div key={item.id} data-testid={`history-${item.id}`}
            onClick={() => setExpanded(expanded === item.id ? null : item.id)}
            style={{
              background: colors.bgSecondary, border: `1px solid ${colors.border}`,
              borderRadius: 10, padding: '14px 18px', cursor: 'pointer',
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = colors.accent + '44'}
            onMouseLeave={e => e.currentTarget.style.borderColor = colors.border}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: statusColors[item.status] || colors.textDim,
                }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{item.toolName}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: colors.textDim }}>
                <span>{item.tokenCount} tokens</span>
                <span>{(item.durationMs / 1000).toFixed(1)}s</span>
                <span>{new Date(item.createdAt).toLocaleString()}</span>
              </div>
            </div>
            <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: expanded === item.id ? 'pre-wrap' : 'nowrap' }}>
              {item.input}
            </div>
            {expanded === item.id && item.outputPreview && (
              <div style={{
                marginTop: 12, padding: '12px 14px', borderRadius: 8,
                background: colors.bg, border: `1px solid ${colors.border}`,
                fontSize: 12, color: colors.text, lineHeight: 1.6, whiteSpace: 'pre-wrap',
              }}>
                {item.outputPreview}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function UsagePanel({ usage, tools }: { usage: UsageStats | null; tools: AiTool[] }) {
  if (!usage) return null;

  const gaugeColor = (pct: number) =>
    pct > 90 ? '#f85149' : pct > 70 ? colors.accentYellow : colors.accent;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 32 }}>
        <StatCard label="AI Credits Used" value={`${usage.monthly.used} / ${usage.monthly.limit >= 9999 ? '∞' : usage.monthly.limit}`} pct={usage.monthly.percentage} color={gaugeColor(usage.monthly.percentage)} />
        <StatCard label="Total Actions" value={String(usage.stats.totalActions)} />
        <StatCard label="Success Rate" value={usage.stats.totalActions > 0 ? `${Math.round((usage.stats.successActions / usage.stats.totalActions) * 100)}%` : '—'} />
        <StatCard label="Tokens Used" value={usage.stats.totalTokens.toLocaleString()} />
      </div>

      <h3 style={{ fontSize: 14, fontWeight: 600, color: '#fff', margin: '0 0 16px' }}>Usage by Tool</h3>
      <div style={{
        background: colors.bgSecondary, border: `1px solid ${colors.border}`,
        borderRadius: 12, overflow: 'hidden',
      }}>
        {tools.filter(t => !t.locked).map((tool, i) => {
          const count = usage.stats.byTool[tool.type] || 0;
          const maxCount = Math.max(...Object.values(usage.stats.byTool), 1);
          return (
            <div key={tool.type} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
              borderBottom: i < tools.length - 1 ? `1px solid ${colors.border}` : 'none',
            }}>
              <span style={{ fontSize: 18 }}>{tool.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#fff' }}>{tool.name}</div>
                <div style={{
                  marginTop: 4, height: 4, borderRadius: 2, background: colors.bgHover,
                }}>
                  <div style={{
                    width: `${(count / maxCount) * 100}%`,
                    height: '100%', borderRadius: 2, background: colors.accent,
                    transition: 'width 0.3s',
                  }} />
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', minWidth: 30, textAlign: 'right' }}>{count}</div>
            </div>
          );
        })}
      </div>

      <div style={{
        marginTop: 20, padding: '14px 18px', borderRadius: 10,
        background: colors.bgSecondary, border: `1px solid ${colors.border}`,
        display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
      }}>
        <span style={{ fontSize: 16 }}>🔌</span>
        <span style={{ color: colors.textMuted }}>Provider:</span>
        <span style={{ color: '#fff', fontWeight: 600 }}>{usage.provider.name === 'openai' ? 'OpenAI GPT-4o Mini' : 'Mock (Demo Mode)'}</span>
        {!usage.provider.configured && (
          <span style={{ color: colors.accentYellow, fontSize: 11 }}> — Add OPENAI_API_KEY for live AI</span>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, pct, color }: { label: string; value: string; pct?: number; color?: string }) {
  return (
    <div style={{
      background: colors.bgSecondary, border: `1px solid ${colors.border}`,
      borderRadius: 12, padding: 20,
    }}>
      <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{value}</div>
      {pct !== undefined && (
        <div style={{ marginTop: 8, height: 6, borderRadius: 3, background: colors.bgHover }}>
          <div style={{
            width: `${Math.min(pct, 100)}%`, height: '100%', borderRadius: 3,
            background: color || colors.accent, transition: 'width 0.3s',
          }} />
        </div>
      )}
    </div>
  );
}

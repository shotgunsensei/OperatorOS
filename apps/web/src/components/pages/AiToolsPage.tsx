'use client';

import { colors } from '../SaasLayout';
import { useToast } from '../Toast';

const tools = [
  { name: 'Content Generator', desc: 'Generate blog posts, emails, and marketing copy with AI assistance', icon: '\u270d\ufe0f', available: true, category: 'Writing' },
  { name: 'Data Analyzer', desc: 'Upload datasets and get AI-powered insights, charts, and summaries', icon: '\ud83d\udcca', available: true, category: 'Analytics' },
  { name: 'Code Assistant', desc: 'Get AI help with code reviews, refactoring, and generation', icon: '\u2328\ufe0f', available: true, category: 'Development' },
  { name: 'Document Summarizer', desc: 'Summarize long documents, articles, and reports into key points', icon: '\ud83d\udccb', available: false, category: 'Writing' },
  { name: 'Image Generator', desc: 'Create images and graphics from text descriptions', icon: '\ud83d\uddbc\ufe0f', available: false, category: 'Creative' },
  { name: 'Workflow Automator', desc: 'Build automated workflows with AI-powered triggers and actions', icon: '\u26a1', available: false, category: 'Automation' },
];

export default function AiToolsPage() {
  const { toast } = useToast();

  return (
    <div style={{ padding: 'clamp(16px, 3vw, 40px)', maxWidth: 1200 }} data-testid="ai-tools-page">
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>AI Tools</h1>
      <p style={{ fontSize: 14, color: colors.textMuted, margin: '0 0 32px' }}>AI-powered tools to supercharge your operations</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {tools.map(tool => (
          <div key={tool.name} data-testid={`ai-tool-${tool.name.toLowerCase().replace(/\s+/g, '-')}`}
            style={{
              background: colors.bgSecondary, border: `1px solid ${colors.border}`,
              borderRadius: 12, padding: 24, position: 'relative',
              opacity: tool.available ? 1 : 0.6,
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={e => { if (tool.available) e.currentTarget.style.borderColor = colors.accent; }}
            onMouseLeave={e => e.currentTarget.style.borderColor = colors.border}
          >
            {!tool.available && (
              <div style={{
                position: 'absolute', top: 12, right: 12,
                fontSize: 10, padding: '2px 8px', borderRadius: 4,
                background: `${colors.accentPurple}22`, color: colors.accentPurple,
                fontWeight: 600, letterSpacing: '0.03em',
              }}>Coming soon</div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10,
                background: tool.available ? 'rgba(88,166,255,0.1)' : colors.bgHover,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
              }}>{tool.icon}</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{tool.name}</div>
                <div style={{ fontSize: 11, color: colors.textDim }}>{tool.category}</div>
              </div>
            </div>
            <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: 16, lineHeight: 1.5 }}>{tool.desc}</div>
            <button
              data-testid={`button-launch-${tool.name.toLowerCase().replace(/\s+/g, '-')}`}
              onClick={() => {
                if (tool.available) toast('AI tool launched', 'info');
                else toast('You\'ll be notified when this tool is available', 'info');
              }}
              style={{
                width: '100%', padding: '10px', borderRadius: 8, border: 'none',
                background: tool.available ? colors.accent : colors.bgHover,
                color: tool.available ? '#fff' : colors.textDim,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                transition: 'background 0.15s',
              }}
            >{tool.available ? 'Launch' : 'Notify me'}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

'use client';

import { colors } from '../SaasLayout';

const tools = [
  { name: 'Content Generator', desc: 'Generate blog posts, emails, and marketing copy', icon: '✍', available: true },
  { name: 'Data Analyzer', desc: 'Analyze datasets and generate insights', icon: '📊', available: true },
  { name: 'Code Assistant', desc: 'Get AI help with code reviews and generation', icon: '⌨', available: true },
  { name: 'Document Summarizer', desc: 'Summarize long documents into key points', icon: '📋', available: false },
  { name: 'Image Generator', desc: 'Create images from text descriptions', icon: '🖼', available: false },
  { name: 'Workflow Automator', desc: 'Build automated workflows with AI', icon: '⚡', available: false },
];

export default function AiToolsPage() {
  return (
    <div style={{ padding: '32px 40px', maxWidth: 1200 }} data-testid="ai-tools-page">
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>AI Tools</h1>
      <p style={{ fontSize: 14, color: colors.textMuted, margin: '0 0 32px' }}>AI-powered tools to supercharge your operations</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {tools.map(tool => (
          <div key={tool.name} data-testid={`ai-tool-${tool.name.toLowerCase().replace(/\s+/g, '-')}`}
            style={{
              background: colors.bgSecondary, border: `1px solid ${colors.border}`,
              borderRadius: 12, padding: 24,
              opacity: tool.available ? 1 : 0.5,
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, background: colors.bgHover,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
              }}>{tool.icon}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{tool.name}</div>
                {!tool.available && (
                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: `${colors.accentYellow}22`, color: colors.accentYellow }}>Coming soon</span>
                )}
              </div>
            </div>
            <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: 16 }}>{tool.desc}</div>
            <button
              disabled={!tool.available}
              style={{
                width: '100%', padding: '8px', borderRadius: 8, border: 'none',
                background: tool.available ? colors.accent : colors.bgHover,
                color: tool.available ? '#fff' : colors.textDim,
                fontSize: 13, fontWeight: 500, cursor: tool.available ? 'pointer' : 'default',
              }}
            >{tool.available ? 'Launch' : 'Locked'}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

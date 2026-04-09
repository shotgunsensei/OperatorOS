export interface AiCompletionRequest {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AiCompletionResponse {
  text: string;
  tokenCount: number;
  durationMs: number;
}

export interface AiProvider {
  name: string;
  complete(request: AiCompletionRequest): Promise<AiCompletionResponse>;
}

export class OpenAiProvider implements AiProvider {
  name = 'openai';
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-4o-mini') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    const start = Date.now();
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: request.userPrompt },
        ],
        max_tokens: request.maxTokens || 2000,
        temperature: request.temperature ?? 0.7,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 429 || errText.includes('insufficient_quota')) {
        console.warn('[OpenAI] Quota exceeded, falling back to mock provider');
        const mock = new MockAiProvider();
        return mock.complete(request);
      }
      throw new Error(`OpenAI API error ${res.status}: ${errText}`);
    }

    const data = await res.json() as any;
    const text = data.choices?.[0]?.message?.content || '';
    const tokenCount = data.usage?.total_tokens || 0;

    return {
      text,
      tokenCount,
      durationMs: Date.now() - start,
    };
  }
}

export class MockAiProvider implements AiProvider {
  name = 'mock';

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    const start = Date.now();
    await new Promise(r => setTimeout(r, 300));

    const toolType = this.detectToolType(request.systemPrompt);
    const text = this.generateMockResponse(toolType, request.userPrompt);

    return {
      text,
      tokenCount: Math.floor(text.length / 4),
      durationMs: Date.now() - start,
    };
  }

  private detectToolType(systemPrompt: string): string {
    if (systemPrompt.includes('summarize')) return 'summarizer';
    if (systemPrompt.includes('break down') || systemPrompt.includes('task')) return 'task_breakdown';
    if (systemPrompt.includes('action plan') || systemPrompt.includes('project plan')) return 'project_planner';
    return 'quick_action';
  }

  private generateMockResponse(toolType: string, userPrompt: string): string {
    const input = userPrompt.substring(0, 80);

    switch (toolType) {
      case 'summarizer':
        return `## Summary\n\nKey points from the provided content:\n\n1. **Main theme**: The content discusses important operational aspects\n2. **Key findings**: Several actionable items were identified\n3. **Recommendations**: Consider prioritizing the most impactful changes\n\n### Action Items\n- Review the highlighted priorities\n- Schedule follow-up discussions\n- Document decisions made`;

      case 'task_breakdown':
        return `## Task Breakdown\n\nBased on: "${input}..."\n\n### Sub-tasks:\n1. **Research & Analysis** (Priority: High)\n   - Gather requirements and constraints\n   - Review existing solutions\n   - Estimated: 2 hours\n\n2. **Implementation** (Priority: High)\n   - Set up the foundation\n   - Build core functionality\n   - Estimated: 4 hours\n\n3. **Testing & Validation** (Priority: Medium)\n   - Write test cases\n   - Validate edge cases\n   - Estimated: 2 hours\n\n4. **Documentation & Handoff** (Priority: Low)\n   - Update documentation\n   - Create handoff notes\n   - Estimated: 1 hour`;

      case 'project_planner':
        return `## Project Action Plan\n\nFor: "${input}..."\n\n### Phase 1: Discovery (Week 1)\n- Define success criteria\n- Identify stakeholders\n- Map dependencies\n\n### Phase 2: Execution (Weeks 2-3)\n- Sprint 1: Core infrastructure\n- Sprint 2: Feature development\n- Daily standups and blockers review\n\n### Phase 3: Launch (Week 4)\n- QA and testing cycle\n- Stakeholder review\n- Go-live checklist\n\n### Risks & Mitigations\n| Risk | Likelihood | Mitigation |\n|------|-----------|------------|\n| Scope creep | Medium | Strict change control |\n| Resource constraints | Low | Cross-training plan |`;

      default:
        return `## AI Assistant Response\n\nBased on your request: "${input}..."\n\n### Suggestions:\n1. Start by breaking this into smaller, manageable pieces\n2. Identify the highest-impact items first\n3. Set clear deadlines for each milestone\n4. Consider automating repetitive steps\n\n### Next Steps:\n- Create a workspace for this initiative\n- Assign team members to key areas\n- Schedule a kickoff meeting`;
    }
  }
}

let currentProvider: AiProvider | null = null;

export function getAiProvider(): AiProvider {
  if (currentProvider) return currentProvider;

  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    currentProvider = new OpenAiProvider(apiKey);
  } else {
    currentProvider = new MockAiProvider();
  }

  return currentProvider;
}

export function getProviderInfo(): { name: string; configured: boolean } {
  const apiKey = process.env.OPENAI_API_KEY;
  return {
    name: apiKey ? 'openai' : 'mock',
    configured: !!apiKey,
  };
}

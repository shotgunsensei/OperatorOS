export interface AiCompletionRequest {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: 'text' | 'json';
  timeoutMs?: number;
}

export interface AiCompletionResponse {
  text: string;
  tokenCount: number;
  durationMs: number;
  provider: string;
  model: string;
  version: string;
}

export interface AiProvider {
  name: string;
  complete(request: AiCompletionRequest): Promise<AiCompletionResponse>;
}

export class AiProviderDisabledError extends Error {
  readonly code = 'AI_PROVIDER_DISABLED';
  constructor() {
    super('AI provider is disabled');
    this.name = 'AiProviderDisabledError';
  }
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
        ...(request.responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: AbortSignal.timeout(Math.max(1_000, Math.min(30_000, request.timeoutMs ?? 30_000))),
    });

    if (!res.ok) {
      const error = new Error('OpenAI provider request failed') as Error & { code?: string };
      error.code = `OPENAI_HTTP_${res.status}`;
      throw error;
    }

    const data = await res.json() as any;
    const text = data.choices?.[0]?.message?.content || '';
    if (!text) {
      throw Object.assign(new Error('OpenAI provider response did not include content'), {
        code: 'OPENAI_RESPONSE_INVALID',
      });
    }
    const tokenCount = data.usage?.total_tokens || 0;

    return {
      text,
      tokenCount,
      durationMs: Date.now() - start,
      provider: this.name,
      model: this.model,
      version: 'chat-completions-v1',
    };
  }
}

export class MockAiProvider implements AiProvider {
  name = 'test';

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    const start = Date.now();
    const toolType = this.detectToolType(request.systemPrompt);
    const text = toolType === 'torque_assist'
      ? this.generateTorqueAssistResponse(request.userPrompt)
      : toolType === 'brandforge'
        ? this.generateBrandForgeResponse(request.userPrompt)
        : toolType === 'studyforge'
          ? this.generateStudyForgeResponse(request.userPrompt)
          : toolType === 'ninja_launch_kit'
            ? this.generateNinjaLaunchKitResponse(request.userPrompt)
            : toolType === 'ninjamation'
              ? this.generateNinjamationResponse(request.userPrompt)
      : this.generateMockResponse(toolType, request.userPrompt);

    return {
      text,
      tokenCount: Math.max(
        1,
        Math.ceil((request.systemPrompt.length + request.userPrompt.length + text.length) / 4),
      ),
      durationMs: Date.now() - start,
      provider: this.name,
      model: 'operatoros-deterministic-torque-v1',
      version: 'deterministic-v1',
    };
  }

  private detectToolType(systemPrompt: string): string {
    if (systemPrompt.includes('OPERATOROS_TORQUE_ASSIST_V1')) return 'torque_assist';
    if (systemPrompt.includes('OPERATOROS_BRANDFORGE_V1')) return 'brandforge';
    if (systemPrompt.includes('OPERATOROS_STUDYFORGE_V1')) return 'studyforge';
    if (systemPrompt.includes('OPERATOROS_NINJA_LAUNCH_KIT_V1')) return 'ninja_launch_kit';
    if (systemPrompt.includes('OPERATOROS_NINJAMATION_V1')) return 'ninjamation';
    if (systemPrompt.includes('summarize')) return 'summarizer';
    if (systemPrompt.includes('break down') || systemPrompt.includes('task')) return 'task_breakdown';
    if (systemPrompt.includes('action plan') || systemPrompt.includes('project plan')) return 'project_planner';
    return 'quick_action';
  }

  private generateBrandForgeResponse(userPrompt: string): string {
    let input: Record<string, unknown> = {};
    try {
      input = JSON.parse(userPrompt) as Record<string, unknown>;
    } catch {
      input = {};
    }
    const type = input.type;
    const prompt = String(input.prompt ?? 'Untitled campaign').slice(0, 120);
    if (type === 'copy') {
      return JSON.stringify({
        variants: [
          { title: 'Clear value proposition', content: `${prompt}\n\nBuilt for operators who value clarity, control, and measurable follow-through.` },
          { title: 'Outcome-led message', content: `${prompt}\n\nMove from scattered work to a focused campaign your team can actually ship.` },
          { title: 'Direct response angle', content: `${prompt}\n\nStart with the next concrete action and turn attention into qualified momentum.` },
        ],
      });
    }
    if (type === 'strategy') {
      return JSON.stringify({
        title: 'Focused campaign strategy',
        content: `Position the offer around the concrete outcome described in: ${prompt}`,
        suggestions: [
          'Define one primary audience segment.',
          'Choose one measurable conversion event.',
          'Match the message to the highest-intent channel.',
          'Create two controlled copy variants.',
          'Review persisted performance before expanding spend.',
        ],
      });
    }
    return JSON.stringify({
      ideas: [
        { name: 'Proof-led launch', objective: prompt, channels: ['Email', 'LinkedIn'], description: 'Lead with a concrete before-and-after outcome.' },
        { name: 'Operator field guide', objective: prompt, channels: ['Content', 'Email'], description: 'Teach the workflow and connect it to the offer.' },
        { name: 'Focused retargeting', objective: prompt, channels: ['Ads', 'Social'], description: 'Re-engage high-intent visitors with one direct CTA.' },
      ],
    });
  }

  private generateStudyForgeResponse(userPrompt: string): string {
    let input: Record<string, unknown> = {};
    try {
      input = JSON.parse(userPrompt) as Record<string, unknown>;
    } catch {
      input = {};
    }
    const source = String(input.source ?? '').trim();
    const type = String(input.type ?? 'deck');
    const sentences = source
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length >= 8)
      .slice(0, 5);
    const evidence = sentences.length ? sentences : [source.slice(0, 500)];
    if (type === 'quiz') {
      return JSON.stringify({
        questions: evidence.slice(0, 3).map((excerpt, index) => ({
          question: `Which statement is supported by source passage ${index + 1}?`,
          choices: [excerpt, 'This option is not stated in the supplied source.'],
          correctIndex: 0,
          explanation: 'The first choice is the exact learner-supplied source passage.',
          sourceExcerpt: excerpt,
        })),
      });
    }
    if (type === 'study_plan') {
      return JSON.stringify({
        sessions: evidence.slice(0, 5).map((excerpt, index) => ({
          title: `Source review ${index + 1}`,
          focus: `Review and recall: ${excerpt}`,
          estimatedMinutes: 20,
        })),
      });
    }
    return JSON.stringify({
      cards: evidence.map((excerpt, index) => ({
        question: `What does source passage ${index + 1} state?`,
        answer: excerpt,
        sourceExcerpt: excerpt,
      })),
    });
  }

  private generateNinjaLaunchKitResponse(userPrompt: string): string {
    let input: Record<string, unknown> = {};
    try {
      input = JSON.parse(userPrompt) as Record<string, unknown>;
    } catch {
      input = {};
    }
    const title = String(input.title ?? 'New launch').slice(0, 180);
    const audience = String(input.audience ?? 'the defined audience').slice(0, 300);
    const offer = String(input.offer ?? 'the launch offer').slice(0, 300);
    const channels = Array.isArray(input.channels)
      ? input.channels.map(String).slice(0, 8).join(', ')
      : 'the selected channels';
    const visualNames = [
      'Facebook ad', 'Instagram square', 'Instagram story', 'Website hero',
      'Flyer', 'QR poster', 'Logo direction', 'Brand colors', 'Font styles',
    ];
    return JSON.stringify({
      artifacts: [
        {
          kind: 'landing',
          title: `${title} landing page`,
          body: `Headline: ${title}\nAudience: ${audience}\nOffer: ${offer}\nPrimary CTA: Review the offer and choose the next step.`,
        },
        {
          kind: 'ads',
          title: `${title} paid ad set`,
          body: `Facebook concept: Introduce ${offer} to ${audience}.\nGoogle concept: Match high-intent searches to a clear ${title} landing page.\nAll claims require owner review before publication.`,
        },
        {
          kind: 'email_sms',
          title: `${title} email and SMS`,
          body: `Email subject: ${title} is ready for review\nEmail body: Explain ${offer}, its intended audience, and one direct CTA.\nSMS: ${title}: review the offer and launch details at the approved destination.`,
        },
        {
          kind: 'social',
          title: `${title} social sequence`,
          body: `Post 1: Name the problem for ${audience}.\nPost 2: Explain how ${offer} addresses it.\nPost 3: Invite the audience to the approved launch destination.\nChannels: ${channels}.`,
        },
        {
          kind: 'faq',
          title: `${title} FAQ`,
          body: `Who is this for?\n${audience}\n\nWhat is offered?\n${offer}\n\nWhere can I learn more?\nUse the owner-approved launch destination.`,
        },
        {
          kind: 'qr_flyer',
          title: `${title} flyer and QR copy`,
          body: `${title}\n${offer}\nScan the owner-provided QR code to visit the approved launch destination.\nThis artifact supplies copy only; it does not claim a QR code was generated.`,
        },
        {
          kind: 'visual_briefs',
          title: `${title} visual creative briefs`,
          body: visualNames.map((name, index) => `${index + 1}. ${name}: communicate ${title} for ${audience}; use only approved brand assets and claims.`).join('\n'),
        },
        {
          kind: 'launch_checklist',
          title: `${title} launch checklist`,
          body: [
            'Confirm the audience, problem, positioning, offer, price, channels, and target date.',
            'Review every generated artifact for accuracy and brand fit.',
            'Validate destination links, tracking, consent, and required disclosures.',
            'Approve final assets and complete every required launch task.',
          ].join('\n'),
        },
      ],
    });
  }

  private generateNinjamationResponse(userPrompt: string): string {
    let input: Record<string, unknown> = {};
    try {
      input = JSON.parse(userPrompt) as Record<string, unknown>;
    } catch {
      input = {};
    }
    const language = String(input.language ?? 'powershell');
    const requestedName = String(input.requestedName ?? '').trim();
    const prompt = String(input.prompt ?? 'Perform a documented local maintenance task')
      .replaceAll(/\s+/g, ' ')
      .slice(0, 180);
    const name = requestedName || `Safe ${language} automation`;
    const contentByLanguage: Record<string, string> = {
      powershell: [
        '[CmdletBinding(SupportsShouldProcess)]',
        'param([Parameter(Mandatory)][string]$TargetPath)',
        '$ErrorActionPreference = "Stop"',
        'if (-not (Test-Path -LiteralPath $TargetPath)) { throw "Target path does not exist." }',
        `Write-Output "Planned task: ${prompt.replaceAll('"', "'")}"`,
        'Get-Item -LiteralPath $TargetPath | Select-Object FullName, Length, LastWriteTime',
      ].join('\n'),
      python: [
        'from pathlib import Path',
        'import argparse',
        '',
        'parser = argparse.ArgumentParser()',
        'parser.add_argument("target_path")',
        'args = parser.parse_args()',
        'target = Path(args.target_path).expanduser().resolve()',
        'if not target.exists():',
        '    raise FileNotFoundError("Target path does not exist.")',
        `print("Planned task: ${prompt.replaceAll('"', "'")}")`,
        'print(target)',
      ].join('\n'),
      batch: [
        '@echo off',
        'setlocal EnableExtensions DisableDelayedExpansion',
        'if "%~1"=="" (echo Usage: %~nx0 TARGET_PATH& exit /b 2)',
        'if not exist "%~1" (echo Target path does not exist.& exit /b 3)',
        `echo Planned task: ${prompt.replaceAll(/[&|<>^]/g, '')}`,
        'dir /a "%~1"',
      ].join('\n'),
      bash: [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        'target_path="${1:?Usage: script TARGET_PATH}"',
        '[[ -e "$target_path" ]] || { echo "Target path does not exist." >&2; exit 3; }',
        `printf '%s\\n' 'Planned task: ${prompt.replaceAll("'", '')}'`,
        'ls -ld -- "$target_path"',
      ].join('\n'),
    };
    return JSON.stringify({
      name,
      description: `Defensive ${language} draft for: ${prompt}`,
      content: contentByLanguage[language] ?? contentByLanguage.powershell,
    });
  }

  private generateTorqueAssistResponse(userPrompt: string): string {
    let context: any = {};
    try {
      context = JSON.parse(userPrompt)?.diagnosticContext ?? {};
    } catch {
      context = {};
    }
    const codes = Array.isArray(context.codes) ? context.codes : [];
    const entries = Array.isArray(context.entries) ? context.entries : [];
    const evidence = [...codes, ...entries];
    const needsFollowUp = evidence.length === 0;
    const concern = String(context.diagnostic?.customerConcern || 'the reported concern').slice(
      0,
      300,
    );
    const code = codes[0]?.code ? String(codes[0].code) : null;
    const measurement = entries.find((entry: any) => entry.kind === 'measurement');
    return JSON.stringify({
      status: needsFollowUp ? 'follow_up_required' : 'plan_ready',
      summary: needsFollowUp
        ? 'More observed evidence is needed before ranking a useful diagnostic plan.'
        : 'The available evidence supports a test-first plan while every cause remains provisional.',
      facts: [
        { source: 'user_entered', statement: `Reported concern: ${concern}` },
        ...(code ? [{ source: 'observed', statement: `Recorded trouble code: ${code}` }] : []),
        ...(measurement
          ? [
              {
                source: 'observed',
                statement:
                  `Recorded measurement: ${String(measurement.title || 'measurement')} ${String(measurement.valueNumeric ?? measurement.valueText ?? '')} ${String(measurement.unit ?? '')}`.trim(),
              },
            ]
          : []),
      ],
      assumptions: [
        'Recorded observations and units are accurate and were captured under the stated conditions.',
      ],
      hypotheses: needsFollowUp
        ? []
        : [
            {
              rank: 1,
              description: code
                ? `A system condition associated with ${code} may explain the concern.`
                : 'The measured system may be operating outside its expected range.',
              confidence: 'low',
              supportingEvidence: evidence
                .slice(0, 3)
                .map((item: any) =>
                  String(item.code || item.title || item.kind || 'Recorded evidence'),
                ),
              contradictingEvidence: ['No independent repeat test has been recorded yet.'],
            },
          ],
      safetyWarnings: [
        {
          category: 'general-shop-safety',
          warning: 'Use approved service information, PPE, stable support, and ventilation.',
          escalation:
            'Stop and consult a qualified technician if hazards or required procedures are uncertain.',
        },
      ],
      recommendedTests: needsFollowUp
        ? []
        : [
            {
              priority: 1,
              title: 'Repeat and validate the recorded evidence',
              rationale: 'A repeatable observation is required before narrowing the cause.',
              procedure:
                'Use the manufacturer test procedure and calibrated tooling to repeat the observation under the same conditions.',
              stopConditions: [
                'Stop for unsafe vehicle behavior, leaks, overheating, electrical hazards, or unstable support.',
              ],
            },
            {
              priority: 2,
              title: 'Compare related inputs and outputs',
              rationale:
                'Correlated data can distinguish a sensor/reporting issue from a mechanical or electrical condition.',
              procedure:
                'Capture related scan data and direct measurements, then compare them with service-information ranges.',
              stopConditions: [
                'Do not bypass protection devices or probe high-energy circuits without the specified procedure.',
              ],
            },
          ],
      followUpQuestions: needsFollowUp
        ? [
            'Which warning lights or trouble codes are present, including pending and history codes?',
            'Under what speed, load, temperature, and operating conditions does the concern occur?',
            'What measurements or visual inspection results have already been recorded?',
          ]
        : [],
    });
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

export class DisabledAiProvider implements AiProvider {
  name = 'disabled';
  async complete(): Promise<AiCompletionResponse> {
    throw new AiProviderDisabledError();
  }
}

let currentProvider: AiProvider | null = null;
let currentProviderKey = '';

export function getAiProvider(): AiProvider {
  const apiKey = process.env.OPENAI_API_KEY;
  const testEnvironment = process.env.NODE_ENV === 'test' || process.env.APP_ENV === 'test';
  const providerKey = apiKey ? `openai:${process.env.OPENAI_MODEL || 'gpt-4o-mini'}` : (testEnvironment ? 'test' : 'disabled');
  if (currentProvider && currentProviderKey === providerKey) return currentProvider;

  if (apiKey) {
    currentProvider = new OpenAiProvider(apiKey);
  } else if (testEnvironment) {
    currentProvider = new MockAiProvider();
  } else {
    currentProvider = new DisabledAiProvider();
  }
  currentProviderKey = providerKey;
  return currentProvider;
}

export function getProviderInfo(): { name: 'openai' | 'test' | 'disabled'; configured: boolean } {
  const apiKey = process.env.OPENAI_API_KEY;
  const testEnvironment = process.env.NODE_ENV === 'test' || process.env.APP_ENV === 'test';
  return {
    name: apiKey ? 'openai' : (testEnvironment ? 'test' : 'disabled'),
    configured: !!apiKey,
  };
}

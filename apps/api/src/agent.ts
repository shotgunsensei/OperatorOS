import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';

const AGENT_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file in the workspace',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Relative file path from workspace root' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'apply_patch',
      description: 'Apply a unified diff patch to the workspace files',
      parameters: {
        type: 'object',
        properties: { diff: { type: 'string', description: 'Unified diff content' } },
        required: ['diff'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_verify',
      description: 'Run the verification pipeline (install, lint, typecheck, test) and get results',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'exec',
      description: 'Run a shell command in the workspace. Only safe commands allowed (npm, pnpm, node, python, pytest, go, dotnet, cat, head, tail, grep, find, ls, pwd, echo).',
      parameters: {
        type: 'object',
        properties: {
          cmd: { type: 'string', description: 'Shell command to execute' },
        },
        required: ['cmd'],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are a Junior Developer Agent working inside a code workspace. Your goal is to fix issues by reading files, applying patches, and running verification.

Rules:
- You can ONLY modify files through unified diff patches (apply_patch tool)
- Always run run_verify first to understand what's failing
- Read relevant files to understand the codebase before making changes
- Apply minimal, targeted patches — don't rewrite entire files
- After applying a patch, run run_verify again to check if it fixed the issue
- If verify passes (all checks green), you're done
- Be methodical: understand the error, find the file, propose a fix, verify
- Keep patches under 20KB
- You have a limited number of iterations — be efficient`;

export interface AgentBudget {
  maxIterations: number;
  maxPatchKB: number;
  maxTotalTokens: number;
}

export interface AgentEvent {
  type: 'LLM_THOUGHT_SUMMARY' | 'TOOL_CALL' | 'TOOL_RESULT' | 'VERIFY_RESULT' | 'PATCH_APPLIED' | 'DONE' | 'ERROR';
  payload: Record<string, unknown>;
}

export type ToolHandler = (name: string, args: Record<string, unknown>) => Promise<{ success: boolean; output: string; changedFiles?: string[] }>;

const DEFAULT_BUDGET: AgentBudget = {
  maxIterations: 12,
  maxPatchKB: 20,
  maxTotalTokens: 200000,
};

export async function runAgentLoop(
  goal: string,
  profileId: string,
  budget: Partial<AgentBudget>,
  onEvent: (event: AgentEvent) => Promise<void>,
  executeTool: ToolHandler,
): Promise<{ success: boolean; iterations: number; totalTokens: number; changedFiles: string[] }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    await onEvent({ type: 'ERROR', payload: { error: 'OPENAI_API_KEY not configured' } });
    return { success: false, iterations: 0, totalTokens: 0, changedFiles: [] };
  }

  const openai = new OpenAI({ apiKey });
  const limits = { ...DEFAULT_BUDGET, ...budget };
  let totalTokens = 0;
  let iterations = 0;
  const changedFiles = new Set<string>();

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Goal: ${goal}\n\nProfile: ${profileId}\n\nStart by running run_verify to see the current state of the codebase.` },
  ];

  while (iterations < limits.maxIterations) {
    iterations++;

    if (totalTokens >= limits.maxTotalTokens) {
      await onEvent({ type: 'ERROR', payload: { error: 'Token budget exhausted', totalTokens, limit: limits.maxTotalTokens } });
      break;
    }

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
        tools: AGENT_TOOLS,
        tool_choice: 'auto',
        max_tokens: 4096,
        temperature: 0.2,
      });

      const usage = response.usage;
      if (usage) totalTokens += usage.total_tokens;

      const choice = response.choices[0];
      if (!choice) {
        await onEvent({ type: 'ERROR', payload: { error: 'No response from LLM' } });
        break;
      }

      const assistantMsg = choice.message;
      messages.push(assistantMsg);

      if (assistantMsg.content) {
        const summary = assistantMsg.content.length > 500
          ? assistantMsg.content.slice(0, 500) + '...'
          : assistantMsg.content;
        await onEvent({ type: 'LLM_THOUGHT_SUMMARY', payload: { summary, iteration: iterations, tokens: totalTokens } });
      }

      if (choice.finish_reason === 'stop' && !assistantMsg.tool_calls?.length) {
        await onEvent({ type: 'DONE', payload: { reason: 'Agent finished', iterations, totalTokens, changedFiles: [...changedFiles] } });
        return { success: true, iterations, totalTokens, changedFiles: [...changedFiles] };
      }

      if (!assistantMsg.tool_calls?.length) {
        await onEvent({ type: 'DONE', payload: { reason: 'No more tool calls', iterations, totalTokens, changedFiles: [...changedFiles] } });
        return { success: changedFiles.size > 0, iterations, totalTokens, changedFiles: [...changedFiles] };
      }

      for (const toolCall of assistantMsg.tool_calls) {
        const fnName = toolCall.function.name;
        let fnArgs: Record<string, unknown> = {};
        try {
          fnArgs = JSON.parse(toolCall.function.arguments);
        } catch { /* empty args */ }

        await onEvent({ type: 'TOOL_CALL', payload: { tool: fnName, args: fnArgs, iteration: iterations } });

        const result = await executeTool(fnName, fnArgs);

        if (fnName === 'apply_patch' && result.success) {
          if (result.changedFiles) result.changedFiles.forEach((f) => changedFiles.add(f));
          await onEvent({ type: 'PATCH_APPLIED', payload: { changedFiles: result.changedFiles ?? [], output: result.output } });
        }

        if (fnName === 'run_verify') {
          const allPassed = result.output.includes('"ok":true') || result.output.includes('"allPassed":true');
          await onEvent({ type: 'VERIFY_RESULT', payload: { passed: allPassed, output: result.output.slice(0, 2000) } });

          if (allPassed) {
            await onEvent({ type: 'DONE', payload: { reason: 'All verifications passed', success: true, iterations, totalTokens, changedFiles: [...changedFiles] } });
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: result.output.slice(0, 3000),
            });
            return { success: true, iterations, totalTokens, changedFiles: [...changedFiles] };
          }
        }

        await onEvent({ type: 'TOOL_RESULT', payload: { tool: fnName, success: result.success, output: result.output.slice(0, 1000) } });

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result.output.slice(0, 3000),
        });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown LLM error';
      await onEvent({ type: 'ERROR', payload: { error: errMsg, iteration: iterations } });
      if (errMsg.includes('rate_limit') || errMsg.includes('429')) {
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      break;
    }
  }

  if (iterations >= limits.maxIterations) {
    await onEvent({ type: 'DONE', payload: { reason: 'Iteration limit reached', iterations, totalTokens, changedFiles: [...changedFiles] } });
  }

  return { success: false, iterations, totalTokens, changedFiles: [...changedFiles] };
}

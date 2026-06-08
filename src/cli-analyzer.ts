import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  CreditBreakdown,
  Issue,
  LlmRequest,
  SessionAnalysis,
} from './analyzer';
import { getMessages, Messages } from './i18n';

interface OtelSpan {
  type: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTime: [number, number];
  endTime: [number, number];
  attributes: Record<string, unknown>;
  status?: { code: number };
  events?: { name: string; attributes: Record<string, unknown>; time: [number, number] }[];
  resource?: { attributes: Record<string, unknown> };
}

function spanToMs(t: [number, number]): number {
  return t[0] * 1000 + t[1] / 1_000_000;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : 0;
}

export function getDefaultOtelPath(): string {
  return path.join(os.homedir(), '.copilot', 'otel-sessions.jsonl');
}

export function parseCliSessions(locale = 'en'): SessionAnalysis[] {
  const otelPath = getDefaultOtelPath();
  if (!fs.existsSync(otelPath)) {
    return [];
  }

  const lines = fs.readFileSync(otelPath, 'utf-8').split(/\r?\n/).filter(Boolean);
  const spans: OtelSpan[] = [];
  for (const line of lines) {
    try {
      spans.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }

  // Group spans by conversation id
  const byConversation = new Map<string, OtelSpan[]>();
  for (const span of spans) {
    if (span.type !== 'span') { continue; }
    const convId = str(span.attributes['gen_ai.conversation.id']);
    if (!convId) { continue; }
    if (!byConversation.has(convId)) { byConversation.set(convId, []); }
    byConversation.get(convId)!.push(span);
  }

  const sessions: SessionAnalysis[] = [];
  for (const [convId, convSpans] of byConversation) {
    const session = buildSession(convId, convSpans, locale);
    if (session) { sessions.push(session); }
  }
  return sessions;
}

function buildSession(convId: string, spans: OtelSpan[], locale: string): SessionAnalysis | null {
  const m = getMessages(locale);

  const agentSpans = spans.filter(s => s.name === 'invoke_agent');
  const chatSpans = spans.filter(s => s.name.startsWith('chat '));

  if (agentSpans.length === 0 && chatSpans.length === 0) { return null; }

  const allTimestamps = spans.flatMap(s => [spanToMs(s.startTime), spanToMs(s.endTime)]).filter(Boolean);
  const startTime = Math.min(...allTimestamps);
  const endTime = Math.max(...allTimestamps);
  const durationMin = Math.round((endTime - startTime) / 60000);

  // Project / repo from invoke_agent span
  const topAgent = agentSpans[0];
  const repoFull = topAgent ? str(topAgent.attributes['github.copilot.git.repository']) : '';
  const projectName = repoFull ? repoFull.split('/').pop() ?? repoFull : '';
  const branch = topAgent ? str(topAgent.attributes['github.copilot.git.branch']) : '';

  // Turn count: sum of turn_count across all agent spans (each is one invocation)
  const turnCount = agentSpans.reduce((s, a) => s + num(a.attributes['github.copilot.turn_count']), 0) || chatSpans.length;

  // Token totals from chat spans (finer-grained than invoke_agent aggregates)
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCachedTokens = 0;
  for (const cs of chatSpans) {
    totalInputTokens += num(cs.attributes['gen_ai.usage.input_tokens']);
    totalOutputTokens += num(cs.attributes['gen_ai.usage.output_tokens']);
    totalCachedTokens += num(cs.attributes['gen_ai.usage.cache_creation.input_tokens']);
  }
  const cacheRate = totalInputTokens > 0 ? totalCachedTokens / totalInputTokens : 0;
  const avgInputTokensPerTurn = turnCount > 0 ? Math.round(totalInputTokens / turnCount) : 0;

  // Credits (github.copilot.cost) from chat spans
  const totalCredits = chatSpans.reduce((s, cs) => s + num(cs.attributes['github.copilot.cost']), 0);

  // Credit breakdown by model
  const creditByModel = new Map<string, { name: string; count: number; credits: number }>();
  for (const cs of chatSpans) {
    const modelId = str(cs.attributes['gen_ai.response.model']) || str(cs.attributes['gen_ai.request.model']);
    const cost = num(cs.attributes['github.copilot.cost']);
    if (!creditByModel.has(modelId)) {
      creditByModel.set(modelId, { name: modelId, count: 0, credits: 0 });
    }
    const entry = creditByModel.get(modelId)!;
    entry.count++;
    entry.credits += cost;
  }
  const creditBreakdown: CreditBreakdown[] = [...creditByModel.entries()]
    .map(([modelId, v]) => ({
      modelId,
      modelName: v.name,
      requestCount: v.count,
      multiplier: 0,
      credits: v.credits,
    }))
    .sort((a, b) => b.credits - a.credits);

  // Tool definitions from first chat span that has them
  const toolDefsRaw = chatSpans.map(cs => str(cs.attributes['gen_ai.tool.definitions'])).find(Boolean) ?? '';
  const definedToolNames = new Set<string>();
  if (toolDefsRaw) {
    try {
      const toolList = JSON.parse(toolDefsRaw) as { name?: string; type?: string }[];
      for (const t of toolList) {
        if (t.name) { definedToolNames.add(t.name); }
      }
    } catch { /* skip */ }
  }

  // Used tools from execute_tool spans
  const toolCallSpans = spans.filter(s => s.name.startsWith('execute_tool '));
  const usedToolNames = new Set(toolCallSpans.map(s => s.name.replace('execute_tool ', '')));
  const unusedTools = [...definedToolNames].filter(t => !usedToolNames.has(t));

  // Build synthetic LlmRequest array from chat spans for the detail table
  const llmRequests: LlmRequest[] = chatSpans.map(cs => ({
    ts: spanToMs(cs.startTime),
    dur: spanToMs(cs.endTime) - spanToMs(cs.startTime),
    sid: convId,
    type: 'llm_request',
    name: cs.name,
    spanId: cs.spanId,
    parentSpanId: cs.parentSpanId,
    status: 'ok',
    attrs: {
      model: str(cs.attributes['gen_ai.response.model']) || str(cs.attributes['gen_ai.request.model']),
      inputTokens: num(cs.attributes['gen_ai.usage.input_tokens']),
      outputTokens: num(cs.attributes['gen_ai.usage.output_tokens']),
      cachedTokens: num(cs.attributes['gen_ai.usage.cache_creation.input_tokens']),
    },
  }));

  // Reasoning efforts from chat spans' request options (not available in OTel; leave empty)
  const reasoningEfforts: string[] = [];

  const issues = detectCliIssues({
    cacheRate,
    unusedTools,
    definedToolCount: definedToolNames.size,
    turnCount,
    avgInputTokensPerTurn,
    reasoningEfforts,
    m,
  });

  return {
    sessionId: convId,
    workspaceHash: '',
    projectName,
    title: branch ? `[${branch}]` : '',
    startTime,
    endTime,
    durationMin,
    turnCount,
    totalInputTokens,
    totalOutputTokens,
    totalCachedTokens,
    cacheRate,
    llmRequests,
    toolCallNames: [...usedToolNames],
    unusedTools,
    definedToolCount: definedToolNames.size,
    usedToolCount: usedToolNames.size,
    hasContextOverflow: false,
    reasoningEfforts,
    avgInputTokensPerTurn,
    totalCredits,
    creditBreakdown,
    systemPrompts: [],
    instructionFiles: [],
    issues,
    source: 'cli',
  } as SessionAnalysis & { source: 'cli' };
}

function detectCliIssues(params: {
  cacheRate: number;
  unusedTools: string[];
  definedToolCount: number;
  turnCount: number;
  avgInputTokensPerTurn: number;
  reasoningEfforts: string[];
  m: Messages;
}): Issue[] {
  const issues: Issue[] = [];
  const { cacheRate, unusedTools, definedToolCount, turnCount, avgInputTokensPerTurn, reasoningEfforts, m } = params;

  if (definedToolCount > 0) {
    if (cacheRate < 0.3) {
      issues.push({ habit: 3, severity: 'high', title: m.issueLowCache, description: m.issueLowCacheDesc, metric: `Cache rate: ${(cacheRate * 100).toFixed(1)}%` });
    } else if (cacheRate < 0.6) {
      issues.push({ habit: 3, severity: 'medium', title: m.issueMediumCache, description: m.issueMediumCacheDesc, metric: `Cache rate: ${(cacheRate * 100).toFixed(1)}%` });
    }
  }

  if (definedToolCount > 0) {
    const unusedRate = unusedTools.length / definedToolCount;
    if (unusedRate > 0.5) {
      issues.push({ habit: 5, severity: 'high', title: m.issueManyUnusedTools, description: m.issueManyUnusedToolsDesc(Math.round(unusedRate * 100)), metric: `Unused: ${unusedTools.length} / ${definedToolCount} tools` });
    } else if (unusedRate > 0.25) {
      issues.push({ habit: 5, severity: 'medium', title: m.issueSomeUnusedTools, description: m.issueSomeUnusedToolsDesc, metric: `Unused: ${unusedTools.length} / ${definedToolCount} tools` });
    }
  }

  if (turnCount > 20) {
    issues.push({ habit: 6, severity: 'medium', title: m.issueLongSession, description: m.issueLongSessionDesc, metric: `Turns: ${turnCount}` });
  }

  if (avgInputTokensPerTurn > 50000) {
    issues.push({ habit: 2, severity: 'high', title: m.issueHighInput, description: m.issueHighInputDesc, metric: `Avg input: ${avgInputTokensPerTurn.toLocaleString()} tokens/turn` });
  } else if (avgInputTokensPerTurn > 20000) {
    issues.push({ habit: 2, severity: 'medium', title: m.issueMediumInput, description: m.issueMediumInputDesc, metric: `Avg input: ${avgInputTokensPerTurn.toLocaleString()} tokens/turn` });
  }

  const hasXhigh = reasoningEfforts.includes('xhigh');
  const hasHigh = reasoningEfforts.includes('high');
  if (hasXhigh) {
    issues.push({ habit: 4, severity: 'medium', title: m.issueReasoningXhigh, description: m.issueReasoningXhighDesc, metric: 'Reasoning: xhigh' });
  } else if (hasHigh) {
    issues.push({ habit: 4, severity: 'low', title: m.issueReasoningHigh, description: m.issueReasoningHighDesc, metric: 'Reasoning: high' });
  }

  return issues;
}

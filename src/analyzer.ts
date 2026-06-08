import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getMessages, Messages } from './i18n';

export interface LlmRequest {
  ts: number;
  dur: number;
  sid: string;
  type: string;
  name: string;
  spanId: string;
  parentSpanId?: string;
  status: string;
  attrs: {
    model: string;
    debugName?: string;
    inputTokens?: number;
    outputTokens?: number;
    cachedTokens?: number;
    ttft?: number;
    responseId?: string;
    systemPromptFile?: string;
    toolsFile?: string;
    requestOptions?: string;
    userRequest?: string;
  };
}

export interface SessionEvent {
  ts: number;
  dur: number;
  sid: string;
  type: string;
  name: string;
  spanId: string;
  parentSpanId?: string;
  status: string;
  attrs: Record<string, unknown>;
}

export interface ToolCallEvent extends SessionEvent {
  attrs: {
    name?: string;
    [key: string]: unknown;
  };
}

export interface CreditBreakdown {
  modelId: string;
  modelName: string;
  requestCount: number;
  multiplier: number;
  credits: number;
}

export interface SystemPromptInfo {
  file: string;
  lines: number;
  approxTokens: number;
}

export interface InstructionFileInfo {
  name: string;
  filePath: string | null;
  lines: number;
  approxTokens: number;
  exists: boolean;
  searchedIn: string | null;
}

export interface SessionAnalysis {
  projectName: string;
  title: string;
  sessionId: string;
  workspaceHash: string;
  source?: 'chat' | 'cli';
  startTime: number;
  endTime: number;
  durationMin: number;
  turnCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedTokens: number;
  cacheRate: number;
  llmRequests: LlmRequest[];
  toolCallNames: string[];
  unusedTools: string[];
  definedToolCount: number;
  usedToolCount: number;
  hasContextOverflow: boolean;
  reasoningEfforts: string[];
  avgInputTokensPerTurn: number;
  totalCredits: number;
  creditBreakdown: CreditBreakdown[];
  systemPrompts: SystemPromptInfo[];
  instructionFiles: InstructionFileInfo[];
  issues: Issue[];
}

export interface Issue {
  habit: number;
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  metric?: string;
}

function getVSCodeUserDataDir(): string {
  switch (os.platform()) {
    case 'win32':
      return path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'Code', 'User');
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User');
    default:
      return path.join(os.homedir(), '.config', 'Code', 'User');
  }
}

export function findDebugLogDirs(): string[] {
  const base = path.join(getVSCodeUserDataDir(), 'workspaceStorage');
  if (!fs.existsSync(base)) {
    return [];
  }
  const dirs: string[] = [];
  for (const wsHash of fs.readdirSync(base)) {
    const debugLogsDir = path.join(base, wsHash, 'GitHub.copilot-chat', 'debug-logs');
    if (!fs.existsSync(debugLogsDir)) {
      continue;
    }
    for (const sessionId of fs.readdirSync(debugLogsDir)) {
      const sessionDir = path.join(debugLogsDir, sessionId);
      const mainJsonl = path.join(sessionDir, 'main.jsonl');
      if (fs.existsSync(mainJsonl)) {
        dirs.push(sessionDir);
      }
    }
  }
  return dirs;
}

export function parseSession(sessionDir: string, locale = 'en'): SessionAnalysis | null {
  const m = getMessages(locale);
  const mainJsonl = path.join(sessionDir, 'main.jsonl');
  if (!fs.existsSync(mainJsonl)) {
    return null;
  }

  const lines = fs.readFileSync(mainJsonl, 'utf-8').split(/\r?\n/).filter(Boolean);
  const events: SessionEvent[] = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }

  if (events.length === 0) {
    return null;
  }

  const sessionId = path.basename(sessionDir);
  const workspaceHash = path.basename(path.dirname(path.dirname(path.dirname(sessionDir))));

  // Load billing info from models.json
  const modelsPath = path.join(sessionDir, 'models.json');
  interface ModelBilling {
    name: string;
    multiplier?: number;
    tokenPrices?: { batchSize: number; inputPrice: number; outputPrice: number; cachePrice: number };
  }
  const modelBillingMap = new Map<string, ModelBilling>();
  if (fs.existsSync(modelsPath)) {
    try {
      const models = JSON.parse(fs.readFileSync(modelsPath, 'utf-8'));
      for (const m of models) {
        const billing = m.billing ?? {};
        const tp = billing.token_prices;
        modelBillingMap.set(m.id, {
          name: m.name ?? m.id,
          multiplier: billing.multiplier ?? undefined,
          tokenPrices: tp ? {
            batchSize: tp.batch_size ?? 1_000_000,
            inputPrice: tp.default?.input_price ?? 0,
            outputPrice: tp.default?.output_price ?? 0,
            cachePrice: tp.default?.cache_price ?? 0,
          } : undefined,
        });
      }
    } catch {
      // skip
    }
  }

  const timestamps = events.map(e => e.ts).filter(Boolean);
  const startTime = Math.min(...timestamps);
  const endTime = Math.max(...timestamps);
  const durationMin = Math.round((endTime - startTime) / 60000);

  // Extract title from title-*.jsonl
  let title = '';
  try {
    const titleFiles = fs.readdirSync(sessionDir).filter((f: string) => f.startsWith('title-') && f.endsWith('.jsonl'));
    if (titleFiles.length > 0) {
      const titleLines = fs.readFileSync(path.join(sessionDir, titleFiles[0]), 'utf-8').split(/\r?\n/).filter(Boolean);
      for (const line of titleLines) {
        const e = JSON.parse(line);
        if (e.type === 'agent_response') {
          const response = JSON.parse(e.attrs.response as string);
          const text = response?.[0]?.parts?.[0]?.content ?? '';
          if (text) { title = text; break; }
        }
      }
    }
  } catch { /* skip */ }

  const llmRequests = events.filter(e => e.type === 'llm_request') as LlmRequest[];
  const toolCallEvents = events.filter(e => e.type === 'tool_call') as ToolCallEvent[];
  const turnStarts = events.filter(e => e.type === 'turn_start');
  const turnCount = new Set(turnStarts.map(e => e.name.replace('turn_start:', ''))).size;

  const totalInputTokens = llmRequests.reduce((s, r) => s + (r.attrs.inputTokens ?? 0), 0);
  const totalOutputTokens = llmRequests.reduce((s, r) => s + (r.attrs.outputTokens ?? 0), 0);
  const totalCachedTokens = llmRequests.reduce((s, r) => s + (r.attrs.cachedTokens ?? 0), 0);
  const cacheRate = totalInputTokens > 0 ? totalCachedTokens / totalInputTokens : 0;

  const usedToolNames = new Set(toolCallEvents.map(e => String(e.name).replace('tool_call/', '')));

  // Read defined tools from tools_N.json files
  const toolsFiles = llmRequests
    .map(r => r.attrs.toolsFile)
    .filter(Boolean) as string[];
  const uniqueToolsFiles = [...new Set(toolsFiles)];
  const definedToolNames = new Set<string>();
  for (const toolsFile of uniqueToolsFiles) {
    const toolsPath = path.join(sessionDir, toolsFile);
    if (fs.existsSync(toolsPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(toolsPath, 'utf-8'));
        // tools_N.json は配列・{tools:[]}・{content:"[...]"} の3形式が存在する
        let toolList: unknown[];
        if (Array.isArray(raw)) {
          toolList = raw;
        } else if (Array.isArray(raw.tools)) {
          toolList = raw.tools;
        } else if (typeof raw.content === 'string') {
          toolList = JSON.parse(raw.content);
        } else {
          toolList = [];
        }
        for (const t of toolList) {
          const tool = t as Record<string, unknown>;
          const fn = tool.function as Record<string, unknown> | undefined;
          if (fn?.name) {
            definedToolNames.add(String(fn.name));
          } else if (tool.name) {
            definedToolNames.add(String(tool.name));
          }
        }
      } catch {
        // skip
      }
    }
  }

  const unusedTools = [...definedToolNames].filter(t => !usedToolNames.has(t));
  const definedToolCount = definedToolNames.size;
  const usedToolCount = usedToolNames.size;

  // Collect system prompt info from system_prompt_N.json files
  const systemPromptFiles = llmRequests
    .map(r => r.attrs.systemPromptFile)
    .filter(Boolean) as string[];
  const uniqueSystemPromptFiles = [...new Set(systemPromptFiles)];
  const systemPrompts: SystemPromptInfo[] = [];
  for (const spFile of uniqueSystemPromptFiles) {
    const spPath = path.join(sessionDir, spFile);
    if (!fs.existsSync(spPath)) { continue; }
    try {
      const raw = JSON.parse(fs.readFileSync(spPath, 'utf-8'));
      let text = '';
      if (typeof raw.content === 'string') {
        try {
          const parsed = JSON.parse(raw.content);
          if (Array.isArray(parsed)) {
            text = parsed.map((p: { content?: string }) => p.content ?? '').join('\n');
          } else {
            text = raw.content;
          }
        } catch {
          text = raw.content;
        }
      }
      systemPrompts.push({
        file: spFile,
        lines: text.split(/\r?\n/).length,
        approxTokens: Math.round(text.length / 4),
      });
    } catch {
      // skip
    }
  }

  // Resolve workspace folder from workspace.json
  const wsHashDir = path.dirname(path.dirname(path.dirname(sessionDir)));
  let workspaceFolder: string | null = null;
  let projectName = '';
  const workspaceJsonPath = path.join(wsHashDir, 'workspace.json');
  if (fs.existsSync(workspaceJsonPath)) {
    try {
      const wj = JSON.parse(fs.readFileSync(workspaceJsonPath, 'utf-8'));
      const folderUri = wj.folder ?? wj.workspace;
      if (typeof folderUri === 'string') {
        try {
          workspaceFolder = decodeURIComponent(new URL(folderUri).pathname).replace(/^\/([A-Za-z]:)/, '$1');
        } catch {
          workspaceFolder = folderUri.replace(/^file:\/\/\//, '/');
        }
        projectName = path.basename(workspaceFolder);
      }
    } catch { /* skip */ }
  }

  // Collect applied instruction files from Resolve Customizations events
  const instructionFiles: InstructionFileInfo[] = [];
  const customizationEvents = events.filter(e => e.name === 'Resolve Customizations');
  if (customizationEvents.length > 0) {
    const details = String((customizationEvents[0].attrs as Record<string, unknown>).details ?? '');
    const appliedNames = new Set<string>();
    for (const m of details.matchAll(/\[applying\] ([^,|]+?)(?:\s*—[^,|]*)?(?:,|\|)/g)) {
      appliedNames.add(m[1].trim());
    }
    const lastMatch = details.match(/\[applying\] ([^,|]+?)(?:\s*—[^,|]*)?$/);
    if (lastMatch) { appliedNames.add(lastMatch[1].trim()); }

    for (const name of appliedNames) {
      // Build candidate paths: workspace folder + common locations
      const candidates: string[] = [];
      if (workspaceFolder) {
        candidates.push(
          path.join(workspaceFolder, name),
          path.join(workspaceFolder, '.github', name),
          path.join(workspaceFolder, '.github', 'copilot-instructions.md'),
          path.join(workspaceFolder, '.copilot', 'instructions', name),
        );
      }
      candidates.push(
        path.join(os.homedir(), '.copilot', 'instructions', name),
        path.join(os.homedir(), name),
      );

      let resolvedPath: string | null = null;
      for (const c of candidates) {
        if (fs.existsSync(c)) { resolvedPath = c; break; }
      }
      if (resolvedPath) {
        const text = fs.readFileSync(resolvedPath, 'utf-8');
        instructionFiles.push({
          name,
          filePath: resolvedPath,
          lines: text.split(/\r?\n/).length,
          approxTokens: Math.round(text.length / 4),
          exists: true,
          searchedIn: workspaceFolder,
        });
      } else {
        instructionFiles.push({ name, filePath: null, lines: 0, approxTokens: 0, exists: false, searchedIn: workspaceFolder });
      }
    }
  }

  const hasContextOverflow = llmRequests.some(
    r => r.attrs.debugName === 'summarizeConversationHistory'
  );

  const reasoningEfforts: string[] = [];
  for (const req of llmRequests) {
    if (req.attrs.requestOptions) {
      try {
        const opts = JSON.parse(req.attrs.requestOptions);
        if (opts.reasoning?.effort) {
          reasoningEfforts.push(opts.reasoning.effort);
        }
      } catch {
        // skip
      }
    }
  }

  const avgInputTokensPerTurn = turnCount > 0 ? Math.round(totalInputTokens / turnCount) : 0;

  // AI Credit calculation: multiplier-based or token_prices-based
  const requestsByModel = new Map<string, LlmRequest[]>();
  for (const req of llmRequests) {
    const modelId = req.attrs.model;
    if (!requestsByModel.has(modelId)) {
      requestsByModel.set(modelId, []);
    }
    requestsByModel.get(modelId)!.push(req);
  }
  const creditBreakdown: CreditBreakdown[] = [];
  let totalCredits = 0;
  for (const [modelId, reqs] of requestsByModel) {
    const info = modelBillingMap.get(modelId);
    let credits = 0;
    let multiplier = 0;
    if (info?.tokenPrices) {
      const tp = info.tokenPrices;
      for (const req of reqs) {
        const inp = req.attrs.inputTokens ?? 0;
        const out = req.attrs.outputTokens ?? 0;
        const cached = req.attrs.cachedTokens ?? 0;
        const nonCached = inp - cached;
        credits += (nonCached / tp.batchSize) * tp.inputPrice
                 + (cached   / tp.batchSize) * tp.cachePrice
                 + (out      / tp.batchSize) * tp.outputPrice;
      }
    } else if (info?.multiplier !== undefined) {
      multiplier = info.multiplier;
      credits = reqs.length * multiplier;
    }
    totalCredits += credits;
    creditBreakdown.push({
      modelId,
      modelName: info?.name ?? modelId,
      requestCount: reqs.length,
      multiplier,
      credits,
    });
  }
  creditBreakdown.sort((a, b) => b.credits - a.credits);

  const issues: Issue[] = detectIssues({
    cacheRate,
    unusedTools,
    definedToolCount,
    hasContextOverflow,
    reasoningEfforts,
    avgInputTokensPerTurn,
    turnCount,
    llmRequests,
    systemPrompts,
    instructionFiles,
    m,
  });

  return {
    sessionId,
    workspaceHash,
    projectName,
    title,
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
    definedToolCount,
    usedToolCount,
    hasContextOverflow,
    reasoningEfforts,
    avgInputTokensPerTurn,
    totalCredits,
    creditBreakdown,
    systemPrompts,
    instructionFiles,
    issues,
  };
}

function detectIssues(params: {
  cacheRate: number;
  unusedTools: string[];
  definedToolCount: number;
  hasContextOverflow: boolean;
  reasoningEfforts: string[];
  avgInputTokensPerTurn: number;
  turnCount: number;
  llmRequests: LlmRequest[];
  systemPrompts: SystemPromptInfo[];
  instructionFiles: InstructionFileInfo[];
  m: Messages;
}): Issue[] {
  const issues: Issue[] = [];
  const {
    cacheRate,
    unusedTools,
    definedToolCount,
    hasContextOverflow,
    reasoningEfforts,
    avgInputTokensPerTurn,
    turnCount,
    systemPrompts,
    instructionFiles,
    m,
  } = params;

  // Habit 3: Instruction file size (user-controllable files only)
  for (const f of instructionFiles.filter(f => f.exists && f.lines > 200)) {
    issues.push({
      habit: 3,
      severity: 'medium',
      title: m.issueInstructionLong,
      description: m.issueInstructionLongDesc,
      metric: `${f.name}: ${f.lines} lines (~${(f.approxTokens / 1000).toFixed(1)}K tokens)`,
    });
  }

  // Habit 3: Cache utilization
  if (definedToolCount > 0 || params.llmRequests.some(r => r.attrs.systemPromptFile)) {
    if (cacheRate < 0.3) {
      issues.push({
        habit: 3,
        severity: 'high',
        title: m.issueLowCache,
        description: m.issueLowCacheDesc,
        metric: `Cache rate: ${(cacheRate * 100).toFixed(1)}%`,
      });
    } else if (cacheRate < 0.6) {
      issues.push({
        habit: 3,
        severity: 'medium',
        title: m.issueMediumCache,
        description: m.issueMediumCacheDesc,
        metric: `Cache rate: ${(cacheRate * 100).toFixed(1)}%`,
      });
    }
  }

  // Habit 5: Unused tools
  if (definedToolCount > 0) {
    const unusedRate = unusedTools.length / definedToolCount;
    if (unusedRate > 0.5) {
      issues.push({
        habit: 5,
        severity: 'high',
        title: m.issueManyUnusedTools,
        description: m.issueManyUnusedToolsDesc(Math.round(unusedRate * 100)),
        metric: `Unused: ${unusedTools.length} / ${definedToolCount} tools`,
      });
    } else if (unusedRate > 0.25) {
      issues.push({
        habit: 5,
        severity: 'medium',
        title: m.issueSomeUnusedTools,
        description: m.issueSomeUnusedToolsDesc,
        metric: `Unused: ${unusedTools.length} / ${definedToolCount} tools`,
      });
    }
  }

  // Habit 6: Session too long / context overflow
  if (hasContextOverflow) {
    issues.push({
      habit: 6,
      severity: 'high',
      title: m.issueContextOverflow,
      description: m.issueContextOverflowDesc,
      metric: `Turns: ${turnCount}`,
    });
  } else if (turnCount > 20) {
    issues.push({
      habit: 6,
      severity: 'medium',
      title: m.issueLongSession,
      description: m.issueLongSessionDesc,
      metric: `Turns: ${turnCount}`,
    });
  }

  // Habit 2: Large input per turn
  if (avgInputTokensPerTurn > 50000) {
    issues.push({
      habit: 2,
      severity: 'high',
      title: m.issueHighInput,
      description: m.issueHighInputDesc,
      metric: `Avg input: ${avgInputTokensPerTurn.toLocaleString()} tokens/turn`,
    });
  } else if (avgInputTokensPerTurn > 20000) {
    issues.push({
      habit: 2,
      severity: 'medium',
      title: m.issueMediumInput,
      description: m.issueMediumInputDesc,
      metric: `Avg input: ${avgInputTokensPerTurn.toLocaleString()} tokens/turn`,
    });
  }

  // Habit 4: Reasoning effort
  const hasXhigh = reasoningEfforts.includes('xhigh');
  const hasHigh = reasoningEfforts.includes('high');
  if (hasXhigh) {
    issues.push({
      habit: 4,
      severity: 'medium',
      title: m.issueReasoningXhigh,
      description: m.issueReasoningXhighDesc,
      metric: `Reasoning: xhigh`,
    });
  } else if (hasHigh) {
    issues.push({
      habit: 4,
      severity: 'low',
      title: m.issueReasoningHigh,
      description: m.issueReasoningHighDesc,
      metric: `Reasoning: high`,
    });
  }

  return issues;
}

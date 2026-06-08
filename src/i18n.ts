const ja = {
  // Header
  appTitle: 'Copilot Context Analyzer',
  refresh: '↺ 再読み込み',
  habitLabel: '習慣',

  // Setup cards
  setupEnable: '有効にする',
  setupChatDesc: 'デバッグログが未設定です。有効にするとセッション詳細を分析できます。',
  setupCliDesc: 'OTelエクスポートが未設定です。有効にするとCLIセッションを分析できます。',

  // Filters
  allProjects: 'すべてのプロジェクト',
  allPeriods: 'すべての期間',
  allSources: 'すべての種類',
  last7days: '直近7日',
  last30days: '直近30日',
  last90days: '直近90日',

  // Summary stats
  showing: '表示中',
  sessions: '件',
  totalCredits: '合計AIクレジット',
  totalInput: '合計入力',
  avgCacheRate: '平均キャッシュ率',
  clickToDetail: 'セッションをクリックすると詳細を表示します',

  // Table headers
  colStartTime: '開始時刻',
  colProject: 'プロジェクト',
  colTitle: 'タイトル',
  colDuration: '時間',
  colTurns: 'ターン',
  colInput: '入力',
  colCacheRate: 'キャッシュ率',
  colToolUsage: 'ツール利用率',
  colCredits: 'AIクレジット',
  colEvaluation: '評価',

  // Evaluation labels
  evalHighIssue: (n: number) => `⚠ ${n}件の重大な問題`,
  evalMediumIssue: (n: number) => `△ ${n}件の指摘`,
  evalOk: '✓ 問題なし',

  // Detail panel
  sessionDetail: 'セッション詳細',
  backToList: '← セッション一覧に戻る',

  // Metric labels
  metricTotalInput: '総入力トークン',
  metricCached: 'キャッシュ済み',
  metricCacheRate: 'キャッシュ率',
  metricAvgInputPerTurn: '平均入力/ターン',
  metricCredits: 'AIクレジット消費',
  metricTurns: 'ターン数',
  metricContextOverflow: 'コンテキスト溢れ',
  contextOverflowYes: 'あり',
  contextOverflowNo: 'なし',

  // Section titles
  habit1Note: 'Auto Mode の ON/OFF はデバッグログに記録されないため分析対象外です。',
  sectionIssues: '検出された問題',
  sectionInstructions: 'カスタム指示ファイル',
  sectionTools: 'ツール一覧',
  sectionCredits: 'AIクレジット内訳',
  creditsNote: '※ Auto Mode選択による10%割引はログに記録されないため含まれていません',
  sectionLlm: 'LLMリクエスト内訳',
  noIssues: 'このセッションに問題は検出されませんでした。',

  // Instructions table
  instructionSearchedIn: '探索場所',
  instructionNotFound: '探索場所内に見つかりません',
  instructionNoWorkspace: 'ワークスペースパスを特定できませんでした',
  instructionNoFiles: 'カスタム指示ファイルなし',
  instructionColFile: 'ファイル名',
  instructionColLines: '行数',
  instructionColTokens: '概算トークン数',
  instructionNote: '200行以下を推奨。変更頻度を下げるとキャッシュ効率が上がります。',

  // Tools table
  toolsUsed: (n: number) => `使用ツール (${n}件)`,
  toolsUnused: (n: number) => `未使用ツール (${n}件)`,
  toolsNone: 'なし',
  toolsNoInfo: 'ツール情報なし',

  // Credits table
  creditColModel: 'モデル',
  creditColRequests: 'リクエスト数',
  creditColMultiplier: 'multiplier',
  creditColCredits: 'クレジット',
  creditTotal: '合計',
  creditNoInfo: 'クレジット情報なし',

  // LLM table
  llmColPurpose: '目的',
  llmColModel: 'モデル',
  llmColInput: '入力(K)',
  llmColOutput: '出力(K)',
  llmColCacheRate: 'キャッシュ率',

  // Issues
  issueInstructionLong: '指示ファイルが長い',
  issueInstructionLongDesc: '指示ファイルが200行を超えています。短く保つことでキャッシュ効率が上がります。',
  issueLowCache: 'キャッシュ活用率が低い',
  issueLowCacheDesc: '指示ファイルやシステムプロンプトが毎回送信されており、キャッシュが効いていません。指示ファイルを安定させると改善します。',
  issueMediumCache: 'キャッシュ活用率が中程度',
  issueMediumCacheDesc: 'キャッシュはある程度機能していますが、指示ファイルを変更しないようにするとさらに改善できます。',
  issueManyUnusedTools: '未使用ツールが多い',
  issueManyUnusedToolsDesc: (pct: number) => `定義されたツールの${pct}%が未使用です。不要なMCPサーバーや拡張機能を無効化するとコンテキストを削減できます。`,
  issueSomeUnusedTools: '未使用ツールがある',
  issueSomeUnusedToolsDesc: '使われていないツールが定義されています。不要なものを無効化するとトークンを節約できます。',
  issueContextOverflow: 'コンテキストウィンドウが溢れた',
  issueContextOverflowDesc: 'セッション中にコンテキストが上限を超え、会話の要約が発生しました。タスクの区切りで新しいチャットを開始することを推奨します。',
  issueLongSession: 'セッションが長い',
  issueLongSessionDesc: 'ターン数が多く、チャット履歴がコンテキストを圧迫している可能性があります。タスク切り替え時に新しいチャットを開始しましょう。',
  issueHighInput: 'ターンあたりの入力トークンが多い',
  issueHighInputDesc: '1ターンあたりの入力が大きすぎます。#file や #selection で対象を絞ることでコンテキストを削減できます。',
  issueMediumInput: 'ターンあたりの入力トークンがやや多い',
  issueMediumInputDesc: 'スコープを絞った指定（#selection など）でさらに削減できる可能性があります。',
  issueReasoningXhigh: '推論努力が最大設定',
  issueReasoningXhighDesc: '推論努力が xhigh に設定されています。単純なタスクには medium や low を使うとコストを下げられます。',
  issueReasoningHigh: '推論努力が高設定',
  issueReasoningHighDesc: '推論努力が high に設定されています。タスクに応じた調整を検討してください。',
};

const en: typeof ja = {
  appTitle: 'Copilot Context Analyzer',
  refresh: '↺ Refresh',
  habitLabel: 'Habit',

  // Setup cards
  setupEnable: 'Enable',
  setupChatDesc: 'Debug logging is not enabled. Enable it to analyze session details.',
  setupCliDesc: 'OTel export is not configured. Enable it to analyze CLI sessions.',

  allProjects: 'All projects',
  allPeriods: 'All time',
  allSources: 'All sources',
  last7days: 'Last 7 days',
  last30days: 'Last 30 days',
  last90days: 'Last 90 days',

  showing: 'Showing',
  sessions: ' sessions',
  totalCredits: 'Total AI Credits',
  totalInput: 'Total Input',
  avgCacheRate: 'Avg Cache Rate',
  clickToDetail: 'Click a session to view details',

  colStartTime: 'Start Time',
  colProject: 'Project',
  colTitle: 'Title',
  colDuration: 'Duration',
  colTurns: 'Turns',
  colInput: 'Input',
  colCacheRate: 'Cache Rate',
  colToolUsage: 'Tool Usage',
  colCredits: 'AI Credits',
  colEvaluation: 'Status',

  evalHighIssue: (n: number) => `⚠ ${n} critical issue${n > 1 ? 's' : ''}`,
  evalMediumIssue: (n: number) => `△ ${n} issue${n > 1 ? 's' : ''}`,
  evalOk: '✓ No issues',

  sessionDetail: 'Session Detail',
  backToList: '← Back to list',

  metricTotalInput: 'Total Input Tokens',
  metricCached: 'Cached Tokens',
  metricCacheRate: 'Cache Rate',
  metricAvgInputPerTurn: 'Avg Input / Turn',
  metricCredits: 'AI Credits Used',
  metricTurns: 'Turns',
  metricContextOverflow: 'Context Overflow',
  contextOverflowYes: 'Yes',
  contextOverflowNo: 'No',

  habit1Note: 'Auto Mode ON/OFF is not recorded in debug logs and cannot be analyzed.',
  sectionIssues: 'Detected Issues',
  sectionInstructions: 'Custom Instruction Files',
  sectionTools: 'Tool List',
  sectionCredits: 'AI Credits Breakdown',
  creditsNote: '※ 10% Auto Mode discount is not reflected (not recorded in logs)',
  sectionLlm: 'LLM Requests Breakdown',
  noIssues: 'No issues detected in this session.',

  instructionSearchedIn: 'Searched in',
  instructionNotFound: 'Not found in search location',
  instructionNoWorkspace: 'Could not determine workspace path',
  instructionNoFiles: 'No custom instruction files',
  instructionColFile: 'File',
  instructionColLines: 'Lines',
  instructionColTokens: 'Approx Tokens',
  instructionNote: 'Recommended: under 200 lines. Stable files improve cache efficiency.',

  toolsUsed: (n: number) => `Used tools (${n})`,
  toolsUnused: (n: number) => `Unused tools (${n})`,
  toolsNone: 'None',
  toolsNoInfo: 'No tool info',

  creditColModel: 'Model',
  creditColRequests: 'Requests',
  creditColMultiplier: 'Multiplier',
  creditColCredits: 'Credits',
  creditTotal: 'Total',
  creditNoInfo: 'No credit info',

  llmColPurpose: 'Purpose',
  llmColModel: 'Model',
  llmColInput: 'Input(K)',
  llmColOutput: 'Output(K)',
  llmColCacheRate: 'Cache Rate',

  issueInstructionLong: 'Instruction file is too long',
  issueInstructionLongDesc: 'Instruction file exceeds 200 lines. Keeping it shorter improves cache efficiency.',
  issueLowCache: 'Low cache utilization',
  issueLowCacheDesc: 'Instructions or system prompts are sent every turn without caching. Stabilize instruction files to improve this.',
  issueMediumCache: 'Moderate cache utilization',
  issueMediumCacheDesc: 'Cache is partially effective. Avoid modifying instruction files frequently for better results.',
  issueManyUnusedTools: 'Many unused tools',
  issueManyUnusedToolsDesc: (pct: number) => `${pct}% of defined tools were unused. Disable unnecessary MCP servers or extensions to reduce context size.`,
  issueSomeUnusedTools: 'Some unused tools',
  issueSomeUnusedToolsDesc: 'Some defined tools were not used. Disabling unused ones saves tokens.',
  issueContextOverflow: 'Context window overflow',
  issueContextOverflowDesc: 'Context exceeded the limit and conversation was summarized. Start a new chat when switching tasks.',
  issueLongSession: 'Session is too long',
  issueLongSessionDesc: 'High turn count may be consuming context with chat history. Start a new chat when switching tasks.',
  issueHighInput: 'High input tokens per turn',
  issueHighInputDesc: 'Input per turn is too large. Use #file or #selection to narrow the scope.',
  issueMediumInput: 'Moderate input tokens per turn',
  issueMediumInputDesc: 'Consider using #selection or similar to further reduce scope.',
  issueReasoningXhigh: 'Reasoning effort at maximum',
  issueReasoningXhighDesc: 'Reasoning effort is set to xhigh. Use medium or low for simpler tasks to reduce cost.',
  issueReasoningHigh: 'Reasoning effort is high',
  issueReasoningHighDesc: 'Reasoning effort is set to high. Consider adjusting based on task complexity.',
};

export type Messages = typeof ja;

export function getMessages(locale: string): Messages {
  return locale.startsWith('ja') ? ja : en;
}

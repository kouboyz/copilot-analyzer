import { exec, execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';

const execAsync = promisify(exec);
const OTEL_ENV_VAR = 'COPILOT_OTEL_FILE_EXPORTER_PATH';
import { findDebugLogDirs, parseSession, SessionAnalysis } from './analyzer';
import { getDefaultOtelPath, parseCliSessions } from './cli-analyzer';
import { buildWebviewHtml } from './webview';
import { getMessages } from './i18n';

const CHAT_DEBUG_LOG_SETTING = 'github.copilot.chat.agentDebugLog.fileLogging.enabled';

function isChatDebugLogEnabled(): boolean {
  return vscode.workspace.getConfiguration().get<boolean>(CHAT_DEBUG_LOG_SETTING, false);
}

async function enableChatDebugLog(): Promise<void> {
  await vscode.workspace.getConfiguration().update(
    CHAT_DEBUG_LOG_SETTING,
    true,
    vscode.ConfigurationTarget.Global,
  );
}

function detectShellProfilePath(): string | null {
  const home = os.homedir();
  const shell = process.env.SHELL ?? '';
  if (shell.includes('zsh')) { return path.join(home, '.zshrc'); }
  if (shell.includes('bash')) {
    const bashProfile = path.join(home, '.bash_profile');
    return fs.existsSync(bashProfile) ? bashProfile : path.join(home, '.bashrc');
  }
  if (shell.includes('fish')) { return path.join(home, '.config', 'fish', 'config.fish'); }
  return null;
}

function isCliOtelConfiguredWindows(): boolean {
  try {
    const result = execSync(`reg query HKCU\\Environment /v ${OTEL_ENV_VAR}`, { stdio: 'pipe' }).toString();
    return result.includes(OTEL_ENV_VAR);
  } catch {
    return false;
  }
}

function isCliOtelConfigured(): boolean {
  if (process.platform === 'win32') { return isCliOtelConfiguredWindows(); }
  const profilePath = detectShellProfilePath();
  if (!profilePath || !fs.existsSync(profilePath)) { return false; }
  return fs.readFileSync(profilePath, 'utf-8').includes(OTEL_ENV_VAR);
}

async function enableCliOtelWindows(locale: string): Promise<boolean> {
  const isJa = locale.startsWith('ja');
  const otelPath = `%USERPROFILE%\\.copilot\\otel-sessions.jsonl`;
  const confirmMsg = isJa
    ? `ユーザー環境変数 ${OTEL_ENV_VAR} を設定しますか？`
    : `Set user environment variable ${OTEL_ENV_VAR}?`;
  const choice = await vscode.window.showInformationMessage(confirmMsg, isJa ? 'はい' : 'Yes', isJa ? 'キャンセル' : 'Cancel');
  if (choice !== (isJa ? 'はい' : 'Yes')) { return false; }

  try {
    await execAsync(`setx ${OTEL_ENV_VAR} "${otelPath}"`);
    vscode.window.showInformationMessage(
      isJa ? `${OTEL_ENV_VAR} を設定しました。新しいターミナルで有効になります。` : `${OTEL_ENV_VAR} set. Open a new terminal to apply.`,
    );
    return true;
  } catch (err) {
    vscode.window.showErrorMessage(
      isJa ? `環境変数の設定に失敗しました: ${err}` : `Failed to set environment variable: ${err}`,
    );
    return false;
  }
}

async function enableCliOtel(locale: string): Promise<boolean> {
  if (process.platform === 'win32') { return enableCliOtelWindows(locale); }

  const profilePath = detectShellProfilePath();
  const isJa = locale.startsWith('ja');
  if (!profilePath) {
    vscode.window.showWarningMessage(
      isJa ? 'シェルプロファイルを特定できませんでした。手動で設定してください。' : 'Could not detect shell profile. Please configure manually.',
    );
    return false;
  }
  const confirmMsg = isJa
    ? `${profilePath} に ${OTEL_ENV_VAR} を追記しますか？`
    : `Add ${OTEL_ENV_VAR} to ${profilePath}?`;
  const choice = await vscode.window.showInformationMessage(confirmMsg, isJa ? 'はい' : 'Yes', isJa ? 'キャンセル' : 'Cancel');
  if (choice !== (isJa ? 'はい' : 'Yes')) { return false; }

  const dir = path.dirname(profilePath);
  if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
  const content = fs.existsSync(profilePath) ? fs.readFileSync(profilePath, 'utf-8') : '';
  const newline = content.endsWith('\n') || content === '' ? '' : '\n';
  fs.appendFileSync(profilePath, `${newline}# Added by Copilot Analyzer\nexport ${OTEL_ENV_VAR}="$HOME/.copilot/otel-sessions.jsonl"\n`);
  vscode.window.showInformationMessage(
    isJa
      ? `${profilePath} に追記しました。新しいターミナルで有効になります。`
      : `Written to ${profilePath}. Open a new terminal to apply.`,
  );
  return true;
}

export function activate(context: vscode.ExtensionContext) {
  const provider = new CopilotAnalyzerViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('copilot-analyzer.dashboard', provider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-analyzer.analyze', () => {
      provider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-analyzer.enableChatLog', async () => {
      await enableChatDebugLog();
      provider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-analyzer.enableCliOtel', async () => {
      const locale = vscode.env.language;
      await enableCliOtel(locale);
      provider.refresh();
    })
  );
}

class CopilotAnalyzerViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _locale: string;

  constructor(_extensionUri: vscode.Uri) {
    this._locale = vscode.env.language;
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.onDidReceiveMessage(async msg => {
      if (msg.command === 'refresh') {
        this._loadAndRender();
      } else if (msg.command === 'toggleLocale') {
        this._locale = this._locale.startsWith('ja') ? 'en' : 'ja';
        this._loadAndRender();
      } else if (msg.command === 'enableChatLog') {
        await enableChatDebugLog();
        this._loadAndRender();
      } else if (msg.command === 'enableCliOtel') {
        await enableCliOtel(this._locale);
        this._loadAndRender();
      }
    });
    this._loadAndRender();
  }

  refresh() {
    this._loadAndRender();
  }

  private _loadAndRender() {
    if (!this._view) {
      return;
    }

    const locale = this._locale;
    const m = getMessages(locale);
    const chatEnabled = isChatDebugLogEnabled();
    const cliConfigured = isCliOtelConfigured();

    const NEW_PRICING_CUTOFF = new Date('2026-06-01').getTime();

    // Load Copilot Chat sessions
    const sessions: SessionAnalysis[] = [];
    if (chatEnabled) {
      for (const dir of findDebugLogDirs()) {
        try {
          const session = parseSession(dir, locale);
          if (session) {
            session.source = 'chat';
            sessions.push(session);
          }
        } catch {
          // skip unreadable sessions
        }
      }
    }

    // Load Copilot CLI sessions
    if (fs.existsSync(getDefaultOtelPath())) {
      try {
        for (const s of parseCliSessions(locale)) {
          sessions.push(s);
        }
      } catch {
        // skip if OTel file unreadable
      }
    }

    const recentSessions = sessions.filter(s => s.startTime >= NEW_PRICING_CUTOFF);
    const setupStatus = { chatEnabled, cliConfigured };
    this._view.webview.html = buildWebviewHtml(recentSessions, m, locale, setupStatus);
  }
}

export function deactivate() {}

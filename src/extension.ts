import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
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
  const shell = process.env.SHELL ?? '';
  const home = os.homedir();
  if (shell.includes('zsh')) { return path.join(home, '.zshrc'); }
  if (shell.includes('bash')) {
    const bashProfile = path.join(home, '.bash_profile');
    return fs.existsSync(bashProfile) ? bashProfile : path.join(home, '.bashrc');
  }
  if (shell.includes('fish')) { return path.join(home, '.config', 'fish', 'config.fish'); }
  return null;
}

const OTEL_EXPORT_LINE = `export COPILOT_OTEL_FILE_EXPORTER_PATH="$HOME/.copilot/otel-sessions.jsonl"`;

function isCliOtelConfigured(): boolean {
  const profilePath = detectShellProfilePath();
  if (!profilePath || !fs.existsSync(profilePath)) { return false; }
  return fs.readFileSync(profilePath, 'utf-8').includes('COPILOT_OTEL_FILE_EXPORTER_PATH');
}

async function enableCliOtel(locale: string): Promise<boolean> {
  const profilePath = detectShellProfilePath();
  const isJa = locale.startsWith('ja');
  if (!profilePath) {
    vscode.window.showWarningMessage(
      isJa ? 'シェルプロファイルを特定できませんでした。手動で設定してください。' : 'Could not detect shell profile. Please configure manually.',
    );
    return false;
  }
  const confirmMsg = isJa
    ? `${profilePath} に COPILOT_OTEL_FILE_EXPORTER_PATH を追記しますか？`
    : `Add COPILOT_OTEL_FILE_EXPORTER_PATH to ${profilePath}?`;
  const choice = await vscode.window.showInformationMessage(confirmMsg, isJa ? 'はい' : 'Yes', isJa ? 'キャンセル' : 'Cancel');
  if (choice !== (isJa ? 'はい' : 'Yes')) { return false; }

  const content = fs.existsSync(profilePath) ? fs.readFileSync(profilePath, 'utf-8') : '';
  const newline = content.endsWith('\n') || content === '' ? '' : '\n';
  fs.appendFileSync(profilePath, `${newline}# Added by Copilot Analyzer\n${OTEL_EXPORT_LINE}\n`);
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

    const setupStatus = { chatEnabled, cliConfigured };
    this._view.webview.html = buildWebviewHtml(sessions, m, locale, setupStatus);
  }
}

export function deactivate() {}

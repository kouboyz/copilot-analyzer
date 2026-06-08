import * as vscode from 'vscode';
import { findDebugLogDirs, parseSession, SessionAnalysis } from './analyzer';
import { buildWebviewHtml } from './webview';
import { getMessages } from './i18n';

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
}

class CopilotAnalyzerViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _sessions: SessionAnalysis[] = [];
  private _locale: string;

  constructor(private readonly _extensionUri: vscode.Uri) {
    this._locale = vscode.env.language;
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'refresh') {
        this._loadAndRender();
      } else if (msg.command === 'toggleLocale') {
        this._locale = this._locale.startsWith('ja') ? 'en' : 'ja';
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
    const dirs = findDebugLogDirs();
    const sessions: SessionAnalysis[] = [];

    for (const dir of dirs) {
      try {
        const session = parseSession(dir, locale);
        if (session) {
          sessions.push(session);
        }
      } catch {
        // skip unreadable sessions
      }
    }

    this._sessions = sessions;

    if (sessions.length === 0) {
      const msg = locale.startsWith('ja')
        ? 'GitHub Copilotのデバッグログが見つかりませんでした。'
        : 'No GitHub Copilot debug logs found.';
      const hint = locale.startsWith('ja')
        ? 'VS Code設定で <code>github.copilot.advanced.debug.useNodeLog</code> を有効にしてCopilotを使用すると、ログが生成されます。'
        : 'Enable <code>github.copilot.advanced.debug.useNodeLog</code> in VS Code settings and use Copilot to generate logs.';
      this._view.webview.html = `<html><body style="font-family:sans-serif;padding:16px;color:var(--vscode-foreground)">
        <p>${msg}</p>
        <p style="font-size:11px;color:var(--vscode-descriptionForeground)">${hint}</p>
      </body></html>`;
      return;
    }

    this._view.webview.html = buildWebviewHtml(sessions, m, locale);
  }
}

export function deactivate() {}

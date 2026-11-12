/** The custom text editor: connects one VS Code text document to one webview and a Session. */
import * as vscode from 'vscode';
import { t, type Lang } from '../i18n';
import type { WebviewToHost } from '../shared/protocol';
import { type ErrorLog } from './errors';
import { buildHtml, makeNonce } from './html';
import { resolveLanguage } from './lang';
import { Session, type DocChange } from './session';

export const VIEW_TYPE = 'chatlines.chatView';

export function currentLanguage(): Lang {
  const setting = vscode.workspace.getConfiguration('chatlines').get<string>('language', 'auto');
  return resolveLanguage(setting, vscode.env.language);
}

/** Open a text editor beside the chat view with the given line selected. */
export async function openLineAsText(document: vscode.TextDocument, line: number): Promise<void> {
  const safe = Math.max(0, Math.min(line, document.lineCount - 1));
  const range = document.lineAt(safe).range;
  await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.Beside, selection: range, preserveFocus: false });
}

export class ChatlinesEditorProvider implements vscode.CustomTextEditorProvider {
  private readonly sessions = new Set<Session>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: ErrorLog,
  ) {}

  /** Re-send the string table to every open chat view (the language setting changed). */
  languageChanged(): void {
    for (const s of this.sessions) s.sendStrings();
  }

  async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
    const webview = panel.webview;
    const media = vscode.Uri.joinPath(this.context.extensionUri, 'media');
    webview.options = { enableScripts: true, localResourceRoots: [media] };
    webview.html = buildHtml({
      nonce: makeNonce(),
      cspSource: webview.cspSource,
      scriptUri: webview.asWebviewUri(vscode.Uri.joinPath(media, 'webview.js')).toString(),
      styleUri: webview.asWebviewUri(vscode.Uri.joinPath(media, 'webview.css')).toString(),
      lang: currentLanguage(),
      loadingText: t(currentLanguage(), 'msg.loading'),
    });

    const session = new Session({
      doc: {
        get version() {
          return document.version;
        },
        get lineCount() {
          return document.lineCount;
        },
        lineText: (i) => document.lineAt(i).text,
      },
      post: (msg) => {
        void webview.postMessage(msg);
      },
      replaceLine: async (line, newText) => {
        const edit = new vscode.WorkspaceEdit();
        const end = document.lineAt(line).text.length;
        edit.replace(document.uri, new vscode.Range(line, 0, line, end), newText);
        return vscode.workspace.applyEdit(edit);
      },
      getLanguage: currentLanguage,
      setLanguage: async (lang) => {
        await vscode.workspace.getConfiguration('chatlines').update('language', lang, vscode.ConfigurationTarget.Global);
      },
      getPageSize: () => vscode.workspace.getConfiguration('chatlines').get<number>('pageSize', 50),
      openAsText: (line) => {
        void openLineAsText(document, line);
      },
      log: this.log,
    });
    this.sessions.add(session);

    const subs: vscode.Disposable[] = [];
    subs.push(webview.onDidReceiveMessage((m: WebviewToHost) => void session.handle(m)));
    subs.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.toString() !== document.uri.toString() || e.contentChanges.length === 0) return;
        const changes: DocChange[] = e.contentChanges.map((c) => ({
          startLine: c.range.start.line,
          endLine: c.range.end.line,
          lineDelta: (c.text.match(/\r\n|\n|\r/g)?.length ?? 0) - (c.range.end.line - c.range.start.line),
        }));
        session.onDocumentChanged(changes);
      }),
    );
    panel.onDidDispose(() => {
      session.dispose();
      this.sessions.delete(session);
      for (const d of subs) d.dispose();
    });
  }
}

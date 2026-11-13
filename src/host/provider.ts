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
  private readonly byUri = new Map<string, { session: Session; panel: vscode.WebviewPanel }>();
  private readonly pendingLine = new Map<string, number>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: ErrorLog,
  ) {}

  /** Re-send the string table to every open chat view (the language setting changed). */
  languageChanged(): void {
    for (const s of this.sessions) s.sendStrings();
  }

  /**
   * Remember the line (0-based) a file's chat view should open at. A view that is already open
   * jumps right away; otherwise the line is used once, when the next view of that file starts.
   */
  openAtLine(uri: vscode.Uri, line: number): void {
    const key = uri.toString();
    const open = this.byUri.get(key);
    if (open && open.panel.visible) {
      open.session.goToLine(line);
      return;
    }
    // Not open, or open but hidden (its page would be dropped): keep the line for the next ready.
    this.pendingLine.set(key, line);
    if (open) open.panel.reveal();
  }

  /** Forget a remembered line (the chat view could not be opened). */
  cancelOpenAtLine(uri: vscode.Uri): void {
    this.pendingLine.delete(uri.toString());
  }

  async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
    const webview = panel.webview;
    const key = document.uri.toString();
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
        void Promise.resolve(webview.postMessage(msg)).then((delivered) => {
          // A jump the hidden view never received is kept for when it shows again.
          if (delivered === false && msg.type === 'page' && msg.focusLine !== undefined) this.pendingLine.set(key, msg.focusLine);
        });
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
      takeInitialLine: () => {
        const line = this.pendingLine.get(key);
        this.pendingLine.delete(key);
        return line;
      },
      log: this.log,
    });
    this.sessions.add(session);
    this.byUri.set(key, { session, panel });

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
      if (this.byUri.get(key)?.session === session) this.byUri.delete(key);
      for (const d of subs) d.dispose();
    });
  }
}

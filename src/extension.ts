import * as vscode from 'vscode';
import { MAX_SYNCED_FILE_MB, type ErrorLog } from './host/errors';
import { ChatlinesEditorProvider, currentLanguage, openLineAsText, VIEW_TYPE } from './host/provider';
import { t } from './i18n';

export function activate(context: vscode.ExtensionContext): void {
  // Tool errors (never data problems) are recorded here.
  const channel = vscode.window.createOutputChannel('chatlines');
  const log: ErrorLog = {
    error: (code, detail) => channel.appendLine(`[${new Date().toISOString()}] ${code}: ${detail}`),
  };
  const provider = new ChatlinesEditorProvider(context, log);

  context.subscriptions.push(
    channel,
    vscode.window.registerCustomEditorProvider(VIEW_TYPE, provider, {
      supportsMultipleEditorsPerDocument: false,
      webviewOptions: { retainContextWhenHidden: false },
    }),
    vscode.commands.registerCommand('chatlines.openAsChat', async (resource?: vscode.Uri) => {
      const uri = resource ?? vscode.window.activeTextEditor?.document.uri;
      if (!uri) {
        void vscode.window.showErrorMessage(t(currentLanguage(), 'error.noFile'));
        return;
      }
      // VS Code does not share files over 50 MB with extensions, so say so up front.
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.size > MAX_SYNCED_FILE_MB * 1024 * 1024) {
        log.error('TOO_LARGE', `${uri.toString()} is ${stat.size} bytes`);
        void vscode.window.showErrorMessage(t(currentLanguage(), 'error.tooLarge', MAX_SYNCED_FILE_MB));
        return;
      }
      await vscode.commands.executeCommand('vscode.openWith', uri, VIEW_TYPE);
    }),
    vscode.commands.registerCommand('chatlines.openLineAsText', async (uri: vscode.Uri, line: number) => {
      const doc = await vscode.workspace.openTextDocument(uri);
      await openLineAsText(doc, line);
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('chatlines.language')) provider.languageChanged();
    }),
  );
}

export function deactivate(): void {}

// Runs inside the real extension host: opens a .jsonl with the chat view, edits one line and
// checks that the document gets dirty and that undo restores the original text.
import * as assert from 'node:assert';
import * as path from 'node:path';
import * as vscode from 'vscode';

export async function run(): Promise<void> {
  const file = vscode.Uri.file(path.resolve(__dirname, '../../../examples/en/openai-chat.jsonl'));
  await vscode.commands.executeCommand('vscode.openWith', file, 'chatlines.chatView');
  const doc = await vscode.workspace.openTextDocument(file);
  const original = doc.lineAt(0).text;
  const edit = new vscode.WorkspaceEdit();
  edit.replace(file, doc.lineAt(0).range, original.replace('Hello', 'Hi'));
  assert.ok(await vscode.workspace.applyEdit(edit));
  assert.ok(doc.isDirty);
  await vscode.commands.executeCommand('undo');
  assert.strictEqual(doc.lineAt(0).text, original);
}

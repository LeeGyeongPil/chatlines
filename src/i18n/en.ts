/**
 * English message table. ko.ts must have exactly the same keys and placeholders.
 * label.*  nouns and short captions
 * msg.*    sentences shown to the user
 * data.*   sentences about problems found in the DATA (the file content)
 * error.*  sentences about problems of the TOOL or the environment
 */
export const en = {
  // toolbar
  'label.role': 'Role',
  'label.allRoles': 'All roles',
  'label.toolName': 'Tool name',
  'label.allTools': 'All tools',
  'label.search': 'Search text',
  'label.problemsOnly': 'Problems only',
  'label.stats': 'Statistics',
  'label.language': 'Language',
  'label.previous': 'Previous',
  'label.next': 'Next',
  'label.page': 'Page {0} / {1}',
  'label.matches': '{0} matching lines',
  // cards
  'label.line': 'Line {0}',
  'label.messageCount': '{0} messages',
  'label.format.openai-chat': 'OpenAI chat',
  'label.format.sharegpt': 'ShareGPT',
  'label.format.alpaca': 'Alpaca',
  'label.format.batch-request': 'Batch request',
  'label.format.batch-response': 'Batch response',
  'label.format.unknown': 'Unknown shape',
  'label.format.invalid': 'Invalid JSON',
  'label.role.system': 'system',
  'label.role.user': 'user',
  'label.role.assistant': 'assistant',
  'label.role.tool': 'tool',
  'label.role.other': 'other',
  'label.toolCall': 'Tool call',
  'label.toolResult': 'Tool result',
  'label.arguments': 'Arguments',
  'label.edit': 'Edit',
  'label.save': 'Save',
  'label.cancel': 'Cancel',
  'label.openAsText': 'Open as Text',
  'label.showAll': 'Show all',
  'label.weight': 'Weight {0}',
  // statistics panel
  'label.stats.lines': 'Lines',
  'label.stats.problemLines': 'Problem lines',
  'label.stats.toolCalls': 'Tool calls',
  'label.stats.byFormat': 'Lines by format',
  'label.stats.byRole': 'Messages by role',
  'label.stats.scanning': 'Scanning…',
  // sentences
  'msg.loading': 'Loading…',
  'msg.noLines': 'There are no lines to show.',
  'msg.noMatches': 'No line matches the filter.',
  'msg.truncated': 'Only the first {0} characters are shown.',
  'msg.editHint': 'Press Ctrl+Enter to apply or Esc to cancel.',
  'msg.argsInvalid': 'The arguments are not valid JSON.',
  'msg.readOnlyPart': 'This part cannot be edited here.',
  // data problems
  'data.invalidJson': 'Line {0} is not valid JSON (column {1}).',
  'data.unknownShape': 'This line has a shape that is not recognized, so the raw JSON is shown.',
  'data.orphanToolResult': 'A tool result refers to the call ID {0}, but no tool call has that ID.',
  'data.unansweredToolCall': 'The tool call with the ID {0} has no tool result.',
  'data.badArguments': 'The arguments of the tool call {0} are not valid JSON, so the raw text is shown.',
  'data.batchError': 'The batch result reports an error (status {0}).',
  // tool errors
  'error.editFailed': 'The edit could not be applied. The file was not changed.',
  'error.staleEdit': 'The line changed while you were editing. The latest content is shown.',
  'error.editInvalid': 'This value cannot be edited here. The file was not changed.',
  'error.internal': 'An internal error occurred. The error code is {0}.',
  'error.noFile': 'Select a .jsonl file first.',
  'error.tooLarge': 'This file is larger than {0} MB, and VS Code does not share files that large with extensions. Open it as text or split the file.',
  // command line tools
  'msg.cli.edited': 'Edited line {0}, message {1}. Only one string token changed.',
  'msg.cli.unchanged': 'The new text is the same as the old text, so nothing changed.',
  'label.cli.usage': 'Usage: demo-edit <file.jsonl> --line N --message M --text "new text" [--lang en|ko]',
  'msg.cli.dryRun': 'The file on disk was not modified.',
  'label.cli.before': 'before',
  'label.cli.after': 'after',
  'label.cli.token': 'changed token',
  'label.cli.bytes': 'line length: {0} -> {1} characters',
  'error.cli.noLine': 'There is no line {0} in this file.',
  'error.cli.cannotRead': 'Cannot read the file {0}: {1}.',
  'error.cli.noMessage': 'Line {0} has no editable message number {1}.',
  'error.cli.badLang': 'The language must be en or ko.',
} as const;

export type MessageKey = keyof typeof en;

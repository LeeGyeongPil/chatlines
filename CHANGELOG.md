# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-12

### Added
- Chat view for `.jsonl` files (custom text editor `chatlines.chatView`, opt-in so the default editor is not replaced).
- Format detection and conversion for OpenAI chat (strings, null content, content parts, tools, tool calls), ShareGPT, Alpaca, batch requests and batch responses.
- Tool calls are paired with their tool results by `tool_call_id`, with matching color bands.
- Message-level editing that replaces only the edited string token and keeps the rest of the line byte for byte; new text follows the line's own style (Python `json.dumps` escapes, separators, hex case).
- Tool-call arguments are edited as JSON and written back in the original arguments style.
- Stale-edit protection (document version and line hash) and one-line `WorkspaceEdit`s that work with undo.
- Paged view (10 to 200 lines per page) with role, tool name, text and "problems only" filters, and a statistics panel; scans run in chunks and are cancelled when the document changes.
- Data problems (invalid JSON, unknown shape, unmatched tool call ids, bad arguments, batch errors) are shown on the cards and kept apart from tool errors, which appear in a banner and the "chatlines" output channel.
- English and Korean for every message, with a language menu in the view and the `chatlines.language` setting.
- `npm run preview` browser harness, `npm run bench`, `npm run demo:edit`, and `.vsix` packaging.

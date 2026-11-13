# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-11-14

### Added
- "Go to line" box in the toolbar: type a 1-based line number and press Enter to open the page that holds it and highlight its card. A line that does not exist, or that the current filter hides, shows a notice and leaves the page and filter unchanged.
- "Open as Chat" run from a text editor now opens the chat view at the page of the cursor line. The explorer and editor title menus still open the first page.

### Known issues
- When "Open as Chat" is run on a cursor line while the chat view is hidden, a saved filter is cleared without a notice.

## [0.1.2] - 2026-11-12

### Fixed
- Flaky preview language-switch test: it now waits until both the labels and the sample text are Korean before asserting.

### Changed
- CI prints toolchain versions and collects failure diagnostics.

## [0.1.1] - 2026-11-12

### Security
- Build-time dependency `minimatch` is forced to the patched range `^11.0.8` via npm `overrides` (resolves to 11.0.8) to address GHSA-g3hv-75wg-m249. It is used only by the packaging tool; the published extension does not include it.

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

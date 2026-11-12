// Shows what chatlines changes when one message is edited: it applies the same token-level
// edit as the extension to an in-memory copy and prints the line before and after.
// Usage: npm run demo:edit -- <file.jsonl> --line N --message M --text "new text" [--lang en|ko]
// Line and message numbers start at 1. The file on disk is never modified.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const { applyMessageEdit, splitLines } = require(resolve(root, 'out/src/core/edit.js'));
const { buildLineView } = require(resolve(root, 'out/src/core/formats.js'));
const { parseSpan, nodeAt } = require(resolve(root, 'out/src/core/jsonSpan.js'));
const { t, langFromEnvironment } = require(resolve(root, 'out/src/i18n/index.js'));

const argv = process.argv.slice(2);
const opt = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[++i];
  else positional.push(argv[i]);
}

// --lang > CHATLINES_LANG > LC_ALL/LC_MESSAGES/LANG; anything that is not Korean is English.
if (opt.lang !== undefined && opt.lang !== 'en' && opt.lang !== 'ko') {
  console.error(t('en', 'error.cli.badLang'));
  process.exit(2);
}
const lang = langFromEnvironment(opt.lang, process.env);

const file = positional[0];
const lineNo = Number(opt.line);
const msgNo = Number(opt.message);
if (!file || !Number.isInteger(lineNo) || !Number.isInteger(msgNo) || opt.text === undefined) {
  console.error(t(lang, 'label.cli.usage'));
  process.exit(2);
}

let source;
try {
  source = readFileSync(file, 'utf8');
} catch (err) {
  // Tool error (not a data problem): say which file and why, then stop.
  console.error(t(lang, 'error.cli.cannotRead', file, err.code ?? err.message));
  process.exit(1);
}
const lines = splitLines(source);
const before = lines[lineNo - 1]?.text;
if (before === undefined) {
  console.error(t(lang, 'error.cli.noLine', lineNo));
  process.exit(1);
}
const view = buildLineView(before, lineNo - 1);
// "Message M" counts the messages that have an editable text part.
const editable = (view?.messages ?? []).map((m) => m.parts.find((p) => p.path !== null)).filter(Boolean);
const part = editable[msgNo - 1];
if (!part) {
  console.error(t(lang, 'error.cli.noMessage', lineNo, msgNo));
  process.exit(1);
}

const after = applyMessageEdit(before, part.path, opt.text, 'text');
if (after === before) {
  console.log(t(lang, 'msg.cli.unchanged'));
  process.exit(0);
}

const tokenOf = (text) => {
  const r = parseSpan(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  const n = r.ok ? nodeAt(r.root, part.path) : undefined;
  return n ? text.slice(n.start + (text.charCodeAt(0) === 0xfeff ? 1 : 0), n.end + (text.charCodeAt(0) === 0xfeff ? 1 : 0)) : '';
};

console.log(t(lang, 'msg.cli.edited', lineNo, msgNo));
console.log(`${t(lang, 'label.cli.before')}: ${before}`);
console.log(`${t(lang, 'label.cli.after')}:  ${after}`);
console.log(`${t(lang, 'label.cli.token')}: ${tokenOf(before)} -> ${tokenOf(after)}`);
console.log(t(lang, 'label.cli.bytes', before.length, after.length));
console.log(t(lang, 'msg.cli.dryRun'));

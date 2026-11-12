/** HTML shell of the webview. No external resources; the script runs only with the nonce. */
import { randomBytes } from 'crypto';
import type { Lang } from '../i18n';

export interface HtmlOptions {
  nonce: string;
  cspSource: string;
  scriptUri: string;
  styleUri: string;
  lang: Lang;
  loadingText: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function buildHtml(o: HtmlOptions): string {
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${o.nonce}'`,
    `style-src ${o.cspSource}`,
    `img-src ${o.cspSource} data:`,
  ].join('; ');
  return `<!DOCTYPE html>
<html lang="${o.lang}">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${escapeHtml(o.styleUri)}">
</head>
<body>
<div id="app"><p id="boot">${escapeHtml(o.loadingText)}</p></div>
<script nonce="${o.nonce}" src="${escapeHtml(o.scriptUri)}"></script>
</body>
</html>
`;
}

export function makeNonce(): string {
  return randomBytes(24).toString('base64url');
}

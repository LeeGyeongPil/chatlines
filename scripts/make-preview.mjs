// Copies the preview page and the built webview files next to preview/out/preview.js,
// then prints where to open it. Run through `npm run preview` (which builds first).
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'preview/out');
mkdirSync(out, { recursive: true });
copyFileSync(resolve(root, 'preview/index.html'), resolve(out, 'index.html'));
copyFileSync(resolve(root, 'preview/theme-dark.css'), resolve(out, 'theme-dark.css'));
copyFileSync(resolve(root, 'preview/theme-light.css'), resolve(out, 'theme-light.css'));
copyFileSync(resolve(root, 'media/webview.css'), resolve(out, 'webview.css'));
copyFileSync(resolve(root, 'media/webview.js'), resolve(out, 'webview.js'));
console.log('Preview harness written (not a VS Code window). Open in a browser:');
console.log('  query: ?fixture=openai-tools|sharegpt|alpaca|batch-request|batch-response|python-style|mixed-problems|openai-chat');
console.log('         &lang=en|ko &theme=dark|light &problems=1 &stats=1');
console.log(resolve(out, 'index.html'));

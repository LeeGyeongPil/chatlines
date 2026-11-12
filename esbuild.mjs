// Bundles the three outputs: the extension host, the webview script and the browser preview.
import { build } from 'esbuild';

const common = { bundle: true, sourcemap: false, logLevel: 'warning' };

await build({
  ...common,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
});

await build({
  ...common,
  entryPoints: ['src/webview/main.ts'],
  outfile: 'media/webview.js',
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
});

await build({
  ...common,
  entryPoints: ['src/preview/hostShim.ts'],
  outfile: 'preview/out/preview.js',
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  loader: { '.jsonl': 'text' },
});

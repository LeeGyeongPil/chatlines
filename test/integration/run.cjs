// Runs the suite inside a real VS Code extension host (downloads VS Code on first use).
// Not part of `npm test`: it needs network access and a desktop VS Code build.
const path = require('node:path');
const { runTests } = require('@vscode/test-electron');

(async () => {
  const root = path.resolve(__dirname, '../..');
  await runTests({
    extensionDevelopmentPath: root,
    extensionTestsPath: path.resolve(root, 'out/test/integration/suite.js'),
    launchArgs: [path.resolve(root, 'examples/en'), '--disable-extensions'],
  });
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

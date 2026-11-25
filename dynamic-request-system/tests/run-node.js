// Runs the scenario suite headlessly: node tests/run-node.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..', 'assets', 'js', 'core');
const files = ['storage.js', 'constants.js', 'validation.js', 'auth.js', 'time.js', 'workflow-engine.js', 'template-service.js', 'data.js'];
const ctx = vm.createContext({ console });
files.forEach((f) => vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f }));
vm.runInContext(fs.readFileSync(path.join(__dirname, 'scenarios.js'), 'utf8'), ctx, { filename: 'scenarios.js' });
const results = vm.runInContext('DRS.Tests.run()', ctx);
let current = '';
results.forEach((r) => {
  if (r.scenario !== current) { current = r.scenario; console.log('\nScenario ' + current); }
  console.log((r.passed ? '  PASS ' : '  FAIL ') + r.check + (r.detail && !r.passed ? '  -> ' + r.detail : ''));
});
const failed = results.filter((r) => !r.passed).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed');
process.exit(failed ? 1 : 0);

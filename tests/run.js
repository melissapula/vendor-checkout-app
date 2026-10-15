// Runs every script in one test folder, one after another, and exits
// non-zero if any of them failed.
//   node tests/run.js ui [site url]
//   node tests/run.js api
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const group = process.argv[2];
const url = process.argv[3];
const dir = path.join(__dirname, group || '');
if (!group || !fs.existsSync(dir)) {
  console.error('usage: node tests/run.js <ui|api|manual> [site url]');
  process.exit(2);
}

const summary = [];
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort()) {
  console.log(`\n===== ${group}/${file} =====`);
  const args = [path.join(dir, file)];
  if (url) args.push(url);
  const { status } = spawnSync(process.execPath, args, { stdio: 'inherit' });
  summary.push({ file, status });
}

console.log('\n===== summary =====');
for (const { file, status } of summary) console.log(`${status === 0 ? 'PASS' : 'FAIL'}  ${group}/${file} (exit ${status})`);
process.exit(summary.every((s) => s.status === 0) ? 0 : 1);

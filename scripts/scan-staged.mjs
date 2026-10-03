import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const files = execFileSync('git',['diff','--cached','--name-only','--diff-filter=ACMR'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
const secrets = /(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;
for (const file of files) {
  assert.ok(!/(?:^|\/)(?:data|\.runtime|test-results|node_modules)\/|\.(?:sqlite|sqlite-wal|sqlite-shm|db)$|(?:^|\/)\.env(?:\..+)?$/.test(file) || file === '.env.example',`Runtime/credential path staged: ${file}`);
  const content = execFileSync('git',['show',`:${file}`],{encoding:'utf8',maxBuffer:4*1024*1024});
  assert.ok(!secrets.test(content),`Possible credential in ${file}; inspect locally without printing it.`);
  if (file === '.env.example') for (const line of content.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'))) assert.ok(/^[A-Z_]+=$/.test(line),'Env example must have empty values');
}
console.log(`Staged runtime/credential paths, known credential signatures and empty env example: PASS (${files.length} files).`);

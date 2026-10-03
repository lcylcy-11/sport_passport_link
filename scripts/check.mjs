import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
for (const dir of ['dwnc-app','backend','scripts']) {
  for (const file of readdirSync(dir).filter(name => /\.(js|mjs)$/.test(name))) {
    const result = spawnSync(process.execPath,['--check',`${dir}/${file}`],{stdio:'inherit'});
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
console.log('Application, server, scripts and test syntax PASS.');

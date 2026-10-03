import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
// Explicit allowlist: no credentials, runtime databases, history, tests or logs.
const files = [
  'dwnc-app/index.html','dwnc-app/app.css','dwnc-app/app.js','dwnc-app/api.js','dwnc-app/domain.js',
  'dwnc-app/extended-domain.js','dwnc-app/icons.js','dwnc-app/cards.js','dwnc-app/favicon.svg','dwnc-app/server.js',
  'backend/auth.js','backend/database.js','backend/commands.js','backend/manage.js','backend/migrations/001-sports.sql',
  'package.json','package-lock.json','.env.example',
];
for (const file of files) { await mkdir(path.dirname(path.join('dist',file)),{recursive:true}); await copyFile(file,path.join('dist',file)); }
console.log(`Built ${files.length} explicitly selected files into dist/ (no bundling needed for browser ES modules).`);

import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createApplication } from '../dist/dwnc-app/server.js';
const directory = mkdtempSync(path.join(tmpdir(),'dwnc-build-'));
const app = await createApplication({databasePath:path.join(directory,'test.sqlite'),baseURL:'http://127.0.0.1:4190',production:false});
try {
  await new Promise(resolve => app.server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const index = await fetch(base); assert.equal(index.status,200);assert.ok((await index.text()).includes('./app.js'));
  assert.equal((await fetch(base+'/api.js')).status,200);
  for (const file of ['clock.js','kong.js','kong-profile.js','kong-profile-view.js','kong-profile.css','passport-view.js','service-model.js','service-glass.css','home-summary.js','home-summary.css','chat-view.js','chat.css','collaboration-domain.js','workout-share-data.js']) assert.equal((await fetch(`${base}/${file}`)).status,200,`${file} must be included and served`);
  assert.equal((await fetch(base+'/api/health')).status,200);
  assert.equal((await fetch(base+'/api/state')).status,401);
  assert.equal((await fetch(base+'/server.js')).status,404);
  console.log('Built artifact starts, serves the UI/API client, checks DB health and denies anonymous state/source access: PASS.');
} finally {
  await app.close();
  if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir())) throw new Error('Unsafe cleanup path');
  rmSync(directory,{recursive:true,force:true});
}

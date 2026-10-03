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
  assert.equal((await fetch(base+'/home-character.js')).status,200);
  const kong = await fetch(base+'/assets/kong-preview-v1.png');
  assert.equal(kong.status,200); assert.equal(kong.headers.get('content-type'),'image/png');
  assert.equal(Buffer.from(await kong.arrayBuffer()).subarray(1,4).toString(),'PNG');
  assert.equal((await fetch(base+'/api/health')).status,200);
  assert.equal((await fetch(base+'/api/state')).status,401);
  assert.equal((await fetch(base+'/server.js')).status,404);
  console.log('Built artifact starts, serves the UI/API client, checks DB health and denies anonymous state/source access: PASS.');
} finally {
  await app.close();
  if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir())) throw new Error('Unsafe cleanup path');
  rmSync(directory,{recursive:true,force:true});
}

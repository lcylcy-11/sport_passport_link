import { createApplication } from '../dwnc-app/server.js';
import { createExtendedSeed } from '../dwnc-app/extended-domain.js';
import { transaction, writeState } from './database.js';

const action = process.argv[2];
if (!['migrate','seed'].includes(action)) throw new Error('Usage: node backend/manage.js migrate|seed');
const app = await createApplication();
try {
  if (action === 'seed') {
    const count = app.db.prepare('SELECT count(*) AS count FROM profiles').get().count;
    if (count) throw new Error('Seed refused: database already contains profiles. Use a separate empty local DATABASE_PATH.');
    transaction(app.db,() => writeState(app.db,createExtendedSeed()));
    console.log('Fictional sports examples inserted. No accounts or passwords were created.');
  } else console.log('Better Auth + sports migrations applied (idempotent).');
} finally { app.db.close(); }

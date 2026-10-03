import {mkdir,copyFile,readdir} from 'node:fs/promises';
const files=['index.html','app.css','app.js','api.js','clock.js','domain.js','extended-domain.js','collaboration-domain.js','chat-view.js','chat.css','workout-share-data.js','icons.js','cards.js','favicon.svg','kong.js','kong-profile.js','kong-profile-view.js','kong-profile.css','passport-view.js','service-model.js','service-glass.css','home-summary.js','home-summary.css'];
await mkdir('public',{recursive:true});
for (const file of files) await copyFile('dwnc-app/'+file,'public/'+file);
const unexpected=(await readdir('public')).filter(file=>!files.includes(file));
if (unexpected.length) throw new Error('Unexpected public files: '+unexpected.join(','));
console.log('Cloud frontend: '+files.length+' public assets; no server source, keys or databases.');

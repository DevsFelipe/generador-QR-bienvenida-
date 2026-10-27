import {MongoClient,BSON} from 'mongodb';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {config} from './config.js';
import {guestIndexes} from './guest-indexes.js';
const client=new MongoClient(config.uri,{serverSelectionTimeoutMS:8000});
try{
 await client.connect();const db=client.db(config.database),guests=await db.collection('guests').find({}).toArray(),events=await db.collection('events').find({}).toArray();
 const folder=fileURLToPath(new URL('../.private-backups/',import.meta.url));await mkdir(folder,{recursive:true});
 const name='antes-rut-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
 await writeFile(folder+name,BSON.EJSON.stringify({database:config.database,at:new Date(),guests,events,indexes:await db.collection('guests').listIndexes().toArray()},null,2),{flag:'wx',mode:0o600});
 await guestIndexes(db,{removeLegacy:true});
 await db.collection('schema_migrations').updateOne({_id:'rut-mesa-menu-v1'},{$set:{at:new Date(),backup:name}},{upsert:true});
 console.log(JSON.stringify({migracion:'rut-mesa-menu-v1',invitadosConservados:guests.length,eventosConservados:events.length,respaldo:'.private-backups/'+name,indicesActualizados:true}));
}catch(e){console.error(JSON.stringify({migracion:false,tipo:e.name,codigo:e.code||null}));process.exitCode=1;}finally{await client.close();}

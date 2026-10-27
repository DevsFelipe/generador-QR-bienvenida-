import {MongoClient} from 'mongodb';
import {config} from './config.js';
import {guestIndexes} from './guest-indexes.js';
let connection;
export async function store(){
 if(!connection)connection=(async()=>{
  if(!config.uri)throw new Error('Configura reception/.env antes de iniciar.');
  const client=new MongoClient(config.uri,{serverSelectionTimeoutMS:8000,maxPoolSize:10,waitQueueTimeoutMS:30000});
  try{
   await client.connect();const db=client.db(config.database);
   await db.collection('reception_users').createIndex({username:1},{unique:true});
   await db.collection('reception_sessions').createIndex({expiresAt:1},{expireAfterSeconds:0});
   await guestIndexes(db);
   return {client,db};
  }catch(error){await client.close();throw error;}
 })().catch(error=>{connection=null;throw error;});
 return connection;
}
export async function closeStore(){if(connection){const {client}=await connection;await client.close();connection=null;}}

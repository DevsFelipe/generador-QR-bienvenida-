import { MongoClient, ObjectId } from 'mongodb';
let client, database, connecting;
export const id = value => { if (!ObjectId.isValid(value)) throw new Error('Identificador inválido'); return new ObjectId(value); };
export async function db() {
  if (!process.env.MONGODB_URI) throw new Error('Falta configurar MONGODB_URI en .env.');
  if (database) return database;
  if (!connecting) connecting=(async()=>{
    client = new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:5000});
    try {
      await client.connect();
      const candidate = client.db(process.env.MONGODB_DB || 'invitaciones');
      await candidate.collection('guests').createIndex({eventId:1,correoNormalizado:1},{unique:true});
      await candidate.collection('guests').createIndex({tokenHash:1},{unique:true,partialFilterExpression:{tokenHash:{$type:'string'}}});
      await candidate.collection('guests').createIndex({eventId:1,'mail.status':1});
      database = candidate;
      return database;
    } catch(error) { await client.close(); throw error; }
  })().finally(()=>{connecting=null;});
  return connecting;
}
export async function closeDB() { await client?.close(); }

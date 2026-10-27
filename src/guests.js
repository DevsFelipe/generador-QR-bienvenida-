import {makeQR} from './domain.js';
export async function importGuests(collection,eventId,rows) {
  const result={created:0,skipped:0,rejected:rows.filter(row=>row.errors.length).length};
  for(const row of rows.filter(row=>!row.errors.length)) {
    const {nombre,correo,correoNormalizado,institucion}=row;
    try {
      // No se crea ningún token durante la importación: primero debe existir la persona.
      await collection.insertOne({eventId,nombre,correo,correoNormalizado,institucion,activo:true,checkIn:null,mail:{status:'pending'},createdAt:new Date()});
      result.created++;
    } catch(error) { if(error.code===11000) result.skipped++; else throw error; }
  }
  return result;
}
export async function issueMissingQR(collection,eventId,key) {
  makeQR(key);
  const guests=await collection.find({eventId,tokenHash:{$exists:false}}).project({_id:1}).toArray();
  let generated=0;
  for(const guest of guests) {
    const result=await collection.updateOne({_id:guest._id,eventId,tokenHash:{$exists:false}},{$set:{...makeQR(key),qrCreatedAt:new Date()}});
    generated+=result.modifiedCount;
  }
  return generated;
}

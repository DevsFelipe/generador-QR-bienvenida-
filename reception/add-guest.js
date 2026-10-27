import {guestInput} from './rut.js';
import {ReceptionError} from './checkin.js';

// Se ejecuta dentro de una transacción: alta e ingreso se confirman juntos.
export async function addGuest(db,user,eventId,input,session){
 if(!user?.active||user.role!=='admin')throw new ReceptionError('FORBIDDEN',403);
 if(typeof input.operationId!=='string'||!/^[a-f0-9-]{36}$/i.test(input.operationId))throw new ReceptionError('INVALID_OPERATION');
 const data=guestInput(input);
 const event=await db.collection('events').findOne({_id:eventId},{session});
 if(!event)throw new ReceptionError('NOT_FOUND',404);
 const previous=await db.collection('guests').findOne({eventId,creationOperationId:input.operationId},{session});
 if(previous){
  if(String(previous.createdBy)!==String(user._id))throw new ReceptionError('FORBIDDEN',403);
  return {created:false,guestId:previous._id,checkedIn:!!previous.checkIn};
 }
 if(input.registerNow===true){
  const lock=await db.collection('events').updateOne({_id:eventId,estado:'recepcion_abierta'},{$inc:{receptionOperations:1}},{session});
  if(lock.matchedCount!==1)throw new ReceptionError('EVENT_CLOSED',409);
 }
 const now=new Date();
 const guest={eventId,...data,activo:true,createdAt:now,createdBy:user._id,creationMethod:'manual',creationOperationId:input.operationId,
  checkIn:input.registerNow===true?{at:now,by:user._id,operator:user.username,method:'manual',operationId:input.operationId}:null};
 const result=await db.collection('guests').insertOne(guest,{session});
 return {created:true,guestId:result.insertedId,checkedIn:!!guest.checkIn};
}

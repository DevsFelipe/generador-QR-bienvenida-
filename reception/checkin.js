import {createHash} from 'node:crypto';
import {ObjectId} from 'mongodb';
import {mayAccess} from './auth.js';
export class ReceptionError extends Error{constructor(code,status=400){super(code);this.code=code;this.status=status;}}
export function objectId(value){if(typeof value!=='string'||!/^[a-f0-9]{24}$/i.test(value))throw new ReceptionError('INVALID_ID');return new ObjectId(value);}
export function tokenHash(payload){if(typeof payload!=='string'||!/^GALAQR1:[A-Za-z0-9_-]{43}$/.test(payload.trim()))throw new ReceptionError('INVALID_QR');return createHash('sha256').update(payload.trim().slice(8)).digest('hex');}
export const guestView=guest=>({_id:guest._id,nombre:guest.nombre,rut:guest.rut,institucion:guest.institucion,mesa:guest.mesa,menu:guest.menu,checkIn:guest.checkIn});
// Debe ejecutarse en transacción. La escritura del evento serializa el cierre con los ingresos.
export async function registerInTransaction(db,user,eventId,input,session){
 if(!mayAccess(user,eventId))throw new ReceptionError('FORBIDDEN',403);
 const event=await db.collection('events').findOne({_id:eventId},{session});
 if(!event)throw new ReceptionError('NOT_FOUND',404);
 if(event.estado!=='recepcion_abierta')throw new ReceptionError('EVENT_CLOSED',409);
 let selector,method;
 if(input.method==='manual') {selector={_id:objectId(input.guestId)};method='manual';}
 else {selector={tokenHash:tokenHash(input.qr)};method='qr';}
 if(typeof input.operationId!=='string'||!/^[a-f0-9-]{36}$/i.test(input.operationId))throw new ReceptionError('INVALID_OPERATION');
 const lock=await db.collection('events').updateOne({_id:eventId,estado:'recepcion_abierta'},{$inc:{receptionOperations:1}},{session});
 if(lock.matchedCount!==1)throw new ReceptionError('EVENT_CLOSED',409);
 const filter={...selector,eventId,activo:true};
 const guest=await db.collection('guests').findOneAndUpdate({...filter,checkIn:null},{$set:{checkIn:{at:new Date(),by:user._id,operator:user.username,method,operationId:input.operationId}}},{session,returnDocument:'after'});
 if(guest)return {code:'CHECKED_IN',guest:guestView(guest)};
 const existing=await db.collection('guests').findOne(filter,{session});
 if(existing?.checkIn)return {code:'ALREADY_CHECKED_IN',guest:guestView(existing)};
 throw new ReceptionError('INVALID_QR',404);
}

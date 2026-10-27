import {normalizeRut} from './rut.js';
import {ReceptionError} from './checkin.js';
export async function registerRut(db,event,input,session){
 let rut;try{rut=normalizeRut(input.rut);}catch{throw new ReceptionError('INVALID_RUT');}
 if(typeof input.operationId!=='string'||!/^[a-f0-9-]{36}$/i.test(input.operationId))throw new ReceptionError('INVALID_OPERATION');
 // No escribir el evento en cada ingreso: produciría un bloqueo compartido entre invitados.
 // El cierre impide iniciar nuevos registros; solicitudes ya en curso pueden terminar.
 const opened=await db.collection('events').findOne({_id:event._id,estado:'recepcion_abierta',publicSlug:event.publicSlug},{session,projection:{_id:1}});
 if(!opened)throw new ReceptionError('EVENT_CLOSED',409);
 const filter={eventId:event._id,rut,activo:true};
 let guest=await db.collection('guests').findOne(filter,{session});
 if(!guest)throw new ReceptionError('GUEST_NOT_FOUND',404);
 if(!guest.mesa||!guest.menu)throw new ReceptionError('ASSIGNMENT_PENDING',409);
 const updated=await db.collection('guests').findOneAndUpdate({...filter,checkIn:null},{$set:{checkIn:{at:new Date(),method:'rut',operationId:input.operationId,by:null,operator:'Autoregistro del invitado'}}},{session,returnDocument:'after'});
 guest=updated||await db.collection('guests').findOne(filter,{session});
 return{code:updated?'CHECKED_IN':'ALREADY_CHECKED_IN',guest:{nombre:guest.nombre,mesa:guest.mesa,menu:guest.menu,at:guest.checkIn?.at}};
}

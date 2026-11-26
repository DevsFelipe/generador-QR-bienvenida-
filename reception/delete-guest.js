import {ReceptionError} from './checkin.js';
// Ejecutar en transacción: conservar copia y retirar el registro de forma conjunta.
export async function deleteGuest(db,user,eventId,guestId,input,session){
 if(!user?.active||user.role!=='admin')throw new ReceptionError('FORBIDDEN',403);
 if(input.confirm!==true||typeof input.rut!=='string')throw new ReceptionError('DELETE_CONFIRMATION_REQUIRED');
 const filter={_id:guestId,eventId};
 const guest=await db.collection('guests').findOne(filter,{session});
 if(!guest){const archive=await db.collection('deleted_guests').findOne(filter,{session});if(archive&&archive.rut===input.rut)return {ok:true,alreadyDeleted:true};throw new ReceptionError('NOT_FOUND',404);}
 if(guest.rut!==input.rut)throw new ReceptionError('GUEST_CHANGED',409);
 await db.collection('deleted_guests').insertOne({...guest,deletedAt:new Date(),deletedBy:user._id},{session});
 const result=await db.collection('guests').deleteOne({...filter,rut:input.rut},{session});
 if(result.deletedCount!==1)throw new ReceptionError('GUEST_CHANGED',409);
 return {ok:true,alreadyDeleted:false};
}

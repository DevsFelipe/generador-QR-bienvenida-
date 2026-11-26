import {ReceptionError} from './checkin.js';
// El historial y la anulación se confirman juntos en una transacción.
export async function undoCheckIn(db,user,eventId,guestId,input,session){
 if(!user?.active||user.role!=='admin')throw new ReceptionError('FORBIDDEN',403);
 if(input.confirm!==true||typeof input.rut!=='string'||typeof input.at!=='string'||!Number.isFinite(Date.parse(input.at)))throw new ReceptionError('UNDO_CONFIRMATION_REQUIRED');
 const filter={_id:guestId,eventId};const guest=await db.collection('guests').findOne(filter,{session});
 if(!guest)throw new ReceptionError('NOT_FOUND',404);
 if(guest.rut!==input.rut)throw new ReceptionError('GUEST_CHANGED',409);
 if(!guest.checkIn?.at)return {ok:true,alreadyPending:true};
 if(new Date(guest.checkIn.at).toISOString()!==new Date(input.at).toISOString())throw new ReceptionError('GUEST_CHANGED',409);
 await db.collection('checkin_reversals').insertOne({guestId,eventId,rut:guest.rut,nombre:guest.nombre,previousCheckIn:guest.checkIn,reversedAt:new Date(),reversedBy:user._id,operator:user.username},{session});
 const result=await db.collection('guests').updateOne({...filter,'checkIn.at':guest.checkIn.at},{$set:{checkIn:null}},{session});
 if(result.modifiedCount!==1)throw new ReceptionError('GUEST_CHANGED',409);
 return {ok:true,alreadyPending:false};
}

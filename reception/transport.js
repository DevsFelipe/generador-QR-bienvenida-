import {randomBytes} from 'node:crypto';
import {normalizeRut} from './rut.js';
import {ReceptionError} from './checkin.js';

// La asignación condicional permite pedir el QR varias veces sin rotar su dirección.
export async function transportEvent(db,eventId){
 await db.collection('events').updateOne({_id:eventId,transportSlug:{$exists:false}},{$set:{transportSlug:randomBytes(16).toString('hex')}});
 const event=await db.collection('events').findOne({_id:eventId});
 if(!event)throw new ReceptionError('NOT_FOUND',404);
 return event;
}
export async function registerTransport(db,event,input){
 let rut;try{rut=normalizeRut(input.rut);}catch{throw new ReceptionError('INVALID_RUT');}
 if(typeof input.operationId!=='string'||!/^[a-f0-9-]{36}$/i.test(input.operationId))throw new ReceptionError('INVALID_OPERATION');
 if(!Number.isInteger(input.total)||input.total<1||input.total>51)throw new ReceptionError('INVALID_COMPANIONS');
 const opened=await db.collection('events').findOne({_id:event._id,transportSlug:event.transportSlug,transportOpen:true});
 if(!opened)throw new ReceptionError('TRANSPORT_CLOSED',409);
 const filter={eventId:event._id,rut,activo:true};
 const exists=await db.collection('guests').findOne(filter);
 if(!exists)throw new ReceptionError('GUEST_NOT_FOUND',404);
 // Primera escritura gana: reintentos o dobles clics no suman viajes ni acompañantes.
 const updated=await db.collection('guests').findOneAndUpdate({...filter,transportCheckIn:null},{$set:{transportCheckIn:{at:new Date(),companions:input.total-1,operationId:input.operationId,method:'rut',plannedTotal:exists.transportPlan?.total??null}}},{returnDocument:'after'});
 const guest=updated||await db.collection('guests').findOne(filter);
 if(!guest?.transportCheckIn)throw new ReceptionError('GUEST_CHANGED',409);
 return {code:updated?'TRANSPORT_REGISTERED':'TRANSPORT_ALREADY_REGISTERED',worker:{nombre:guest.nombre,companions:guest.transportCheckIn.companions,at:guest.transportCheckIn.at}};
}
// Se ejecuta en transacción: permite corregir un RUT ingresado por error sin perder auditoría.
export async function undoTransport(db,user,eventId,guestId,input,session){
 if(!user?.active||user.role!=='admin')throw new ReceptionError('FORBIDDEN',403);
 if(input.confirm!==true||typeof input.rut!=='string'||typeof input.at!=='string'||!Number.isFinite(Date.parse(input.at)))throw new ReceptionError('UNDO_CONFIRMATION_REQUIRED');
 const filter={_id:guestId,eventId},guest=await db.collection('guests').findOne(filter,{session});
 if(!guest)throw new ReceptionError('NOT_FOUND',404);
 if(guest.rut!==input.rut)throw new ReceptionError('GUEST_CHANGED',409);
 if(!guest.transportCheckIn)return {ok:true,alreadyPending:true};
 if(new Date(guest.transportCheckIn.at).toISOString()!==new Date(input.at).toISOString())throw new ReceptionError('GUEST_CHANGED',409);
 await db.collection('transport_reversals').insertOne({guestId,eventId,rut:guest.rut,previousTransportCheckIn:guest.transportCheckIn,reversedAt:new Date(),reversedBy:user._id},{session});
 const result=await db.collection('guests').updateOne({...filter,'transportCheckIn.at':guest.transportCheckIn.at},{$set:{transportCheckIn:null}},{session});
 if(result.modifiedCount!==1)throw new ReceptionError('GUEST_CHANGED',409);
 return {ok:true,alreadyPending:false};
}
const plain=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export async function previewTransport(db,eventId,sheet){
 const headers=sheet?.rows?.[0]?.cells||[],rutCol=headers.findIndex(c=>/rut/.test(plain(c))),totalCol=headers.findIndex(c=>/personas.*bus/.test(plain(c))),nameCol=headers.findIndex(c=>/nombre/.test(plain(c)));
 if(rutCol<0||totalCol<0)throw new ReceptionError('BUS_HEADERS');
 const seen=new Map();const rows=(sheet.rows||[]).slice(1).map(row=>{
  const data={rut:String(row.cells[rutCol]??'').trim(),nombre:String(row.cells[nameCol]??'').trim(),total:Number(row.cells[totalCol])},errors=[];
  try{data.rut=normalizeRut(data.rut);}catch(e){errors.push(e.message);}
  if(!String(row.cells[totalCol]??'').trim()||!Number.isInteger(data.total)||data.total<1||data.total>51)errors.push('El total debe incluir al trabajador y ser un entero entre 1 y 51.');
  const item={number:row.number,data,errors};
  if(!errors.length){if(seen.has(data.rut)){errors.push('RUT repetido en la nómina de buses.');seen.get(data.rut).errors.push('RUT repetido en la nómina de buses.');}else seen.set(data.rut,item);}
  return item;
 });
 const guests=await db.collection('guests').find({eventId,activo:true,rut:{$in:[...seen.keys()]}}).project({_id:1,rut:1,nombre:1}).toArray(),byRut=new Map(guests.map(g=>[g.rut,g]));
 for(const row of rows){const guest=byRut.get(row.data.rut);if(!row.errors.length&&!guest)row.errors.push('El RUT no está en la nómina de trabajadores del evento.');if(guest){row.workerId=guest._id;row.workerName=guest.nombre;}}
 return rows;
}

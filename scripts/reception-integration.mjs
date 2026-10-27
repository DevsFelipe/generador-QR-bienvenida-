import assert from 'node:assert/strict';
import {ObjectId} from 'mongodb';
import {randomBytes,randomUUID} from 'node:crypto';
import {store,closeStore} from '../reception/store.js';
import {config} from '../reception/config.js';
import {passwordHash} from '../reception/auth.js';
import {tokenHash} from '../reception/checkin.js';

const {db}=await store();
const eventId=new ObjectId(),otherEventId=new ObjectId(),userId=new ObjectId(),otherUserId=new ObjectId(),guestId=new ObjectId(),manualId=new ObjectId();
const username='test_'+randomBytes(8).toString('hex'),password=randomBytes(20).toString('hex');
const qr='GALAQR1:'+randomBytes(32).toString('base64url');
let csrf='',cookie='',otherCookie='';
async function request(path,body,options={}){
 const res=await fetch(config.origin+'/api'+path,{method:body===undefined?'GET':'POST',headers:{Origin:config.origin,...(body===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':csrf}),...(cookie?{Cookie:cookie}:{}),...options.headers},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await res.json();return{status:res.status,data,cookie:res.headers.get('set-cookie')?.split(';')[0]};
}
try{
 await db.collection('events').insertMany([{_id:eventId,nombre:'TEST recepción automático',fecha:'2026-10-26',lugar:'Prueba',estado:'recepcion_abierta',timezone:'America/Santiago'},{_id:otherEventId,nombre:'TEST otro evento',estado:'cerrado'}]);
 await db.collection('reception_users').insertMany([{_id:userId,username,passwordHash:await passwordHash(password),role:'receptionist',active:true,eventIds:[eventId]},{_id:otherUserId,username:username+'_otro',passwordHash:await passwordHash(password),role:'receptionist',active:true,eventIds:[otherEventId]}]);
 await db.collection('guests').insertMany([{_id:guestId,eventId,nombre:'Persona ficticia QR',correoNormalizado:username+'@example.cl',institucion:'Ensayo',activo:true,checkIn:null,tokenHash:tokenHash(qr)},{_id:manualId,eventId,nombre:'Persona ficticia manual',correoNormalizado:username+'_manual@example.cl',institucion:'Ensayo',activo:true,checkIn:null}]);
 assert.equal((await request('/events')).status,401);
 const login=await request('/login',{username,password});assert.equal(login.status,200);cookie=login.cookie;csrf=(await request('/me')).data.csrf;
 const events=await request('/events');assert.equal(events.data.length,1);assert.equal(events.data[0]._id,String(eventId));
 assert.equal((await request(`/events/${eventId}/state`,{estado:'cerrado'})).status,403);
 assert.equal((await request(`/events/${eventId}/check-ins`,{qr,operationId:randomUUID()},{headers:{'X-CSRF-Token':'incorrecto'}})).status,403);
 assert.equal((await request(`/events/${otherEventId}/summary`)).status,403);
 assert.equal((await request(`/events/${eventId}/check-ins`,{qr:'GALAQR1:'+randomBytes(32).toString('base64url'),operationId:randomUUID()})).data.code,'INVALID_QR');
 const results=await Promise.all(Array.from({length:5},()=>request(`/events/${eventId}/check-ins`,{qr,operationId:randomUUID()})));
 assert.equal(results.filter(r=>r.data.code==='CHECKED_IN').length,1);assert.equal(results.filter(r=>r.data.code==='ALREADY_CHECKED_IN').length,4);
 const stored=await db.collection('guests').findOne({_id:guestId});assert.ok(stored.checkIn.at instanceof Date);assert.equal(String(stored.checkIn.by),String(userId));
 assert.equal((await request(`/events/${eventId}/check-ins`,{method:'manual',guestId:String(manualId),operationId:randomUUID()})).data.code,'CHECKED_IN');
 const summary=await request(`/events/${eventId}/summary`);assert.deepEqual(summary.data,{total:2,attended:2,pending:0});
 const search=await request(`/events/${eventId}/guests?q=Persona`);assert.equal(search.data.length,2);assert.ok(!JSON.stringify(search.data).includes('tokenHash'));
 await db.collection('events').updateOne({_id:eventId},{$set:{estado:'cerrado'}});
 assert.equal((await request(`/events/${eventId}/check-ins`,{qr,operationId:randomUUID()})).data.code,'EVENT_CLOSED');
 await db.collection('events').updateOne({_id:eventId},{$set:{estado:'recepcion_abierta'}});
 await db.collection('reception_users').updateOne({_id:userId},{$set:{active:false}});
 assert.equal((await request('/events')).status,401);
 console.log('Integración Atlas/HTTP correcta: sesión, CSRF, permisos, cierre, búsqueda, ingreso QR/manual y 5 escaneos simultáneos con una sola asistencia.');
}finally{
 await db.collection('reception_sessions').deleteMany({userId:{$in:[userId,otherUserId]}});
 await db.collection('reception_users').deleteMany({_id:{$in:[userId,otherUserId]}});
 await db.collection('guests').deleteMany({_id:{$in:[guestId,manualId]},eventId});
 await db.collection('events').deleteMany({_id:{$in:[eventId,otherEventId]}});
 await closeStore();console.log('Datos ficticios del ensayo retirados; invitados existentes conservados.');
}

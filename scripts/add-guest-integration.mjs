import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {ObjectId} from 'mongodb';
import {store,closeStore} from '../reception/store.js';
import {config} from '../reception/config.js';
let cookie='',csrf='',eventId;
async function request(path,body,method='POST',headers={}){const r=await fetch(config.origin+'/api'+path,{method:body===undefined?'GET':method,headers:{Origin:config.origin,...(body===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':csrf}),...(cookie?{Cookie:cookie}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const{db}=await store();
try{
 assert.equal((await request('/admin/events/000000000000000000000000/guests',{})).status,401);
 const access=await readFile('reception/acceso-recepcion_admin.txt','utf8');const login=await request('/login',{username:'recepcion_admin',password:access.split('\n').find(l=>l.startsWith('Contraseña: ')).slice(12).trim()});assert.equal(login.status,200);cookie=login.cookie;csrf=(await request('/me')).data.csrf;
 const e=await request('/admin/events',{nombre:'ENSAYO ALTA INDIVIDUAL',fecha:'2026-10-30T19:00',lugar:'Ficticio'});assert.equal(e.status,200);eventId=new ObjectId(e.data._id);
 const input={nombre:'Persona ficticia nueva',rut:'12.345.678-5',mesa:'8',menu:'Vegetariano',operationId:randomUUID()};
 const path=`/admin/events/${eventId}/guests`;
 assert.equal((await request(path,input,'POST',{'X-CSRF-Token':'incorrecto'})).status,403);
 assert.equal((await request(path,{...input,registerNow:true})).data.code,'EVENT_CLOSED');assert.equal(await db.collection('guests').countDocuments({eventId}),0);
 const saved=await request(path,input);assert.equal(saved.status,201);assert.equal(saved.data.checkedIn,false);
 const retry=await request(path,input);assert.equal(retry.status,200);assert.equal(retry.data.created,false);assert.equal(retry.data.guestId,saved.data.guestId);
 assert.equal((await request(path,{...input,nombre:'No reemplazar',operationId:randomUUID()})).status,409);
 assert.equal((await request(path,{...input,rut:'12.345.678-9',operationId:randomUUID()})).status,400);
 await request(`/events/${eventId}/state`,{estado:'recepcion_abierta'});
 const immediate=await request(path,{...input,rut:'9.000.000-4',nombre:'Persona ficticia ingreso',registerNow:true,operationId:randomUUID()});assert.equal(immediate.status,201);assert.equal(immediate.data.checkedIn,true);
 const persisted=await db.collection('guests').findOne({_id:new ObjectId(immediate.data.guestId),eventId});assert.equal(persisted.checkIn.operator,'recepcion_admin');assert.equal(persisted.checkIn.method,'manual');
 assert.equal(await db.collection('guests').countDocuments({eventId}),2);assert.equal((await db.collection('guests').findOne({_id:new ObjectId(saved.data.guestId)})).nombre,input.nombre);
 console.log('Atlas/HTTP: alta pendiente, alta con ingreso, rechazo por cierre, CSRF, duplicado, RUT inválido y reintento sin duplicación: correctos.');
}finally{
 if(eventId){await db.collection('guests').deleteMany({eventId});await db.collection('events').deleteOne({_id:eventId,nombre:'ENSAYO ALTA INDIVIDUAL'});console.log('Evento e invitados ficticios retirados.');}
 if(cookie)await request('/logout',{}).catch(()=>{});await closeStore();
}

import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {randomUUID,randomBytes} from 'node:crypto';
import {ObjectId} from 'mongodb';
import ExcelJS from 'exceljs';
import {store,closeStore} from '../reception/store.js';
import {config} from '../reception/config.js';
const ui=process.argv.includes('--ui'),cleanup=process.argv.includes('--cleanup-ui');
const {db}=await store();let eventId,sessionId,cookie='',csrf='';const statePath='outputs/rut-test-state.json';
async function request(path,body,method='POST',overrides={}){const r=await fetch(config.origin+'/api'+path,{method:body===undefined?'GET':method,headers:{Origin:config.origin,...(body===undefined?{}:body instanceof FormData?{'X-CSRF-Token':csrf}:{'Content-Type':'application/json','X-CSRF-Token':csrf}),...(cookie?{Cookie:cookie}:{}),...overrides},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
function fakeRut(n){const body=String(90001000+n);let total=0,f=2;for(let i=body.length-1;i>=0;i--){total+=Number(body[i])*f;f=f===7?2:f+1;}const r=11-total%11;return body+'-'+(r===11?'0':r===10?'K':r);}
async function remove(id){await db.collection('guests').deleteMany({eventId:id});await db.collection('imports').deleteMany({eventId:id});await db.collection('events').deleteOne({_id:id,nombre:'ENSAYO FICTICIO RUT'});}
try{
 if(cleanup){const state=JSON.parse(await readFile(statePath,'utf8'));await remove(new ObjectId(state.eventId));await unlink(statePath);console.log('Ensayo visual retirado.');}
 else{
  assert.equal((await request('/admin/events')).status,401);
  const access=await readFile('reception/acceso-recepcion_admin.txt','utf8');
  const login=await request('/login',{username:'recepcion_admin',password:access.split('\n').find(l=>l.startsWith('Contraseña: ')).slice(12).trim()});assert.equal(login.status,200);cookie=login.cookie;
  csrf=(await request('/me')).data.csrf;
  const created=await request('/admin/events',{nombre:'ENSAYO FICTICIO RUT',fecha:'2026-10-30T19:00',lugar:'Recinto ficticio'});assert.equal(created.status,200);eventId=new ObjectId(created.data._id);
  assert.equal((await request(`/admin/events/${eventId}/public-qr`,{},'POST',{'X-CSRF-Token':'incorrecto'})).status,403);
  const qr=(await request(`/admin/events/${eventId}/public-qr`,{})).data;const slug=qr.url.split('/').pop();assert.match(qr.png,/^data:image\/png;base64,/);
  const qrAgain=(await request(`/admin/events/${eventId}/public-qr`,{})).data;assert.equal(qrAgain.url,qr.url);
  const count=ui?2:150,book=new ExcelJS.Workbook();const sheet=book.addWorksheet('Nómina');sheet.addRow(['nombre','rut','mesa','menu']);
  for(let i=0;i<count;i++)sheet.addRow([`Persona ficticia ${i+1}`,fakeRut(i),String(i%15+1),i%2?'Vegetariano':'Tradicional']);
  const buffer=await book.xlsx.writeBuffer();if(ui)await writeFile('outputs/ensayo-rut.xlsx',Buffer.from(buffer));
  const form=new FormData();form.append('file',new Blob([buffer]),'ficticios.xlsx');const upload=await request('/admin/excel',form);assert.equal(upload.status,200);
  const mapping={previewId:upload.data.previewId,sheet:0,header:0,mapping:{nombre:0,rut:1,mesa:2,menu:3}};
  const preview=await request('/admin/imports/preview',mapping);assert.equal(preview.data.filter(r=>r.errors.length).length,0);
  const imported=await request(`/admin/events/${eventId}/import`,mapping);assert.equal(imported.data.created,count);assert.equal(imported.data.rejected,0);
  assert.equal((await request(`/admin/events/${eventId}/import`,mapping)).data.skipped,count);
  assert.equal((await request(`/public/${slug}/check-in`,{rut:fakeRut(0),operationId:randomUUID()})).data.code,'EVENT_CLOSED');
  await request(`/events/${eventId}/state`,{estado:'recepcion_abierta'});
  if(ui){await writeFile(statePath,JSON.stringify({eventId:String(eventId),url:qr.url,slug,rut:fakeRut(0)}));console.log('Ensayo visual preparado: outputs/rut-test-state.json y outputs/ensayo-rut.xlsx.');}
  else{
   const start=performance.now();const results=await Promise.all(Array.from({length:count},async(_,i)=>{const t=performance.now();const result=await request(`/public/${slug}/check-in`,{rut:fakeRut(i),operationId:randomUUID()});return{...result,ms:performance.now()-t};}));
   const accepted=results.filter(r=>r.data.code==='CHECKED_IN').length;const times=results.map(r=>r.ms).sort((a,b)=>a-b);
   console.log(JSON.stringify({usuarios:count,confirmados:accepted,errores:results.filter(r=>r.status!==200).map(r=>r.data.code),duracionSegundos:Math.round((performance.now()-start)/100)/10,p95Ms:Math.round(times[Math.floor(times.length*.95)])}));assert.equal(accepted,count);
   const first=await db.collection('guests').findOne({eventId,rut:fakeRut(0)}),at=first.checkIn.at.toISOString();
   const duplicate=await request(`/public/${slug}/check-in`,{rut:fakeRut(0),operationId:randomUUID()});assert.equal(duplicate.data.code,'ALREADY_CHECKED_IN');assert.equal(duplicate.data.guest.at,at);assert.deepEqual(Object.keys(duplicate.data.guest).sort(),['at','menu','mesa','nombre']);
   const changed={nombre:first.nombre,rut:first.rut,mesa:'Mesa actualizada',menu:'Sin gluten'};
   assert.equal((await request(`/admin/events/${eventId}/guests/${first._id}`,changed,'PUT')).status,200);
   const after=await db.collection('guests').findOne({_id:first._id});assert.equal(after.checkIn.at.toISOString(),at);assert.equal(after.mesa,'Mesa actualizada');
   assert.equal((await request(`/public/${slug}/check-in`,{rut:'12345678-9',operationId:randomUUID()})).data.code,'INVALID_RUT');
   assert.equal((await request(`/public/${slug}/check-in`,{rut:'12345678-5',operationId:randomUUID()})).data.code,'GUEST_NOT_FOUND');
   await request(`/events/${eventId}/state`,{estado:'cerrado'});assert.equal((await request(`/public/${slug}/check-in`,{rut:fakeRut(0),operationId:randomUUID()})).data.code,'EVENT_CLOSED');
   assert.equal((await request(`/events/${eventId}/check-ins`,{qr:'GALAQR1:retirado',operationId:randomUUID()})).status,410);
   const summary=await request(`/events/${eventId}/summary`);assert.deepEqual(summary.data,{total:count,attended:count,pending:0});console.log('Importación, reimportación, QR estable, cierre, RUT inválido/ausente y conservación de asistencia: correctos.');
  }
 }
}finally{
 if(eventId&&!ui){await remove(eventId);console.log('Datos ficticios eliminados; registros anteriores conservados.');}
 if(cookie)await request('/logout',{}).catch(()=>{});await closeStore();
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import ExcelJS from 'exceljs';
import {registerTransport,transportEvent,previewTransport,undoTransport} from '../reception/transport.js';
import {attendanceWorkbook} from '../reception/attendance-export.js';

function fixture(){
 const event={_id:'evento',publicSlug:'a'.repeat(32),transportSlug:'b'.repeat(32),transportOpen:true,estado:'cerrado'};
 const guest={_id:'trabajador',eventId:event._id,rut:'12345678-5',nombre:'Trabajador ficticio',activo:true,transportPlan:{total:4},checkIn:null};
 const matches=(doc,filter)=>Object.entries(filter).every(([k,v])=>v===null?doc[k]==null:typeof v==='object'&&v.$exists!==undefined?Object.hasOwn(doc,k)===v.$exists:doc[k]===v);
 const collections={events:{findOne:async f=>matches(event,f)?event:null,updateOne:async(f,u)=>{const ok=matches(event,f);if(ok)Object.assign(event,u.$set);return{matchedCount:ok?1:0};}},guests:{findOne:async f=>matches(guest,f)?guest:null,findOneAndUpdate:async(f,u)=>{if(!matches(guest,f))return null;Object.assign(guest,u.$set);return guest;},find:()=>({project:()=>({toArray:async()=>[guest]})})}};
 return{event,guest,db:{collection:n=>collections[n]},input:{rut:'12.345.678-5',total:3,operationId:randomUUID()}};
}
test('bus registra trabajador + acompañantes sin marcar llegada y con recepción independiente',async()=>{
 const f=fixture(),result=await registerTransport(f.db,f.event,f.input);
 assert.equal(result.worker.companions,2);assert.equal(f.guest.checkIn,null);assert.equal(f.guest.transportCheckIn.plannedTotal,4);
 assert.equal(result.worker.rut,undefined);assert.equal(result.worker.grupoFamiliar,undefined);
});
test('bus simultáneo/reintento conserva primera cantidad y fecha sin sumar personas',async()=>{
 const f=fixture(),results=await Promise.all(Array.from({length:40},(_,i)=>registerTransport(f.db,f.event,{...f.input,total:i%5+1,operationId:randomUUID()})));
 assert.equal(results.filter(r=>r.code==='TRANSPORT_REGISTERED').length,1);const first=results[0].worker;
 for(const r of results){assert.equal(r.worker.companions,first.companions);assert.equal(r.worker.at,first.at);}
});
test('bus exige total entero incluyendo trabajador, RUT válido, evento abierto y trabajador activo del mismo evento',async()=>{
 for(const total of [0,-1,1.5,'3',null,52,NaN]){const f=fixture();await assert.rejects(registerTransport(f.db,f.event,{...f.input,total}),e=>e.code==='INVALID_COMPANIONS');assert.equal(f.guest.transportCheckIn,undefined);}
 let f=fixture();f.event.transportOpen=false;await assert.rejects(registerTransport(f.db,f.event,f.input),e=>e.code==='TRANSPORT_CLOSED');
 f=fixture();f.guest.activo=false;await assert.rejects(registerTransport(f.db,f.event,f.input),e=>e.code==='GUEST_NOT_FOUND');
 f=fixture();f.guest.eventId='otro';await assert.rejects(registerTransport(f.db,f.event,f.input),e=>e.code==='GUEST_NOT_FOUND');
 f=fixture();await assert.rejects(registerTransport(f.db,f.event,{...f.input,rut:'12345678-1'}),e=>e.code==='INVALID_RUT');
 f=fixture();await assert.rejects(registerTransport(f.db,f.event,{...f.input,operationId:'x'}),e=>e.code==='INVALID_OPERATION');
 f=fixture();const r=await registerTransport(f.db,f.event,{...f.input,total:1});assert.equal(r.worker.companions,0);
});
test('QR transporte es estable, independiente del QR original y diferente para cada evento',async()=>{
 const f=fixture(),old=f.event.publicSlug;delete f.event.transportSlug;
 const event=await transportEvent(f.db,f.event._id),slug=event.transportSlug;
 await Promise.all(Array.from({length:10},()=>transportEvent(f.db,f.event._id)));
 assert.equal(f.event.transportSlug,slug);assert.match(slug,/^[a-f0-9]{32}$/);assert.equal(f.event.publicSlug,old);
 const other=fixture();delete other.event.transportSlug;assert.notEqual((await transportEvent(other.db,other.event._id)).transportSlug,slug);
});
test('cruce de buses normaliza RUT, marca ambos duplicados y no inventa trabajadores',async()=>{
 const f=fixture(),sheet={rows:[{number:1,cells:['Nombre Completo','RUT (sin puntos)','Cuantas Personas en Bus']},{number:2,cells:['Uno','12.345.678-5','4']},{number:3,cells:['Dos','12345678-5','2']},{number:4,cells:['Otro','17412047-1','1']},{number:5,cells:['Error','12345678-1','0']}]};
 const rows=await previewTransport(f.db,f.event._id,sheet);
 assert.match(rows[0].errors.join(),/repetido/);assert.match(rows[1].errors.join(),/repetido/);assert.match(rows[2].errors.join(),/no está/);assert.equal(rows[3].errors.length,2);
 assert.equal(rows[0].workerId,f.guest._id);assert.equal(f.guest.transportPlan.total,4);
});
test('Excel distingue previsto y real, cero acompañantes y ausencia de registro sin fórmulas',async()=>{
 const f=fixture();await registerTransport(f.db,f.event,f.input);f.guest.nombre='=1+1';
 const buffer=await attendanceWorkbook({nombre:'Evento de prueba'},[f.guest,{nombre:'Sin viaje',rut:'17412047-1',activo:true}]);const book=new ExcelJS.Workbook();await book.xlsx.load(buffer);const sheet=book.worksheets[0];
 assert.equal(sheet.getCell('B2').value,'=1+1');assert.equal(sheet.getCell('K2').value,4);assert.equal(sheet.getCell('L2').value,3);assert.equal(sheet.getCell('N2').value,2);assert.equal(sheet.getCell('O2').value,3);assert.equal(sheet.getCell('P2').value,-1);assert.equal(sheet.getCell('H2').value,'Sin registro');assert.equal(sheet.getCell('M3').value,'Sin registro');assert.equal(sheet.getCell('N3').value,'');
 f.guest.transportCheckIn.companions=0;const zero=new ExcelJS.Workbook();await zero.xlsx.load(await attendanceWorkbook({nombre:'Prueba'},[f.guest]));assert.equal(zero.worksheets[0].getCell('N2').value,0);assert.equal(zero.worksheets[0].getCell('O2').value,1);
});
test('anular bus exige administrador y registro vigente, conserva llegada y guarda auditoría',async()=>{
 const guest={_id:'g',eventId:'e',rut:'12345678-5',checkIn:{at:new Date()},transportCheckIn:{at:new Date(),companions:2}},archives=[],user={_id:'u',role:'admin',active:true};const arrival=guest.checkIn;
 const db={collection:n=>n==='transport_reversals'?{insertOne:async v=>archives.push(v)}:{findOne:async f=>f._id===guest._id&&f.eventId===guest.eventId?guest:null,updateOne:async(f,u)=>{assert.equal(f['transportCheckIn.at'],guest.transportCheckIn.at);Object.assign(guest,u.$set);return{modifiedCount:1};}}};
 const input={confirm:true,rut:guest.rut,at:guest.transportCheckIn.at.toISOString()};
 await assert.rejects(undoTransport(db,{...user,role:'receptionist'},'e','g',input),e=>e.code==='FORBIDDEN');
 await assert.rejects(undoTransport(db,user,'e','g',{...input,at:new Date(0).toISOString()}),e=>e.code==='GUEST_CHANGED');
 await assert.rejects(undoTransport(db,user,'otro','g',input),e=>e.code==='NOT_FOUND');
 await undoTransport(db,user,'e','g',input);assert.equal(guest.transportCheckIn,null);assert.equal(guest.checkIn,arrival);assert.equal(archives.length,1);assert.equal(archives[0].previousTransportCheckIn.companions,2);
 assert.equal((await undoTransport(db,user,'e','g',input)).alreadyPending,true);assert.equal(archives.length,1);
});

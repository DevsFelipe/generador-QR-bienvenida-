import test from 'node:test';
import assert from 'node:assert/strict';
import {ObjectId} from 'mongodb';
import {randomUUID} from 'node:crypto';
import {addGuest} from '../reception/add-guest.js';

function setup(){
 const eventId=new ObjectId(),user={_id:new ObjectId(),username:'admin_ficticio',role:'admin',active:true},docs=[];
 let open=true;
 const db={collection(name){return name==='events'?{async findOne(){return {_id:eventId};},async updateOne(){return {matchedCount:open?1:0};}}:{async findOne(q){return docs.find(g=>String(g.eventId)===String(q.eventId)&&g.creationOperationId===q.creationOperationId)||null;},async insertOne(doc){if(docs.some(g=>g.rut===doc.rut||(doc.correoNormalizado&&doc.correoNormalizado===g.correoNormalizado))){const error=new Error('duplicate');error.code=11000;throw error;}const _id=new ObjectId();docs.push({...doc,_id});return{insertedId:_id};}};}};
 const input={nombre:'Persona ficticia',rut:'12.345.678-5',mesa:'8',menu:'Vegetariano',operationId:randomUUID()};
 return{db,eventId,user,docs,input,close(){open=false;}};
}
test('alta individual normaliza RUT y permite correo e institución vacíos',async()=>{
 const f=setup();const result=await addGuest(f.db,f.user,f.eventId,f.input,{});assert.ok(result.created);assert.equal(result.checkedIn,false);assert.equal(f.docs.length,1);assert.equal(f.docs[0].rut,'12345678-5');assert.equal(f.docs[0].checkIn,null);assert.equal(f.docs[0].createdBy,f.user._id);
});
test('guardar y registrar ingreso conserva operador, método y la misma fecha de alta',async()=>{
 const f=setup();const result=await addGuest(f.db,f.user,f.eventId,{...f.input,registerNow:true},{});assert.equal(result.checkedIn,true);assert.equal(f.docs[0].checkIn.by,f.user._id);assert.equal(f.docs[0].checkIn.method,'manual');assert.equal(f.docs[0].checkIn.at,f.docs[0].createdAt);
 const originalTime=f.docs[0].checkIn.at;f.close();const retry=await addGuest(f.db,f.user,f.eventId,{...f.input,registerNow:true},{});assert.equal(retry.created,false);assert.equal(retry.checkedIn,true);assert.equal(f.docs.length,1);assert.equal(f.docs[0].checkIn.at,originalTime);
});
test('recepción cerrada impide alta con ingreso pero permite guardar pendiente',async()=>{
 const f=setup();f.close();await assert.rejects(addGuest(f.db,f.user,f.eventId,{...f.input,registerNow:true},{}),e=>e.code==='EVENT_CLOSED');assert.equal(f.docs.length,0);await addGuest(f.db,f.user,f.eventId,f.input,{});assert.equal(f.docs[0].checkIn,null);
});
test('alta rechaza RUT duplicado sin modificar datos ni asistencia existentes',async()=>{
 const f=setup();await addGuest(f.db,f.user,f.eventId,{...f.input,registerNow:true},{});const original={...f.docs[0]};await assert.rejects(addGuest(f.db,f.user,f.eventId,{...f.input,nombre:'Otra persona',mesa:'Otra mesa',operationId:randomUUID()},{}),e=>e.code===11000);assert.equal(f.docs.length,1);assert.deepEqual(f.docs[0],original);
});
test('rechaza usuarios no administradores, datos inválidos y operaciones sin identificador',async()=>{
 const f=setup();await assert.rejects(addGuest(f.db,{...f.user,role:'receptionist'},f.eventId,f.input,{}),e=>e.code==='FORBIDDEN');await assert.rejects(addGuest(f.db,{...f.user,active:false},f.eventId,f.input,{}),e=>e.code==='FORBIDDEN');await assert.rejects(addGuest(f.db,f.user,f.eventId,{...f.input,mesa:''},{}));await assert.rejects(addGuest(f.db,f.user,f.eventId,{...f.input,rut:'12345678-9'},{}));await assert.rejects(addGuest(f.db,f.user,f.eventId,{...f.input,operationId:''},{}),e=>e.code==='INVALID_OPERATION');assert.equal(f.docs.length,0);
});

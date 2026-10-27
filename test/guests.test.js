import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {importGuests,issueMissingQR} from '../src/guests.js';
// Doble de almacenamiento: verifica reglas del servicio, no conectividad MongoDB.
function storage() {
 const docs=[];
 return {docs,async insertOne(doc){if(docs.some(d=>d.eventId===doc.eventId&&d.correoNormalizado===doc.correoNormalizado)){const error=new Error('duplicate');error.code=11000;throw error;}docs.push({...doc,_id:docs.length+1});},find(query){const results=docs.filter(d=>d.eventId===query.eventId&&!d.tokenHash);return{project(){return{async toArray(){return results.map(d=>({_id:d._id}));}};}};},async updateOne(query,update){const doc=docs.find(d=>d._id===query._id&&d.eventId===query.eventId&&!d.tokenHash);if(!doc)return{modifiedCount:0};Object.assign(doc,update.$set);return{modifiedCount:1};}};
}
const row={nombre:'Ana',correo:'ana@example.cl',correoNormalizado:'ana@example.cl',institucion:'UC',errors:[]};
test('persistir primero; repetir conserva QR y asistencia',async()=>{
 const collection=storage(),key=randomBytes(32).toString('hex');
 assert.equal(await issueMissingQR(collection,'evento',key),0);
 await importGuests(collection,'evento',[row]);assert.equal(collection.docs[0].tokenHash,undefined);assert.equal(collection.docs[0].checkIn,null);
 assert.equal(await issueMissingQR(collection,'evento',key),1);const hash=collection.docs[0].tokenHash;collection.docs[0].checkIn={at:new Date()};
 assert.deepEqual(await importGuests(collection,'evento',[row]),{created:0,skipped:1,rejected:0});assert.equal(await issueMissingQR(collection,'evento',key),0);assert.equal(collection.docs[0].tokenHash,hash);assert.ok(collection.docs[0].checkIn);
});
test('fallar la inserción no emite token ni aparenta éxito',async()=>{
 let updates=0;const collection={async insertOne(){throw new Error('disconnected');},async updateOne(){updates++;}};
 await assert.rejects(importGuests(collection,'evento',[row]),/disconnected/);assert.equal(updates,0);
});
test('eventos independientes y filas inválidas excluidas',async()=>{
 const collection=storage();await importGuests(collection,'uno',[row]);assert.deepEqual(await importGuests(collection,'dos',[row,{...row,errors:['inválido']}]),{created:1,skipped:0,rejected:1});assert.equal(collection.docs.length,2);
});

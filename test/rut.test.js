import test from 'node:test';
import assert from 'node:assert/strict';
import {ObjectId} from 'mongodb';
import {randomUUID} from 'node:crypto';
import {normalizeRut,guestInput} from '../reception/rut.js';
import {previewRows} from '../reception/imports.js';
import {registerRut} from '../reception/public-checkin.js';
test('RUT con y sin formato, K mayúscula y dígito inválido',()=>{
 assert.equal(normalizeRut('12.345.678-5'),'12345678-5');assert.equal(normalizeRut('123456785'),'12345678-5');
 assert.throws(()=>normalizeRut('12.345.678-9'));assert.throws(()=>normalizeRut(''));assert.throws(()=>normalizeRut({$ne:null}));
});
test('correo opcional y asignaciones obligatorias',()=>{
 const data=guestInput({nombre:'Ana ficticia',rut:'123456785',mesa:'4',menu:'Vegetariano'});assert.equal(data.rut,'12345678-5');assert.equal(data.correoNormalizado,undefined);
 assert.throws(()=>guestInput({...data,mesa:''}));assert.throws(()=>guestInput({...data,menu:''}));
});
test('vista previa conserva primera persona, detecta duplicados RUT y menú vacío',()=>{
 const sheet={rows:[{number:1,cells:['Nombre','RUT','Mesa','Menú']},{number:2,cells:['Ana','12345678-5','4','Normal']},{number:3,cells:['Ana2','12.345.678-5','5','Normal']},{number:4,cells:['Luis','12345678-5','6','']}]};
 const result=previewRows(sheet,0,{nombre:0,rut:1,mesa:2,menu:3});assert.equal(result[0].errors.length,0);assert.match(result[1].errors.join(),/repetido/);assert.ok(result[2].errors.length);assert.throws(()=>previewRows(sheet,0,{nombre:0,rut:0,mesa:2,menu:3}));
});
test('autoregistro público mantiene primera hora, limita datos y rechaza asignación incompleta',async()=>{
 const event={_id:new ObjectId(),publicSlug:'a'.repeat(32)},guest={nombre:'Ana ficticia',mesa:'12',menu:'Vegano',correo:'privado@example.cl',rut:'12345678-5',checkIn:null};
 let opened=true;
 const db={collection(name){return name==='events'?{async findOne(){return opened?event:null;}}:{async findOne(filter){return filter.rut===guest.rut?guest:null;},async findOneAndUpdate(){if(guest.checkIn)return null;guest.checkIn={at:new Date()};return guest;}};}};
 let result=await registerRut(db,event,{rut:'12.345.678-5',operationId:randomUUID()});assert.equal(result.code,'CHECKED_IN');assert.deepEqual(Object.keys(result.guest).sort(),['at','menu','mesa','nombre']);const at=guest.checkIn.at;
 result=await registerRut(db,event,{rut:'123456785',operationId:randomUUID()});assert.equal(result.code,'ALREADY_CHECKED_IN');assert.equal(result.guest.at,at);
 guest.menu='';await assert.rejects(registerRut(db,event,{rut:'123456785',operationId:randomUUID()}),e=>e.code==='ASSIGNMENT_PENDING');
 opened=false;await assert.rejects(registerRut(db,event,{rut:'123456785',operationId:randomUUID()}),e=>e.code==='EVENT_CLOSED');
});

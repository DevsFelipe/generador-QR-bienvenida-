import test from 'node:test';
import assert from 'node:assert/strict';
import {guestInput} from '../reception/rut.js';
import {previewRows,saveGuest} from '../reception/imports.js';
const base={nombre:'Invitada ficticia',rut:'12345678-5',mesa:'1',menu:'Tradicional'};
test('familia admite cero niños, normaliza texto y rechaza cantidades inválidas',()=>{
 const g=guestInput({...base,grupoFamiliar:' Familia Uno ',numeroNinos:'0',nombreColaborador:' Colaborador Uno '});assert.equal(g.numeroNinos,0);assert.equal(g.grupoFamiliar,'Familia Uno');assert.equal(g.nombreColaborador,'Colaborador Uno');
 assert.equal(guestInput({...base,numeroNinos:'2'}).numeroNinos,2);
 for(const value of ['-1','1.5','abc',true,{},'9007199254740992'])assert.throws(()=>guestInput({...base,numeroNinos:value}),/Niños/);
 assert.equal(guestInput(base).numeroNinos,undefined);assert.equal(guestInput({...base,numeroNinos:''}).numeroNinos,null);
});
test('importación familiar conserva valores y detecta columnas reutilizadas',()=>{
 const sheet={rows:[{number:1,cells:['Nombre','RUT','Mesa','Menú','Grupo Familiar','N° Niños','nombre colaborador']},{number:2,cells:[base.nombre,base.rut,base.mesa,base.menu,'Grupo A','0','Colaborador A']}]};
 const map={nombre:0,rut:1,mesa:2,menu:3,grupoFamiliar:4,numeroNinos:5,nombreColaborador:6};const [row]=previewRows(sheet,0,map);assert.deepEqual(row.errors,[]);assert.equal(row.data.numeroNinos,0);assert.equal(row.data.nombreColaborador,'Colaborador A');
 assert.throws(()=>previewRows(sheet,0,{...map,nombreColaborador:0}));
 const [legacy]=previewRows(sheet,0,{nombre:0,rut:1,mesa:2,menu:3});assert.equal(Object.hasOwn(legacy.data,'grupoFamiliar'),false);
});
test('reimportar planilla anterior conserva familia y asistencia existentes',async()=>{
 const stored={...base,grupoFamiliar:'Familia A',numeroNinos:2,nombreColaborador:'Colaborador A',checkIn:{at:new Date('2026-10-30T22:00:00Z')}};
 const originalCheckIn=stored.checkIn;
 const collection={findOne:async()=>stored,updateOne:async(_,operation)=>Object.assign(stored,operation.$set)};
 await saveGuest(collection,'event',guestInput(base),{update:true});assert.equal(stored.numeroNinos,2);assert.equal(stored.grupoFamiliar,'Familia A');assert.equal(stored.checkIn,originalCheckIn);
});


test('confirmación pública expone familia y cero niños sin revelar correo ni RUT',async()=>{
 const {registerRut}=await import('../reception/public-checkin.js');const {randomUUID}=await import('node:crypto');
 const event={_id:'evento',publicSlug:'a'.repeat(32)},guest={...base,grupoFamiliar:'Familia Uno',numeroNinos:0,nombreColaborador:'Dato administrativo',correo:'privado@example.cl',checkIn:null};
 const db={collection(name){return name==='events'?{findOne:async()=>event}:{findOne:async()=>guest,findOneAndUpdate:async()=>{if(guest.checkIn)return null;guest.checkIn={at:new Date()};return guest;}};}};
 const first=await registerRut(db,event,{rut:base.rut,operationId:randomUUID()});assert.equal(first.guest.grupoFamiliar,'Familia Uno');assert.equal(first.guest.numeroNinos,0);assert.equal(first.guest.rut,undefined);assert.equal(first.guest.correo,undefined);assert.equal(first.guest.nombreColaborador,undefined);
 const repeat=await registerRut(db,event,{rut:base.rut,operationId:randomUUID()});assert.equal(repeat.code,'ALREADY_CHECKED_IN');assert.equal(repeat.guest.numeroNinos,0);assert.equal(repeat.guest.at,first.guest.at);
 delete guest.grupoFamiliar;delete guest.numeroNinos;const legacy=await registerRut(db,event,{rut:base.rut,operationId:randomUUID()});assert.equal(legacy.guest.grupoFamiliar,null);assert.equal(legacy.guest.numeroNinos,null);
});

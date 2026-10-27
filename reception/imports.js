import {guestInput} from './rut.js';
export const fields=['nombre','rut','mesa','menu','correo','institucion'];
export function previewRows(sheet,header,mapping){
 if(!Number.isInteger(header)||header<0||header>=sheet.rows.length-1)throw new Error('Selecciona la fila de encabezados.');
 const required=fields.slice(0,4),indices=fields.filter(k=>mapping[k]!==null&&mapping[k]!==undefined&&mapping[k]!=='').map(k=>Number(mapping[k]));
 if(required.some(k=>mapping[k]===null||mapping[k]===undefined||mapping[k]==='')||indices.some(n=>!Number.isInteger(n)||n<0||n>=100)||new Set(indices).size!==indices.length)throw new Error('Asocia columnas diferentes para nombre, RUT, mesa y menú.');
 const seen=new Set();return sheet.rows.slice(header+1).map(row=>{
  const raw=Object.fromEntries(fields.map(k=>[k,mapping[k]===null||mapping[k]===undefined||mapping[k]===''?'':String(row.cells[Number(mapping[k])]??'').trim()]));
  let data=raw,errors=[];try{data=guestInput(raw);if(seen.has(data.rut))errors.push('RUT repetido en la planilla');seen.add(data.rut);}catch(e){errors.push(e.message);}
  return{number:row.number,data,errors};
 });
}
export async function saveGuest(collection,eventId,data,{update=false,guestId}={}){
 let existing=guestId?await collection.findOne({_id:guestId,eventId}):await collection.findOne({eventId,rut:data.rut});
 // Vinculación controlada del registro anterior: solo por el mismo correo y sin RUT previo.
 if(!existing&&!guestId&&data.correoNormalizado)existing=await collection.findOne({eventId,correoNormalizado:data.correoNormalizado,rut:{$exists:false}});
 if(guestId&&!existing)throw new Error('Persona no encontrada en este evento.');
 if(existing){
  if(!update)return 'skipped';
  const set={...data,updatedAt:new Date()};const operation={$set:set};
  if(!data.correoNormalizado)operation.$unset={correoNormalizado:''};
  await collection.updateOne({_id:existing._id,eventId},operation);return 'updated';
 }
 await collection.insertOne({eventId,...data,activo:true,checkIn:null,createdAt:new Date()});return 'created';
}

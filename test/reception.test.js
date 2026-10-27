import test from 'node:test';
import assert from 'node:assert/strict';
import {ObjectId} from 'mongodb';
import {randomBytes,randomUUID} from 'node:crypto';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import {passwordHash,passwordMatches,mayAccess} from '../reception/auth.js';
import {tokenHash,registerInTransaction} from '../reception/checkin.js';

function fixture(){
 const eventId=new ObjectId(),user={_id:new ObjectId(),username:'operador',active:true,role:'receptionist',eventIds:[eventId]};
 const qr='GALAQR1:'+randomBytes(32).toString('base64url');
 const event={_id:eventId,estado:'recepcion_abierta'};
 const guest={_id:new ObjectId(),eventId,activo:true,tokenHash:tokenHash(qr),nombre:'Ana ficticia',institucion:'Prueba',checkIn:null};
 const match=(doc,filter)=>Object.entries(filter).every(([k,v])=>k==='checkIn'?doc[k]===v:String(doc[k])===String(v));
 const guests={async findOne(filter){return match(guest,filter)?guest:null;},async findOneAndUpdate(filter,update){if(!match(guest,filter))return null;Object.assign(guest,update.$set);return guest;}};
 const db={collection(name){return name==='guests'?guests:{async findOne(filter){return match(event,filter)?event:null;},async updateOne(filter){return{matchedCount:match(event,filter)?1:0};}};}};
 return{db,user,eventId,guest,event,qr,input:{qr,operationId:randomUUID()}};
}
test('contraseñas con sal, verificación y permisos por evento',async()=>{
 const hash=await passwordHash('clave-ficticia-1234');assert.ok(await passwordMatches('clave-ficticia-1234',hash));assert.equal(await passwordMatches('otra',hash),false);assert.notEqual(hash,await passwordHash('clave-ficticia-1234'));
 const f=fixture();assert.ok(mayAccess(f.user,f.eventId));assert.equal(mayAccess(f.user,new ObjectId()),false);assert.equal(mayAccess({...f.user,active:false},f.eventId),false);
});
test('QR generado puede decodificarse y coincide con el hash del registro',()=>{
 const payload='GALAQR1:'+randomBytes(32).toString('base64url'),matrix=QRCode.create(payload).modules,scale=7,size=(matrix.size+8)*scale;
 const pixels=new Uint8ClampedArray(size*size*4).fill(255);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const mx=Math.floor(x/scale)-4,my=Math.floor(y/scale)-4;if(mx>=0&&my>=0&&mx<matrix.size&&my<matrix.size&&matrix.get(my,mx)){const i=(y*size+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=0;}}
 const decoded=jsQR(pixels,size,size);assert.equal(decoded.data,payload);assert.equal(tokenHash(decoded.data),tokenHash(payload));assert.throws(()=>tokenHash('otro QR'));
});
test('dos lecturas conservan una sola hora y operador de ingreso',async()=>{
 const f=fixture();const results=await Promise.all(Array.from({length:5},()=>registerInTransaction(f.db,f.user,f.eventId,{...f.input,operationId:randomUUID()})));
 assert.equal(results.filter(r=>r.code==='CHECKED_IN').length,1);assert.equal(results.filter(r=>r.code==='ALREADY_CHECKED_IN').length,4);assert.equal(f.guest.checkIn.operator,'operador');assert.equal(f.guest.checkIn.method,'qr');
});
test('evento cerrado, QR ajeno, usuario sin permiso e invitado inactivo no registran',async()=>{
 let f=fixture();f.event.estado='cerrado';await assert.rejects(registerInTransaction(f.db,f.user,f.eventId,f.input),e=>e.code==='EVENT_CLOSED');assert.equal(f.guest.checkIn,null);
 f=fixture();await assert.rejects(registerInTransaction(f.db,{...f.user,eventIds:[]},f.eventId,f.input),e=>e.code==='FORBIDDEN');
 f=fixture();await assert.rejects(registerInTransaction(f.db,f.user,f.eventId,{...f.input,qr:'GALAQR1:'+randomBytes(32).toString('base64url')}),e=>e.code==='INVALID_QR');assert.equal(f.guest.checkIn,null);
 f=fixture();f.guest.activo=false;await assert.rejects(registerInTransaction(f.db,f.user,f.eventId,f.input),e=>e.code==='INVALID_QR');assert.equal(f.guest.checkIn,null);
});
test('ingreso manual deja trazabilidad y exige pertenencia al evento',async()=>{
 const f=fixture();const result=await registerInTransaction(f.db,f.user,f.eventId,{method:'manual',guestId:String(f.guest._id),operationId:randomUUID()});assert.equal(result.code,'CHECKED_IN');assert.equal(f.guest.checkIn.method,'manual');
 const other=fixture();await assert.rejects(registerInTransaction(other.db,other.user,other.eventId,{method:'manual',guestId:String(f.guest._id),operationId:randomUUID()}),e=>e.code==='INVALID_QR');assert.equal(other.guest.checkIn,null);
});

import express from 'express';
import multer from 'multer';
import QRCode from 'qrcode';
import ExcelJS from 'exceljs';
import {randomBytes,randomUUID} from 'node:crypto';
import {store} from './store.js';
import {config} from './config.js';
import {ReceptionError,objectId} from './checkin.js';
import {digest} from './auth.js';
import {readExcel} from './excel.js';
import {previewRows,saveGuest} from './imports.js';
import {guestInput} from './rut.js';
import {registerRut} from './public-checkin.js';
import {addGuest} from './add-guest.js';

export const publicRoutes=express.Router(),adminRoutes=express.Router();
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1}});
const previews=new Map();
function eventFields(body){const out={};for(const key of ['nombre','fecha','lugar']){if(typeof body[key]!=='string'||!body[key].trim()||body[key].length>300)throw new ReceptionError('INVALID_EVENT');out[key]=body[key].trim();}return{...out,timezone:'America/Santiago'};}
async function eventPublic(slug,db){if(!/^[a-f0-9]{32}$/.test(slug))throw new ReceptionError('NOT_FOUND',404);const e=await db.collection('events').findOne({publicSlug:slug});if(!e)throw new ReceptionError('NOT_FOUND',404);return e;}
async function consume(db,key,maximum,window){const bucket=Math.floor(Date.now()/window);const result=await db.collection('public_limits').findOneAndUpdate({_id:digest(key+':'+bucket)},{$inc:{count:1},$setOnInsert:{expiresAt:new Date((bucket+2)*window)}},{upsert:true,returnDocument:'after'});if(result.count>maximum)throw new ReceptionError('PUBLIC_RATE_LIMIT',429);}
publicRoutes.get('/:slug',async(req,res)=>{const {db}=await store();const e=await eventPublic(req.params.slug,db);res.json({nombre:e.nombre,fecha:e.fecha,lugar:e.lugar,open:e.estado==='recepcion_abierta'});});
publicRoutes.post('/:slug/check-in',async(req,res)=>{
 const {db}=await store();await consume(db,'ip:'+req.ip,300,60000);
 // Validación del formato antes de usar el RUT para limitar intentos. Solo persiste un hash.
 if(typeof req.body.rut!=='string'||req.body.rut.length>30)throw new ReceptionError('INVALID_RUT');
 await consume(db,'rut:'+req.ip+':'+req.params.slug+':'+req.body.rut.replace(/[.\s-]/g,'').toUpperCase(),8,600000);
 const e=await eventPublic(req.params.slug,db);
 res.json(await registerRut(db,e,req.body));
});

adminRoutes.use((req,res,next)=>{if(req.user.role!=='admin')throw new ReceptionError('FORBIDDEN',403);next();});
adminRoutes.post('/events',async(req,res)=>{const data={...eventFields(req.body),estado:'borrador',createdAt:new Date()};const result=await(await store()).db.collection('events').insertOne(data);res.json({...data,_id:result.insertedId});});
adminRoutes.put('/events/:event',async(req,res)=>{const result=await(await store()).db.collection('events').updateOne({_id:objectId(req.params.event)},{$set:eventFields(req.body)});if(!result.matchedCount)throw new ReceptionError('NOT_FOUND',404);res.json({ok:true});});
adminRoutes.get('/events/:event/guests',async(req,res)=>{
 const eventId=objectId(req.params.event);res.json(await(await store()).db.collection('guests').find({eventId}).project({nombre:1,rut:1,correo:1,institucion:1,mesa:1,menu:1,activo:1,checkIn:1}).sort({nombre:1}).limit(5000).toArray());
});
adminRoutes.post('/events/:event/guests',async(req,res)=>{
 try{guestInput(req.body);}catch(e){return res.status(400).json({code:'VALIDATION',message:e.message});}
 const eventId=objectId(req.params.event),{db,client}=await store(),session=client.startSession();
 try{
  const result=await session.withTransaction(async()=>{
   const user=await db.collection('reception_users').findOne({_id:req.user._id,active:true},{session});
   return addGuest(db,user,eventId,req.body,session);
  },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'}});
  res.status(result.created?201:200).json(result);
 }catch(e){if(e.code===11000)throw new ReceptionError('DUPLICATE_GUEST',409);throw e;}
 finally{await session.endSession();}
});
adminRoutes.put('/events/:event/guests/:guest',async(req,res)=>{
 let data;try{data=guestInput(req.body);}catch(e){return res.status(400).json({code:'VALIDATION',message:e.message});}
 try{const result=await saveGuest((await store()).db.collection('guests'),objectId(req.params.event),data,{update:true,guestId:objectId(req.params.guest)});res.json({result});}catch(e){if(e.code===11000)throw new ReceptionError('DUPLICATE_GUEST',409);throw e;}
});
adminRoutes.get('/template',async(req,res)=>{
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Invitados');sheet.addRow(['nombre','rut','correo','institucion','mesa','menu']);sheet.addRow(['Persona de ejemplo','12.345.678-5','','Institución','12','Vegetariano']);sheet.columns.forEach(c=>c.width=25);
 res.attachment('plantilla-invitados.xlsx').send(Buffer.from(await book.xlsx.writeBuffer()));
});
adminRoutes.post('/excel',upload.single('file'),async(req,res)=>{
 if(!req.file||!(/\.xlsx$/i.test(req.file.originalname)))throw new ReceptionError('XLSX_REQUIRED');
 const sheets=await readExcel(req.file.buffer);for(const [k,v]of previews)if(v.expires<Date.now())previews.delete(k);if(previews.size>=5)previews.delete(previews.keys().next().value);
 const previewId=randomUUID();previews.set(previewId,{sheets,user:String(req.user._id),expires:Date.now()+30*60000});res.json({previewId,sheets});
});
function validated(req){const item=previews.get(req.body.previewId);if(!item||item.expires<Date.now()||item.user!==String(req.user._id))throw new ReceptionError('PREVIEW_EXPIRED');const sheet=item.sheets[Number(req.body.sheet)];if(!sheet)throw new ReceptionError('INVALID_SHEET');return previewRows(sheet,Number(req.body.header),req.body.mapping||{});}
adminRoutes.post('/imports/preview',(req,res)=>{try{res.json(validated(req));}catch(e){res.status(400).json({code:'VALIDATION',message:e instanceof ReceptionError?undefined:e.message});}});
adminRoutes.post('/events/:event/import',async(req,res)=>{
 const eventId=objectId(req.params.event),{db}=await store();if(!await db.collection('events').findOne({_id:eventId}))throw new ReceptionError('NOT_FOUND',404);
 const rows=validated(req);if(rows.some(r=>r.errors.length)&&req.body.excludeInvalid!==true)throw new ReceptionError('INVALID_ROWS');
 const result={created:0,updated:0,skipped:0,rejected:rows.filter(r=>r.errors.length).length,conflicts:[]};
 for(const row of rows.filter(r=>!r.errors.length)){try{const status=await saveGuest(db.collection('guests'),eventId,row.data,{update:req.body.updateExisting===true});result[status]++;}catch(e){if(e.code===11000){result.rejected++;result.conflicts.push({row:row.number,message:'RUT o correo ya asociado a otra persona.'});}else throw e;}}
 await db.collection('imports').insertOne({eventId,operator:req.user._id,createdAt:new Date(),...result});res.json(result);
});
adminRoutes.post('/events/:event/public-qr',async(req,res)=>{
 const eventId=objectId(req.params.event),{db}=await store();
 await db.collection('events').updateOne({_id:eventId,publicSlug:{$exists:false}},{$set:{publicSlug:randomBytes(16).toString('hex')}});
 const event=await db.collection('events').findOne({_id:eventId});if(!event)throw new ReceptionError('NOT_FOUND',404);
 const url=config.origin+'/e/'+event.publicSlug;res.json({url,png:await QRCode.toDataURL(url,{width:600,margin:4,errorCorrectionLevel:'M'})});
});

import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import {randomBytes,randomUUID} from 'node:crypto';
import QRCode from 'qrcode';
import {fileURLToPath} from 'node:url';
import {db,id} from './store.js';
import {readExcel} from './excel.js';
import {validateRows,qrPayload,emailValid,invitation} from './domain.js';
import {transport,message,job,runCampaign} from './mail.js';
import {importGuests,issueMissingQR} from './guests.js';

const app = express(), csrf = randomBytes(32).toString('hex');
const port = Number(process.env.PORT || 3210), origin = `http://127.0.0.1:${port}`;
const previews = new Map();
const upload = multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1}});
app.disable('x-powered-by');
app.use((req,res,next)=>{
  if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) return res.status(403).json({error:'Acceso local únicamente.'});
  res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});
  if (!['GET','HEAD'].includes(req.method)) {
    if (req.headers['x-csrf-token'] !== csrf || (req.headers.origin && ![origin,`http://localhost:${port}`].includes(req.headers.origin))) return res.status(403).json({error:'Recarga la aplicación e inténtalo nuevamente.'});
  }
  next();
});
app.use(express.json({limit:'200kb'}));
app.use(express.static(fileURLToPath(new URL('../public',import.meta.url))));
app.get('/api/status',async(req,res)=>{
  let connected=false;
  try { await (await db()).command({ping:1}); connected=true; } catch { /* Mostrar configuración pendiente sin exponer credenciales. */ }
  res.json({csrf,connected,qrConfigured:/^[a-f0-9]{64}$/i.test(process.env.QR_KEY||''),smtpConfigured:!!(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASS&&process.env.MAIL_FROM),job});
});
async function eventFor(value) {
  const event = await (await db()).collection('events').findOne({_id:id(value)});
  if (!event) throw new Error('Evento no encontrado.');
  return event;
}
function eventInput(body) {
  const output = {};
  for(const field of ['nombre','fecha','lugar','asunto','texto']) {
    if (typeof body[field]!=='string' || !body[field].trim() || body[field].length>(field==='texto'?10000:300)) throw new Error('Completa los datos del evento dentro del largo permitido.');
    output[field]=body[field].trim();
  }
  return {...output,timezone:'America/Santiago'};
}
app.get('/api/events',async(req,res)=>res.json(await (await db()).collection('events').find({}).sort({createdAt:-1}).toArray()));
app.post('/api/events',async(req,res)=>{
  const event = {...eventInput(req.body),estado:'borrador',createdAt:new Date()};
  const result = await (await db()).collection('events').insertOne(event);
  res.json({...event,_id:result.insertedId});
});
app.put('/api/events/:event',async(req,res)=>{
  if(job.running) throw new Error('Espera que termine el envío antes de editar el evento.');
  await eventFor(req.params.event);
  await (await db()).collection('events').updateOne({_id:id(req.params.event)},{$set:eventInput(req.body)});
  res.json({ok:true});
});
app.post('/api/excel',upload.single('file'),async(req,res)=>{
  if (!req.file || !/\.xlsx$/i.test(req.file.originalname)) throw new Error('Selecciona un archivo .xlsx sin macros.');
  const sheets = await readExcel(req.file.buffer);
  for (const [key,value] of previews) if(value.expires<Date.now()) previews.delete(key);
  if(previews.size>=5) previews.delete(previews.keys().next().value);
  const previewId=randomUUID();
  previews.set(previewId,{sheets,expires:Date.now()+30*60*1000});
  res.json({previewId,sheets});
});
function validated(body) {
  const preview = previews.get(body.previewId);
  if (!preview || preview.expires<Date.now()) throw new Error('La vista previa venció. Vuelve a cargar el Excel.');
  const sheet = preview.sheets[Number(body.sheet)];
  const header = Number(body.header);
  if(!sheet || !Number.isInteger(header) || header<0 || header>=sheet.rows.length-1) throw new Error('Selecciona la hoja y la fila de encabezados.');
  const rows = sheet.rows.slice(header+1);
  if(rows.length>5000) throw new Error('Máximo 5.000 invitados.');
  return validateRows(rows,body.mapping || {});
}
app.post('/api/import/preview',(req,res)=>res.json(validated(req.body)));
app.post('/api/events/:event/import',async(req,res)=>{
  if(job.running) throw new Error('Espera que termine el envío antes de importar.');
  const event=await eventFor(req.params.event), rows=validated(req.body);
  if(rows.some(r=>r.errors.length) && req.body.excludeInvalid!==true) throw new Error('Hay filas con errores. Corrige el archivo o confirma su exclusión.');
  const store=await db(), result=await importGuests(store.collection('guests'),event._id,rows);
  await store.collection('imports').insertOne({eventId:event._id,...result,createdAt:new Date()});
  res.json(result);
});
app.get('/api/events/:event/guests',async(req,res)=>{
  const event=await eventFor(req.params.event);
  const guests=await (await db()).collection('guests').find({eventId:event._id}).project({tokenHash:0,tokenEncrypted:0}).sort({nombre:1}).limit(5000).toArray();
  res.json(guests);
});
app.post('/api/events/:event/qr',async(req,res)=>{
  if(job.running) throw new Error('Espera que termine el envío.');
  const event=await eventFor(req.params.event), store=await db();
  const generated=await issueMissingQR(store.collection('guests'),event._id,process.env.QR_KEY);
  res.json({generated});
});
async function guestFor(eventId,guestId) {
  const guest=await (await db()).collection('guests').findOne({_id:id(guestId),eventId:id(eventId),activo:true});
  if(!guest?.tokenEncrypted) throw new Error('Genera primero el QR del invitado.');
  return guest;
}
app.get('/api/events/:event/guests/:guest/qr',async(req,res)=>{
  const guest=await guestFor(req.params.event,req.params.guest);
  res.type('png').send(await QRCode.toBuffer(qrPayload(guest.tokenEncrypted,process.env.QR_KEY),{width:360,margin:4}));
});
app.get('/api/events/:event/guests/:guest/preview',async(req,res)=>{
  const event=await eventFor(req.params.event),guest=await guestFor(req.params.event,req.params.guest);
  const png=await QRCode.toDataURL(qrPayload(guest.tokenEncrypted,process.env.QR_KEY),{width:240,margin:4});
  res.json({html:invitation(event,guest).replace('cid:invitacion-qr',png)});
});
app.post('/api/events/:event/test',async(req,res)=>{
  if(!emailValid(req.body.to)) throw new Error('Ingresa el correo de prueba.');
  const event=await eventFor(req.params.event),guest=await guestFor(req.params.event,req.body.guestId);
  const mailer=transport();
  const info=await mailer.sendMail(await message(event,guest,req.body.to));
  res.json({accepted:!!info.accepted?.length});
});
app.post('/api/events/:event/send',async(req,res)=>{
  if(job.running) throw new Error('Ya hay un envío en curso.');
  const event=await eventFor(req.params.event);
  transport();
  Object.assign(job,{running:true,processed:0,accepted:0,uncertain:0,error:null});
  void runCampaign(event).catch(()=>{job.error='No se pudo completar el envío. Revisa la conexión, SMTP y los registros que requieren revisión.';}).finally(()=>{job.running=false;});
  res.json({ok:true});
});
app.post('/api/events/:event/guests/:guest/retry',async(req,res)=>{
  if(job.running) throw new Error('Espera que termine el envío.');
  if(req.body.confirm!==true) throw new Error('Confirma el posible reenvío.');
  const store=await db();
  const result=await store.collection('guests').updateOne({_id:id(req.params.guest),eventId:id(req.params.event),'mail.status':{$in:['uncertain','sending','failed']}},{$set:{'mail.status':'pending','mail.reviewedAt':new Date()}});
  res.json({updated:result.modifiedCount});
});
app.use((error,req,res,next)=>{
  const expected=error.message && !/mongo|smtp|password|credential|ENOTFOUND|ECONN|authentication/i.test(error.message);
  res.status(400).json({error:error instanceof multer.MulterError?'Archivo demasiado grande o carga inválida.':expected?error.message:'No se pudo completar la operación. Revisa la conexión y la configuración del servicio.'});
});
app.listen(port,'127.0.0.1',()=>console.log(`Aplicación local disponible en ${origin}`));

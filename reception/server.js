import express from 'express';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {config} from './config.js';
import {store} from './store.js';
import {digest,passwordMatches,mayAccess,sessionToken} from './auth.js';
import {ReceptionError,objectId,guestView,registerInTransaction} from './checkin.js';
import {publicRoutes,adminRoutes} from './routes.js';

export const app=express();const failures=new Map();
if(process.env.RECEPTION_TRUST_PROXY==='true')app.set('trust proxy',1);
app.disable('x-powered-by');
// Render consulta esta ruta sin cookies ni el Host público de la aplicación.
// No expone información de conexión ni datos de invitados.
app.get('/healthz',(req,res)=>res.json({ok:true}));
app.use((req,res,next)=>{
 res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(self)','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});
 if(req.headers.host!==new URL(config.origin).host)return res.status(403).json({code:'FORBIDDEN'});
 if(config.production&&!req.secure)return res.status(400).json({code:'HTTPS_REQUIRED'});
 if(!['GET','HEAD'].includes(req.method)&&req.headers.origin!==config.origin)return res.status(403).json({code:'FORBIDDEN'});
 next();
});
app.use(express.json({limit:'8kb'}));
app.get('/',(req,res)=>res.sendFile(fileURLToPath(new URL('./public/admin.html',import.meta.url))));
app.get('/index.html',(req,res)=>res.redirect('/'));
app.get('/vendor/jsqr.js',(req,res)=>res.sendFile(fileURLToPath(new URL('../node_modules/jsqr/dist/jsQR.js',import.meta.url))));
app.use(express.static(fileURLToPath(new URL('./public',import.meta.url))));
app.get('/e/:slug',(req,res)=>res.sendFile(fileURLToPath(new URL('./public/guest.html',import.meta.url))));
app.use('/api/public',publicRoutes);
app.post('/api/login',async(req,res)=>{
 const key=req.ip,now=Date.now();
 for(const [k,v]of failures)if(v.until<now)failures.delete(k);
 const failure=failures.get(key)||{count:0,until:now+15*60*1000};
 if(failure.count>=8)return res.status(429).json({code:'TOO_MANY_ATTEMPTS'});
 if(failures.size>10000)return res.status(429).json({code:'TOO_MANY_ATTEMPTS'});
 failure.count++;failures.set(key,failure);
 const {db}=await store();
 const username=typeof req.body.username==='string'?req.body.username.trim().toLowerCase():'';
 const user=await db.collection('reception_users').findOne({username,active:true});
 if(!await passwordMatches(req.body.password,user?.passwordHash))throw new ReceptionError('INVALID_LOGIN',401);
 failures.delete(key);
 const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex'),expiresAt=new Date(now+8*3600*1000);
 const old=sessionToken(req);if(old)await db.collection('reception_sessions').deleteOne({_id:digest(old)});
 await db.collection('reception_sessions').insertOne({_id:digest(token),userId:user._id,csrf,expiresAt});
 res.cookie('reception',token,{httpOnly:true,sameSite:'strict',secure:config.production,maxAge:8*3600*1000,path:'/'}).json({ok:true});
});
app.use('/api',async(req,res,next)=>{
 const {db}=await store(),token=sessionToken(req);
 if(!/^[a-f0-9]{64}$/.test(token))throw new ReceptionError('LOGIN_REQUIRED',401);
 const session=await db.collection('reception_sessions').findOne({_id:digest(token),expiresAt:{$gt:new Date()}});
 const user=session&&await db.collection('reception_users').findOne({_id:session.userId,active:true});
 if(!user)throw new ReceptionError('LOGIN_REQUIRED',401);
 if(!['GET','HEAD'].includes(req.method)&&req.headers['x-csrf-token']!==session.csrf)throw new ReceptionError('FORBIDDEN',403);
 req.user=user;req.session=session;next();
});
app.get('/api/me',(req,res)=>res.json({username:req.user.username,role:req.user.role,csrf:req.session.csrf}));
app.post('/api/logout',async(req,res)=>{await(await store()).db.collection('reception_sessions').deleteOne({_id:req.session._id});res.clearCookie('reception',{path:'/'}).json({ok:true});});
app.use('/api/admin',adminRoutes);
app.get('/api/events',async(req,res)=>{
 const query=req.user.role==='admin'?{}:{_id:{$in:req.user.eventIds||[]}};
 res.json(await(await store()).db.collection('events').find(query).project({nombre:1,fecha:1,lugar:1,estado:1,timezone:1}).sort({createdAt:-1}).toArray());
});
async function eventAccess(req){const id=objectId(req.params.event);if(!mayAccess(req.user,id))throw new ReceptionError('FORBIDDEN',403);return id;}
app.post('/api/events/:event/state',async(req,res)=>{
 const id=await eventAccess(req);if(req.user.role!=='admin')throw new ReceptionError('FORBIDDEN',403);
 if(!['recepcion_abierta','cerrado'].includes(req.body.estado))throw new ReceptionError('INVALID_STATE');
 const result=await(await store()).db.collection('events').updateOne({_id:id},{$set:{estado:req.body.estado},$push:{receptionAudit:{action:req.body.estado,by:req.user._id,at:new Date()}}});
 if(!result.matchedCount)throw new ReceptionError('NOT_FOUND',404);res.json({ok:true});
});
app.get('/api/events/:event/summary',async(req,res)=>{
 const eventId=await eventAccess(req),{db}=await store();
 const total=await db.collection('guests').countDocuments({eventId,activo:true});
 const attended=await db.collection('guests').countDocuments({eventId,activo:true,'checkIn.at':{$exists:true}});
 res.json({total,attended,pending:total-attended});
});
app.get('/api/events/:event/guests',async(req,res)=>{
 const eventId=await eventAccess(req),q=typeof req.query.q==='string'?req.query.q.trim():'';
 if(q.length<2||q.length>100)throw new ReceptionError('SEARCH_REQUIRED');
 const regex=new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i');
 const guests=await(await store()).db.collection('guests').find({eventId,activo:true,$or:[{nombre:regex},{institucion:regex},{rut:regex}]}).project({_id:1,nombre:1,rut:1,institucion:1,mesa:1,menu:1,checkIn:1}).limit(30).toArray();
 res.json(guests.map(guestView));
});
app.post('/api/events/:event/check-ins',async(req,res)=>{
 if(req.body.method!=='manual')throw new ReceptionError('INDIVIDUAL_QR_RETIRED',410);
 const eventId=await eventAccess(req),{db,client}=await store();const session=client.startSession();
 try{
  const result=await session.withTransaction(async()=>{
   const user=await db.collection('reception_users').findOne({_id:req.user._id,active:true},{session});
   return registerInTransaction(db,user,eventId,req.body,session);
  },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'}});
  res.json(result);
 }finally{await session.endSession();}
});
app.use((error,req,res,next)=>{res.status(error instanceof ReceptionError?error.status:503).json({code:error instanceof ReceptionError?error.code:'SERVICE_UNAVAILABLE'});});
if(process.argv[1]===fileURLToPath(import.meta.url))app.listen(config.port,config.host,()=>console.log(`Recepción disponible en ${config.origin}`));

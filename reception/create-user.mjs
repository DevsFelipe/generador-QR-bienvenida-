import {randomBytes} from 'node:crypto';
import {writeFile,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {passwordHash} from './auth.js';
import {store,closeStore} from './store.js';
import {objectId} from './checkin.js';
const args=process.argv.slice(2),option=name=>args.includes(name)?args[args.indexOf(name)+1]:undefined;
try{
 const username=(option('--username')||'').toLowerCase();if(!/^[a-z0-9_.-]{3,60}$/.test(username))throw new Error('Indica --username con un nombre de usuario válido.');
 const admin=args.includes('--admin'),eventIds=args.includes('--events')?option('--events').split(',').map(objectId):[];
 if(!admin&&!eventIds.length)throw new Error('Asigna --events idEvento o utiliza --admin.');
 const password=randomBytes(18).toString('base64url'),{db}=await store();
 for(const eventId of eventIds)if(!await db.collection('events').findOne({_id:eventId}))throw new Error('Un evento asignado no existe.');
 if(await db.collection('reception_users').findOne({username}))throw new Error('El usuario ya existe. No se modificó su contraseña.');
 const path=fileURLToPath(new URL(`./acceso-${username}.txt`,import.meta.url));
 await writeFile(path,`Usuario: ${username}\nContraseña: ${password}\nAcceso local: http://127.0.0.1:3220\nGuarda estas credenciales de forma segura y retira este archivo cuando las hayas guardado.\n`,{flag:'wx',mode:0o600});
 try{await db.collection('reception_users').insertOne({username,passwordHash:await passwordHash(password),role:admin?'admin':'receptionist',active:true,eventIds,createdAt:new Date()});}catch(error){await unlink(path);throw error;}
 console.log('Usuario creado. Sus credenciales se guardaron en reception/acceso-'+username+'.txt.');
}catch(error){console.error(error.code===11000?'El usuario ya existe.':/Mongo/.test(error.name)?'No se pudo conectar a la base de datos.':error.message);process.exitCode=1;}finally{await closeStore();}

import dotenv from 'dotenv';
import {fileURLToPath} from 'node:url';
dotenv.config({path:fileURLToPath(new URL('./.env',import.meta.url)),quiet:true});
export const config={
 port:Number(process.env.PORT||process.env.RECEPTION_PORT||3220),host:process.env.RECEPTION_HOST||(process.env.NODE_ENV==='production'?'0.0.0.0':'127.0.0.1'),
 origin:process.env.RECEPTION_ORIGIN||process.env.RENDER_EXTERNAL_URL||'http://127.0.0.1:3220',
 uri:process.env.RECEPTION_MONGODB_URI, database:process.env.RECEPTION_MONGODB_DB||'invitaciones',
 production:process.env.NODE_ENV==='production'
};
if(config.production && !config.origin.startsWith('https://'))throw new Error('En producción se requiere RECEPTION_ORIGIN con HTTPS.');

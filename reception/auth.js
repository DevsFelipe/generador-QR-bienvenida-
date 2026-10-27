import {randomBytes,scrypt as callbackScrypt,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(callbackScrypt);
export const digest=value=>createHash('sha256').update(value).digest('hex');
export async function passwordHash(password){
 if(typeof password!=='string'||password.length<12||password.length>256)throw new Error('La contraseña debe tener entre 12 y 256 caracteres.');
 const salt=randomBytes(16).toString('hex');return salt+':'+(await scrypt(password,salt,64)).toString('hex');
}
export async function passwordMatches(password,hash){
 if(typeof password!=='string'||password.length>256||!hash)return false;
 const [salt,hex]=hash.split(':');if(!salt||!hex||hex.length!==128)return false;
 const actual=await scrypt(password,salt,64),expected=Buffer.from(hex,'hex');
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
export function mayAccess(user,eventId){return !!user?.active&&(user.role==='admin'||(user.role==='receptionist'&&user.eventIds?.some(id=>String(id)===String(eventId))));}
export function sessionToken(req){const cookie=req.headers.cookie||'';return cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith('reception='))?.slice(10)||'';}

export function normalizeRut(value){
 const raw=String(value??'').trim().replace(/\./g,'').replace(/\s/g,'').toUpperCase();
 if(!/^\d{7,8}-?[0-9K]$/.test(raw))throw new Error('RUT inválido. Incluye el dígito verificador.');
 const digits=raw.replace('-',''),body=digits.slice(0,-1),dv=digits.slice(-1);
 if(/^0/.test(body)||/^([0-9])\1+$/.test(body))throw new Error('RUT inválido.');
 let sum=0,factor=2;for(let i=body.length-1;i>=0;i--){sum+=Number(body[i])*factor;factor=factor===7?2:factor+1;}
 const result=11-sum%11,expected=result===11?'0':result===10?'K':String(result);
 if(dv!==expected)throw new Error('El dígito verificador del RUT no es válido.');
 return body+'-'+dv;
}
export function guestInput(input){
 const data={rut:normalizeRut(input.rut)};
 for(const key of ['nombre','mesa','menu']){if(typeof input[key]!=='string'||!input[key].trim()||input[key].length>(key==='menu'?500:200))throw new Error('Completa nombre, mesa y menú con un largo válido.');data[key]=input[key].trim();}
 data.institucion=String(input.institucion??'').trim();data.correo=String(input.correo??'').trim();
 if(data.institucion.length>300||data.correo.length>254||(data.correo&&!/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(data.correo)))throw new Error('Correo o institución inválidos.');
 if(data.correo)data.correoNormalizado=data.correo.toLowerCase();
 return data;
}

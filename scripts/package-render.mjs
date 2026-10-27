import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=process.cwd(),repository=path.join(root,'outputs','recepcion-render');
const exists=async file=>fs.access(file).then(()=>true,()=>false);
// El usuario versionó este directorio y el remoto conserva el paquete en una subcarpeta.
// Respetar esa estructura y no escribir sobre la raíz ni incluir metadatos de Git.
const nested=await exists(path.join(repository,'.git'))&&await exists(path.join(repository,'recepcion-render','package.json'));
const target=nested?path.join(repository,'recepcion-render'):repository;
let crlf=false;try{crlf=execFileSync('git',['-C',repository,'config','--get','core.autocrlf'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()==='true';}catch{}
const files=['package.json','package-lock.json','render.yaml','.dockerignore','reception/Dockerfile',...(await fs.readdir('reception')).filter(n=>n.endsWith('.js')&&n!=='migrate.js').map(n=>'reception/'+n),...['admin.html','admin.js','guest.html','guest.js','guest.css','style.css','project.css','proyecto.html','guia-despliegue.html'].map(n=>'reception/public/'+n)];
await fs.mkdir(target,{recursive:true});
for(const file of files){const destination=path.join(target,file);await fs.mkdir(path.dirname(destination),{recursive:true});const content=await fs.readFile(path.join(root,file),'utf8');await fs.writeFile(destination,crlf?content.replace(/\r?\n/g,'\r\n'):content);}
for(const obsolete of ['reception/public/index.html','reception/public/app.js'])await fs.unlink(path.join(target,obsolete)).catch(e=>{if(e.code!=='ENOENT')throw e;});
async function walk(folder){const result=[];for(const entry of await fs.readdir(folder,{withFileTypes:true})){if(folder===target&&entry.name==='.git')continue;const file=path.join(folder,entry.name);if(entry.isDirectory())result.push(...await walk(file));else result.push(path.relative(target,file).replaceAll('\\','/'));}return result;}
const actual=await walk(target);if(actual.some(f=>!files.includes(f)))throw new Error('El paquete contiene archivos fuera de la lista autorizada.');
console.log(JSON.stringify({carpeta:target,archivos:actual.length,soloCodigo:true}));

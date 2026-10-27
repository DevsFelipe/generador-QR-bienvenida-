import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {makeQR} from '../src/domain.js';
import {runCampaign} from '../src/mail.js';

function setup() {
 process.env.QR_KEY=randomBytes(32).toString('hex');
 const records=['pending','accepted','sending','uncertain'].map((status,index)=>({_id:index,eventId:'event',activo:true,nombre:'Persona ficticia',correo:`persona${index}@example.cl`,institucion:'Instituto',...makeQR(process.env.QR_KEY),mail:{status}}));
 const collection={find(query){assert.equal(query['mail.status'],'pending');return{project(){return{async toArray(){return records.filter(g=>g.mail.status==='pending').map(g=>({_id:g._id}));}};}};},async findOneAndUpdate(query,update){const guest=records.find(g=>g._id===query._id&&g.mail.status===query['mail.status']);if(!guest)return null;guest.mail=update.$set.mail;return guest;},async updateOne(query,update){const guest=records.find(g=>g._id===query._id&&g.mail.attemptId===query['mail.attemptId']);assert.ok(guest);for(const [key,value]of Object.entries(update.$set))guest.mail[key.slice(5)]=value;return{modifiedCount:1};}};
 return{records,store:{collection(){return collection;}}};
}
const event={_id:'event',nombre:'Prueba',asunto:'Invitación',texto:'Texto',fecha:'2026',lugar:'Sala'};
test('reserva antes de enviar y no repite aceptados ni inciertos',async()=>{
 const {records,store}=setup();let calls=0;
 const mailer={async verify(){},async sendMail(content){calls++;assert.equal(records[0].mail.status,'sending');assert.equal(content.to,records[0].correo);return{accepted:[content.to],messageId:'test'};}};
 await runCampaign(event,{store,mailer,pause:async()=>{}});assert.equal(calls,1);assert.equal(records[0].mail.status,'accepted');
 await runCampaign(event,{store,mailer,pause:async()=>{}});assert.equal(calls,1);
});
test('un error de transporte queda incierto y no se reintenta automáticamente',async()=>{
 const {records,store}=setup();let calls=0;
 const mailer={async verify(){},async sendMail(){calls++;throw new Error('timeout');}};
 await runCampaign(event,{store,mailer,pause:async()=>{}});assert.equal(records[0].mail.status,'uncertain');
 await runCampaign(event,{store,mailer,pause:async()=>{}});assert.equal(calls,1);
});

import nodemailer from 'nodemailer';
import QRCode from 'qrcode';
import {randomUUID} from 'node:crypto';
import {db} from './store.js';
import {qrPayload,invitation} from './domain.js';
export function transport() {
  const {SMTP_HOST,SMTP_USER,SMTP_PASS,MAIL_FROM} = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !MAIL_FROM) throw new Error('Completa la configuración SMTP y MAIL_FROM en .env.');
  return nodemailer.createTransport({host:SMTP_HOST,port:Number(process.env.SMTP_PORT || 587),secure:process.env.SMTP_SECURE==='true',requireTLS:process.env.SMTP_SECURE!=='true',auth:{user:SMTP_USER,pass:SMTP_PASS},connectionTimeout:15000,socketTimeout:30000,disableFileAccess:true,disableUrlAccess:true});
}
export async function message(event,guest,to) {
  return {from:process.env.MAIL_FROM,to,subject:event.asunto,html:invitation(event,guest),text:`Hola ${guest.nombre}. ${event.nombre}\n${event.texto}\n${event.fecha}\n${event.lugar}\nPresenta el QR adjunto en recepción.`,attachments:[{filename:'invitacion-qr.png',content:await QRCode.toBuffer(qrPayload(guest.tokenEncrypted,process.env.QR_KEY),{width:480,margin:4,errorCorrectionLevel:'M'}),cid:'invitacion-qr',contentType:'image/png'}]};
}
export const job = {running:false,processed:0,accepted:0,uncertain:0,error:null};
export async function runCampaign(event,dependencies={}) {
  const store = dependencies.store || await db(), mailer = dependencies.mailer || transport();
  await mailer.verify();
  const candidates = await store.collection('guests').find({eventId:event._id,activo:true,tokenEncrypted:{$type:'string'},'mail.status':'pending'}).project({_id:1}).toArray();
  for (const candidate of candidates) {
    const attemptId = randomUUID();
    const guest = await store.collection('guests').findOneAndUpdate({_id:candidate._id,activo:true,'mail.status':'pending'},{$set:{mail:{status:'sending',attemptId,startedAt:new Date()}}},{returnDocument:'after'});
    if (!guest) continue;
    // La reserva se persiste ANTES de contactar al proveedor. Un cierre deja el envío incierto.
    try {
      const result = await mailer.sendMail(await message(event,guest,guest.correo));
      const status = result.accepted?.length ? 'accepted' : 'failed';
      await store.collection('guests').updateOne({_id:guest._id,'mail.attemptId':attemptId},{$set:{'mail.status':status,'mail.completedAt':new Date(),'mail.messageId':result.messageId || null}});
      if(status==='accepted') job.accepted++;
    } catch {
      await store.collection('guests').updateOne({_id:guest._id,'mail.attemptId':attemptId},{$set:{'mail.status':'uncertain','mail.completedAt':new Date()}});
      job.uncertain++;
    }
    job.processed++;
    await (dependencies.pause || (()=>new Promise(resolve=>setTimeout(resolve,Math.max(500,Number(process.env.SEND_DELAY_MS)||1000)))))();
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import nodemailer from 'nodemailer';
import {makeQR} from '../src/domain.js';
import {message} from '../src/mail.js';
test('correo incluye QR PNG adjunto y embebido, sin enviar mensajes',async()=>{
 process.env.QR_KEY=randomBytes(32).toString('hex');process.env.MAIL_FROM='organizador@example.cl';
 const guest={nombre:'Ana Ñúñez',correo:'ana@example.cl',institucion:'UC',...makeQR(process.env.QR_KEY)};
 const content=await message({nombre:'Evento de prueba',asunto:'Invitación',texto:'Te esperamos',fecha:'2026-11-01',lugar:'Sala'},guest,guest.correo);
 assert.equal(content.to,guest.correo);assert.equal(content.attachments[0].content.subarray(1,4).toString(),'PNG');assert.equal(content.attachments[0].cid,'invitacion-qr');
 const result=await nodemailer.createTransport({streamTransport:true,buffer:true}).sendMail(content);const mime=result.message.toString();assert.match(mime,/Content-Type: image\/png/);assert.match(mime,/Content-ID: <invitacion-qr>/);assert.match(mime,/To: ana@example.cl/);
});

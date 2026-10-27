import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {validateRows,makeQR,qrPayload,invitation} from '../src/domain.js';

const mapping={nombre:0,correo:1,institucion:2};
test('normaliza correos, conserva nombres y detecta duplicados por fila',()=>{
 const rows=validateRows([{number:2,cells:[' Ana Ñúñez ',' ANA@example.cl ',' UC ']},{number:3,cells:['Otra persona','ana@example.cl','Instituto']},{number:4,cells:['Ana Ñúñez','otra@example.cl','UC']}],mapping);
 assert.equal(rows[0].correoNormalizado,'ana@example.cl');assert.equal(rows[0].nombre,'Ana Ñúñez');assert.equal(rows[0].institucion,'UC');assert.equal(rows[0].errors.length,0);assert.match(rows[1].errors.join(),/repetido/);assert.equal(rows[2].errors.length,0);
});
test('rechaza institución vacía, correo inválido y asignaciones repetidas',()=>{
 const rows=validateRows([{number:2,cells:['Ana','a@','']}],mapping);assert.equal(rows[0].errors.length,2);
 assert.throws(()=>validateRows([],{nombre:0,correo:0,institucion:2}));
});
test('QR opaco, único y recuperable con hash compatible con recepción',()=>{
 const key=randomBytes(32).toString('hex'),one=makeQR(key),two=makeQR(key);
 const payload=qrPayload(one.tokenEncrypted,key);assert.match(payload,/^GALAQR1:[\w-]{43}$/);assert.notEqual(one.tokenHash,two.tokenHash);assert.equal(createHash('sha256').update(payload.slice(8)).digest('hex'),one.tokenHash);
 assert.throws(()=>qrPayload(one.tokenEncrypted,randomBytes(32).toString('hex')));assert.throws(()=>makeQR(''));
});
test('la invitación escapa contenido de evento y persona',()=>{
 const html=invitation({nombre:'<script>x</script>',texto:'<img onerror=x>',fecha:'2026',lugar:'A&B'},{nombre:'<Ana>',institucion:'"Instituto"'});
 assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;Ana&gt;'));assert.ok(html.includes('A&amp;B'));assert.ok(html.includes('cid:invitacion-qr'));
});

import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'node:crypto';

export const emailValid = value => typeof value === 'string' && /^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(value) && value.length <= 254;
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function validateRows(rows, mapping) {
  const columns = ['nombre','correo','institucion'].map(k => Number(mapping[k]));
  if (columns.some(n => !Number.isInteger(n) || n < 0) || new Set(columns).size !== 3) throw new Error('Selecciona tres columnas diferentes.');
  const seen = new Set();
  return rows.map(({number, cells}) => {
    const [nombre, correo, institucion] = columns.map(i => String(cells[i] ?? '').trim());
    const correoNormalizado = correo.toLowerCase();
    const errors = [];
    if (!nombre || nombre.length > 200) errors.push('Nombre obligatorio, máximo 200 caracteres');
    if (!emailValid(correo)) errors.push('Correo inválido o vacío');
    if (!institucion || institucion.length > 300) errors.push('Institución obligatoria, máximo 300 caracteres');
    if (seen.has(correoNormalizado)) errors.push('Correo repetido en el archivo');
    if (correoNormalizado) seen.add(correoNormalizado);
    return {number,nombre,correo,correoNormalizado,institucion,errors};
  });
}
export function makeQR(keyHex) {
  if (!/^[a-f0-9]{64}$/i.test(keyHex || '')) throw new Error('Configura QR_KEY con una clave hexadecimal de 32 bytes.');
  const token = randomBytes(32).toString('base64url');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.from(keyHex,'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
  return {tokenHash:createHash('sha256').update(token).digest('hex'),tokenEncrypted:[iv.toString('hex'),cipher.getAuthTag().toString('hex'),encrypted.toString('hex')].join('.'),tokenVersion:1};
}
export function qrPayload(encrypted,keyHex) {
  const [iv,tag,data] = encrypted.split('.').map(v=>Buffer.from(v,'hex'));
  const decipher = createDecipheriv('aes-256-gcm',Buffer.from(keyHex,'hex'),iv);
  decipher.setAuthTag(tag);
  return 'GALAQR1:' + Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8');
}
export function invitation(event,guest) {
  return `<div style="font:16px Arial;color:#18332d;max-width:620px;margin:auto;padding:28px"><h1>${escapeHtml(event.nombre)}</h1><p>Hola ${escapeHtml(guest.nombre)},</p><p style="white-space:pre-line">${escapeHtml(event.texto)}</p><p><strong>Fecha y hora:</strong> ${escapeHtml(event.fecha)}<br><strong>Lugar:</strong> ${escapeHtml(event.lugar)}</p><p>${escapeHtml(guest.institucion)}</p><img src="cid:invitacion-qr" width="240" height="240" alt="Tu código QR personal"><p>Presenta este QR en la recepción. Invitación para una persona.</p></div>`;
}

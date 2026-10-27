# Del código fuente a Render

1. Clona el repositorio del fuente y ejecuta `npm.cmd ci` desde su raíz.
2. Copia `reception/.env.example` a `reception/.env` solo si no existe. Completa tu URI y base MongoDB Atlas; autoriza tu IP y crea un usuario con lectura/escritura sobre esa base.
3. Para una base nueva crea tu administrador: `npm.cmd run reception:user -- --username mi_admin --admin`. Guarda la contraseña de `reception/acceso-mi_admin.txt` fuera de Git. Con una cuenta ya creada no repitas el alta.
4. Ejecuta `npm.cmd start` y prueba en http://127.0.0.1:3220. La guía completa está en `/guia-despliegue.html`.
5. Desde la raíz ejecuta `npm.cmd run package:render`. En una copia nueva genera `outputs/recepcion-render`. Si ya existe el repositorio de despliegue con paquete anidado, conserva su Git y actualiza su subcarpeta `recepcion-render`; revisa la ruta informada.
6. Sube el paquete a un repositorio propio de despliegue. Para un repositorio nuevo utiliza Git init, commit, remote y push como indica el README. Si ya existe, revisa diff, realiza commit y push sin reinicializar ni forzar. El fuente y el paquete tienen historiales independientes.
7. En Render crea un Web Service Docker conectado al repositorio del paquete. Root Directory: vacío si `package.json` está en la raíz; `recepcion-render` si está en esa subcarpeta. Dockerfile: `reception/Dockerfile` dentro de la raíz seleccionada; contexto: esa misma raíz. Health check: `/healthz`.
8. Configura en Render `NODE_ENV=production`, `RECEPTION_HOST=0.0.0.0`, `RECEPTION_TRUST_PROXY=true`, `RECEPTION_MONGODB_DB=invitaciones` (o tu base) y `RECEPTION_MONGODB_URI` con tu cadena privada. Render proporciona `PORT` y `RENDER_EXTERNAL_URL`; para dominio propio usa `RECEPTION_ORIGIN` con el origen HTTPS exacto. No copies el origen localhost a Render.
9. Copia los rangos de Connect → Outbound de tu servicio y agrégalos individualmente a la IP Access List de Atlas. Espera a que estén activos.
10. Comprueba login, creación del evento, importación ficticia, recepción abierta y QR desde el teléfono. `/healthz` solo confirma el servidor, no la conexión a MongoDB.

La configuración y las cuentas se conservan al actualizar el mismo servicio y la misma base. El código no contiene tus claves. No subas archivos privados al repositorio fuente ni al de despliegue. El servicio gratuito tiene reposo por inactividad y límites que deben revisarse antes del evento.

Fuentes oficiales: [Render Docker](https://render.com/docs/docker), [Render Free](https://render.com/docs/free), [MongoDB Atlas](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/).

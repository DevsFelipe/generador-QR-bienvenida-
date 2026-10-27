# Etapa 2 · Recepción web

## Versión actual: QR común, RUT, mesa y menú

### Alta individual desde el teléfono

Con una cuenta administradora, seleccionar el evento y pulsar **Agregar invitado**, debajo de los contadores. Nombre, RUT, mesa y menú son obligatorios; correo e institución son opcionales. **Guardar invitado** deja la asistencia pendiente. **Guardar y registrar ingreso** confirma el alta y la asistencia juntas en una transacción; requiere recepción abierta. Si el evento está cerrado, esa segunda opción no guarda una persona parcialmente. Un RUT/correo duplicado se rechaza sin sobrescribir el registro anterior. Los reintentos conservan un identificador de operación para no duplicar el alta. No se ofrecen altas públicas ni permisos de alta a los recepcionistas.

Verificación del alta individual: 25 pruebas automatizadas aprobadas; ensayo HTTP/Atlas con datos ficticios de alta pendiente, alta con ingreso, evento cerrado, CSRF, duplicados y recuperación de reintento, con limpieza de los datos de prueba. Se comprobó el formulario en un navegador con ancho de teléfono; queda pendiente el ensayo en un dispositivo físico y en Render tras publicar.

La aplicación ahora concentra administración y recepción. El flujo anterior de invitaciones/lector individual que figura más abajo se conserva solo como historial y ya no es la interfaz vigente. Abrir `http://127.0.0.1:3220` localmente o la URL de Render para administrar; cada QR común apunta a `/e/<identificador aleatorio del evento>`.

1. Ingresar con la cuenta administradora existente, crear/seleccionar el evento y cargar un `.xlsx` con encabezados. Campos obligatorios: **nombre, rut, mesa, menu**. Campos opcionales: **correo, institucion**. Puede descargarse una plantilla desde la administración.
2. Asociar columnas, revisar errores y confirmar la importación. El RUT se normaliza y se valida su dígito verificador. Un RUT es único por evento. Los correos no vacíos siguen siendo únicos por evento para evitar asociaciones ambiguas.
3. La reimportación omite existentes por defecto. Al marcar actualizar, conserva `checkIn` y modifica los datos. Para completar registros anteriores, se vincula por el mismo correo solo si todavía no tienen RUT; si el Excel no trae el correo, completar el registro antiguo usando **Editar** para no crear otra persona. No hay vinculación aproximada por nombre.
4. Mostrar y descargar el QR común **desde Render** para que apunte a su URL pública. El QR permanece estable aunque cambien asignaciones. No se generan ni se envían invitaciones individuales.
5. Abrir recepción. El invitado escanea con la cámara normal del teléfono, introduce su RUT y pulsa **Registrar mi ingreso**. Se guarda asistencia y se muestran únicamente nombre, mesa, menú y hora de ingreso. Visitar la página por sí solo no registra asistencia. Consultar otra vez conserva la hora original. Los invitados no utilizan las cuentas administradoras.
6. La administración permite búsqueda, corrección individual e ingreso manual para quien no tenga teléfono. Los campos faltantes aparecen señalados; no se inventan mesas, menús ni RUT para registros antiguos.

El autoregistro usa una actualización atómica por invitado con `checkIn: null`; no escribe un documento compartido del evento por cada llegada. Esto evita serializar todos los ingresos en una sola cola. El evento se comprueba abierto antes de registrar; un registro ya en curso puede finalizar mientras el administrador cierra la recepción. Los registros iniciados después del cierre son rechazados. El ingreso manual conserva el mecanismo transaccional de la versión anterior.

La API pública no devuelve RUT, correo, institución, identificadores de persona ni la nómina. Tiene límites compartidos en MongoDB: 300 intentos por IP/minuto y 8 por IP/RUT/evento en diez minutos. El RUT es un identificador conocido, no una prueba de identidad; el flujo no es una autenticación personal. La página no guarda RUT ni resultados en localStorage. No existe funcionamiento offline.

### Migración y publicación

Antes de actualizar Render se ejecuta `node reception/migrate.js` desde el computador con acceso a Atlas. El script respalda eventos, invitados e índices en `.private-backups/` (fuera del repositorio), crea el índice único parcial de RUT y permite correo ausente. Conserva los datos y asistencias, y retira únicamente el índice antiguo que exigía correo incluso cuando estaba ausente. Esta migración ya se ejecutó sobre la base compartida conservando el evento y el invitado existentes.

`npm.cmd start`, `iniciar.cmd` e `iniciar-recepcion.cmd` ejecutan ahora la web unificada. El código previo del organizador permanece como referencia local, pero no es el punto de inicio ni se incluye en el paquete publicado. No se requiere SMTP ni QR_KEY en Render. La cuenta administradora, URI MongoDB, IP autorizadas, dirección pública y demás variables existentes se mantienen.

Actualizar el paquete con `node scripts/package-render.mjs`. Subir el **contenido** de `outputs/recepcion-render` al mismo directorio `recepcion-render` de GitHub, conservando el `Dockerfile` y `.dockerignore`. Reemplazar los archivos modificados, incluir los nuevos y retirar los viejos `reception/public/index.html` y `reception/public/app.js` si siguen en GitHub. La ruta `/index.html` se redirige a la nueva administración, por compatibilidad durante la actualización. Render debe desplegar el nuevo commit. Esto no se publica por actualizar archivos en el computador.

La lectura de Excel, plantilla y validaciones son funciones de la aplicación. No deben subirse planillas, archivos `.env`, `acceso-*.txt`, respaldos ni imágenes de invitados al repositorio.

Pruebas nuevas: `node --test test/rut.test.js`; ensayo integrado y ráfaga de 150 invitados ficticios: `node scripts/rut-integration.mjs`, con `RECEPTION_ORIGIN` apuntando al servidor local que se está probando. Esta prueba crea y elimina únicamente un evento sintético; no mide el rendimiento de Render ni reemplaza el ensayo con teléfonos en el recinto.

---

## Historial de la etapa anterior

Aplicación separada de la preparación y envío local. Usa los eventos e invitados de la misma base MongoDB y no necesita SMTP ni la clave de cifrado QR para validar invitaciones. El organizador usa el puerto 3210; la recepción usa 3220 en las pruebas locales.

## Inicio local

1. Instalar las dependencias desde la carpeta principal con `npm.cmd install`.
2. Copiar `reception/.env.example` a `reception/.env` si todavía no existe. Completar `RECEPTION_MONGODB_URI` y `RECEPTION_MONGODB_DB` con acceso a la base compartida. Mantener este archivo fuera del repositorio. En esta entrega se prepara una copia local con la conexión ya disponible; el hosting debe tener su propio usuario MongoDB y configuración.
3. Crear el primer encargado administrador desde la carpeta principal:

```powershell
npm.cmd run reception:user -- --username recepcion_admin --admin
```

Se genera una contraseña aleatoria, con hash scrypt en MongoDB. Las credenciales iniciales quedan en `reception/acceso-recepcion_admin.txt`, excluido del repositorio. Guardarlas de forma segura y retirar ese archivo después. El comando rechaza usuarios existentes y no cambia sus contraseñas.

4. Ejecutar `iniciar-recepcion.cmd` o `npm.cmd run reception` y abrir http://127.0.0.1:3220.
5. Ingresar con la cuenta creada. Seleccionar el evento y pulsar **Abrir recepción**. Los eventos en borrador o cerrados no aceptan ingresos.
6. Activar cámara, leer una imagen PNG del QR o usar un lector externo que escriba el contenido `GALAQR1:...`. Una lectura válida registra de inmediato. El resultado muestra nombre, institución, hora y operador. Una segunda lectura conserva el primer ingreso.
7. Para ingreso manual, buscar por nombre o institución y confirmar la persona. No requiere emitir un QR ni enviar un correo. Las coincidencias se limitan a 30.

Para ensayar sin SMTP, abrir la invitación en el organizador local, guardar su imagen QR y utilizar **Leer imagen QR** en recepción. La imagen se decodifica en el navegador; al servidor solo se envía el código. Registrar con QR o manualmente cambia la asistencia real de ese invitado. Para comprobar el resultado en el organizador, pulsar **Actualizar registro**.

## Encargados por evento

Un administrador ve todos los eventos y puede abrir/cerrar recepción. Un recepcionista solo accede a los eventos asignados y no puede cambiar su estado:

```powershell
npm.cmd run reception:user -- --username puerta1 --events ID_DEL_EVENTO
```

Se pueden indicar varios identificadores separados por coma. La administración de cuentas se realiza en esta etapa mediante este comando; no hay alta pública ni panel de edición de cuentas. Para revocar una cuenta, establecer `active: false` en `reception_users`; el servidor comprueba actividad y asignaciones en cada petición. Las sesiones expiran a las 8 horas y se revocan al cerrar sesión.

## Publicación posterior y teléfonos

Esta entrega queda ejecutándose localmente, no publicada en Internet. Para usar la cámara desde teléfonos se necesita desplegar esta aplicación con **HTTPS**, acceso a MongoDB y su cuenta propia. No basta abrir la dirección HTTP del computador desde el teléfono.

En el hosting configurar `NODE_ENV=production`, `RECEPTION_HOST=0.0.0.0`, `RECEPTION_PORT` según el proveedor y `RECEPTION_ORIGIN=https://tu-dominio`. El servidor verifica origen, host y HTTPS. Si hay un único proxy HTTPS controlado, configurar `RECEPTION_TRUST_PROXY=true`; no activar detrás de proxies no controlados. Configurar las variables como secretos del hosting, sin copiar el `.env` del organizador. Iniciar con `npm.cmd run reception` o `node reception/server.js`. Autorizar la red del hosting en Atlas. Mantener el mismo origen para frontend y API.

Las cookies son HttpOnly y SameSite Strict; en producción son Secure. Las operaciones requieren origen válido y token CSRF de sesión. No se guardan sesiones ni códigos en localStorage. Hay límite de intentos de login por IP. Para varios procesos o instancias, sustituir el limitador en memoria por uno compartido antes de escalar.

## Integridad de asistencia

El QR se resuelve por SHA-256 del token sin prefijo, asociado al evento e invitado activo. `guests.checkIn` se actualiza solo si es `null`, mediante `findOneAndUpdate`. La operación guarda hora UTC, ID y nombre del encargado, método y un identificador de operación. El navegador distingue confirmación, duplicado y fallo de red. Ante respuesta incierta, **Comprobar el último registro** repite la operación sin duplicar ni sustituir la primera asistencia.

El cambio se ejecuta en una transacción MongoDB (Atlas replica set). Dentro de ella se comprueba al usuario vigente, se valida el evento y se escribe un contador del evento para serializar los registros con el cierre. La apertura y el cierre conservan auditoría en el documento del evento. No se almacena un segundo registro de asistencia separado que pueda quedar desincronizado. Un MongoDB standalone sin transacciones no sirve para esta implementación.

Colecciones adicionales: `reception_users` y `reception_sessions` (hash del token, CSRF, expiración con TTL). Las rutas de búsqueda solo exponen nombre, institución y asistencia del evento autorizado. Los tokens QR no aparecen en consultas, URLs ni logs.

## Pruebas y límites

`npm.cmd test` incluye casos de hash de contraseña, permisos, decodificación de una imagen QR generada, ingreso manual, duplicados y rechazo de QR ajeno/inactivo/evento cerrado. `node scripts/reception-integration.mjs` ejecuta un ensayo HTTP con Atlas, crea únicamente datos ficticios identificados por IDs nuevos y los retira al finalizar; requiere la recepción iniciada y acceso a la base configurada. No usa invitados existentes ni SMTP.

Verificado localmente el 26/10/2026: 16 pruebas automatizadas aprobadas; ensayo real HTTP/Atlas con usuarios y datos ficticios, ingreso QR/manual y cinco peticiones simultáneas con una única asistencia. Los datos de ese ensayo fueron retirados. Se comprobó en navegador el inicio de sesión del administrador y la visualización del evento y del invitado existente, sin registrar su asistencia. La cuenta `recepcion_admin` se creó con autorización expresa del organizador. Sus credenciales están en el archivo local indicado arriba; no se muestran en logs ni documentación.

Pendiente de validación en despliegue: cámara en teléfonos reales iOS/Android, permisos reales de cámara, HTTPS del hosting y ensayo de carga previsto para el evento. No se ha implementado recepción offline, reingreso, acompañantes, reversión de asistencia ni exportación de reportes en esta etapa. No publicar el servidor organizador local del puerto 3210.

Referencias: [jsQR](https://github.com/cozmo/jsQR), [operaciones atómicas del driver MongoDB](https://www.mongodb.com/docs/drivers/node/current/crud/compound-operations/).

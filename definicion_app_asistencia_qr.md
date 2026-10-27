# Definición de aplicación: asistencia a eventos mediante QR

> Actualización de alcance, 26/10/2026: por instrucción del organizador, la primera iteración traslada la importación de Excel, el registro de invitados y la generación de QR a la aplicación local Node.js con interfaz visual. Columnas: nombre, correo e institución. Primero se persiste la persona, después se emite el QR y finalmente se envía la invitación. La web posterior registrará asistencia sobre esos mismos datos. La implementación y su operación vigente se describen en README.md; las secciones siguientes conservan la propuesta anterior como referencia, incluyendo el flujo de paquete exportado que fue reemplazado.

Versión 1.1 · 26 de octubre de 2026

Revisión: envío de correos desde un computador local; aplicación web orientada a recepción y asistencia.

## 1. Objetivo y supuestos

Crear una aplicación web liviana, con backend Node.js e interfaz React, que permita importar invitados, generar códigos QR, registrar asistencia mediante personal autorizado y exportar resultados. Separar el envío de invitaciones en una utilidad Node.js ejecutada desde el computador del organizador.

La prioridad del frontend es ofrecer al encargado un lector QR sencillo desde el navegador del teléfono. Se mantienen importación, administración y reportes como funciones de apoyo; no se exige un panel web de campañas de correo. El computador del organizador puede estar apagado durante la recepción.

Caso inicial: Gala 2026. La estructura admitirá varios eventos sin mezclar invitados, códigos ni asistencias. El MVP mostrará un evento activo por defecto.

Supuestos de dimensionamiento para validar, no requisitos proporcionados por el solicitante: hasta 1.000 invitados por evento y 5 recepcionistas simultáneos. La capacidad real se verificará mediante pruebas antes del evento. Cada invitación representa a una persona y permite una sola entrada. No se contemplan acompañantes, entradas pagadas ni reingresos en esta primera versión.

La aplicación web es técnicamente compatible con servicios gratuitos. Su dimensionamiento ya no depende del envío de correo. El envío local requiere conexión a Internet y una cuenta o servicio de correo autorizado, con sus propios límites; local no significa correo sin proveedor ni sin cuotas. La disponibilidad de la recepción sigue dependiendo del hosting, la base de datos y la conexión del recinto.

## 2. Stack y arquitectura propuestos

| Componente | Propuesta | Motivo |
| --- | --- | --- |
| Interfaz | React + TypeScript + Vite | Interfaz adaptable a teléfonos y computadores; archivos estáticos compilados |
| Componentes visuales | Material UI | Formularios, tablas y controles consistentes |
| API | Node.js en versión LTS con soporte vigente + Express + TypeScript | API sencilla, sin microservicios |
| Base de datos | MongoDB Atlas Free | Persistencia externa al servidor de aplicación |
| Acceso a datos | Driver oficial MongoDB | Evitar una capa adicional si no aporta valor al MVP |
| Correo local | Utilidad Node.js por línea de comandos, con adaptador SMTP o API según la cuenta disponible | Ejecutar envíos desde el computador del organizador, sin desplegar este módulo |
| QR | Generación en backend y lectura en navegador | Sin aplicación móvil nativa |
| Autenticación | Cuentas internas con sesiones persistidas en MongoDB | Revocación de sesiones y control centralizado |

Las bibliotecas concretas de XLSX/CSV, generación QR, escaneo y contraseñas se seleccionarán al implementar, verificando mantenimiento, licencia, vulnerabilidades y compatibilidad. No fijar versiones antiguas copiadas de ejemplos. Guardar versiones resueltas en el lockfile.

Un solo servicio Express puede servir tanto `/api` como el frontend compilado. Mantener el mismo origen simplifica sesiones, cookies y despliegue. La cámara requiere HTTPS en el sitio público y autorización del navegador; localhost se usa únicamente para desarrollo.

La base de datos nunca se conecta directamente desde React. El backend sigue siendo necesario para autenticar encargados, validar QR, evitar duplicados y persistir asistencia. Un frontend estático por sí solo no satisface estos requisitos.

Separación de componentes:

| Componente | Dónde se ejecuta | Función |
| --- | --- | --- |
| Frontend React | Navegador del encargado y del administrador | Login, cámara, resultado de registro, administración y reportes según rol |
| API Node.js | Hosting web | Autorización, invitados, QR, exportación del paquete local y asistencia |
| MongoDB | Servicio de base de datos | Datos compartidos y persistentes |
| Utilidad de correo Node.js | Computador del organizador | Leer paquete exportado, preparar invitaciones y enviar con su cuenta autorizada |

Flujo: importar invitados en la web → emitir QR → descargar paquete de invitaciones → enviar desde el computador → registrar asistencia en la web durante el evento → exportar reporte.

Las credenciales de correo solo existen en la utilidad local. El hosting no requiere Resend, SMTP, webhooks de entrega ni workers de envío. La utilidad local no recibe credenciales de MongoDB ni permisos para registrar asistencias. Puede funcionar sin acceso a la API una vez descargado el paquete; solo necesita conectividad con el proveedor de correo para enviar.

## 3. Roles y permisos

Los invitados importados son registros del evento, no cuentas que puedan iniciar sesión.

| Acción | Administrador | Recepcionista asignado | Invitado / visitante |
| --- | --- | --- | --- |
| Crear y configurar eventos | Sí | No | No |
| Importar y editar invitados | Sí | No | No |
| Generar o revocar QR y descargar paquete de invitaciones | Sí | No | No |
| Gestionar cuentas y asignaciones | Sí | No | No |
| Escanear y registrar asistencia | Sí | Sí, en eventos asignados | No |
| Buscar invitado para ingreso manual | Sí | Sí, en eventos asignados | No |
| Consultar reportes y exportar | Sí | No | No |
| Revertir una asistencia | Sí, con motivo obligatorio | No | No |

No habrá registro público de cuentas. El administrador inicial se crea mediante un procedimiento de instalación, sin contraseña predeterminada. Todas las rutas verifican la sesión, el rol y el acceso al evento en el servidor. Ocultar botones no reemplaza estas validaciones.

## 4. Funcionalidades

### 4.1 Eventos

Campos: nombre, fecha y horario, zona horaria, lugar, texto de invitación y estado. El remitente y las credenciales de envío se configuran en la utilidad local. Estados: borrador, recepción abierta y cerrado. La invitación puede prepararse y enviarse en borrador; la asistencia solo se registra con la recepción abierta. Un evento cerrado permite consultar y exportar, pero no registrar entradas. Su reapertura es exclusiva de administración y queda auditada.

Usar `America/Santiago` por defecto, configurable. Persistir fechas operativas en UTC y presentarlas según la zona del evento.

### 4.2 Importación de invitados desde Excel o CSV

Aceptar `.xlsx` sin macros y `.csv`. Rechazar `.xls` y `.xlsm` en el MVP con una explicación para convertirlos. Límite inicial configurable: 5 MB y 5.000 filas; estos límites de archivo no equivalen a capacidad validada de recepción.

Columnas obligatorias: `nombre` y `correo`. Opcional: `codigo_externo`, para integración con nóminas existentes. Permitir seleccionar hoja y asociar columnas cuando los encabezados tengan otros nombres.

Flujo:

1. Cargar archivo y elegir hoja/columnas.
2. Analizarlo en el servidor sin ejecutar fórmulas, macros ni enlaces externos.
3. Mostrar una vista previa con filas válidas, errores y duplicados.
4. Corregir el archivo o excluir explícitamente filas con error.
5. Confirmar la importación y mostrar resumen de creados, actualizados, omitidos y rechazados.

Reglas:

- Recortar espacios y validar nombre y formato de correo; conservar tildes y caracteres Unicode.
- Conservar el correo original y crear una versión normalizada para comparar, con espacios removidos y minúsculas según la política del sistema.
- Un correo normalizado por evento identifica un único invitado en el MVP. Si varias personas comparten correo, se requiere cambiar esta política y usar un identificador externo; no fusionarlas silenciosamente.
- Los nombres repetidos están permitidos.
- No actualizar automáticamente por reimportar: ofrecer omitir o actualizar campos permitidos. Preservar la asistencia y QR existente, salvo regeneración explícita.
- La misma nómina puede importarse en otro evento: las invitaciones son independientes.
- Procesar por lotes con resultados persistidos; los reintentos no deben crear registros duplicados. La importación no tiene que ser una transacción global de todo el archivo.
- Eliminar archivos temporales tras procesarlos. No conservar la planilla original por defecto.

También permitir agregar y corregir un invitado individualmente. Si cambia el correo tras un envío, pedir al administrador decidir si revoca el código anterior y emite una nueva invitación.

### 4.3 Generación de QR

Cada invitación tendrá un token aleatorio criptográficamente seguro de al menos 32 bytes, codificado como base64url. Ejemplo conceptual del contenido: `GALAQR1:<token_opaco>`. No incluir nombre, correo, RUT ni un ID correlativo predecible.

El QR es una credencial de invitación: identifica un registro, pero no prueba por sí mismo la identidad física de quien lo presenta. Una captura puede compartirse. El recepcionista ve el nombre al registrar y puede contrastarlo con la persona conforme al procedimiento del evento. La frase «personal e intransferible» no impide técnicamente copiarlo.

El backend almacena el hash del token para buscar y validar. Como el mismo QR debe poder mostrarse y reenviarse, conservar además el token cifrado con una clave del servidor; nunca guardar esa clave en MongoDB ni en el repositorio. El paquete descargado contiene las imágenes QR necesarias para enviar localmente y debe tratarse como un archivo sensible. No incluir tokens como columnas de la nómina ni imprimirlos en logs.

Generar la imagen PNG bajo demanda, sin guardar miles de imágenes en la base de datos. Reenviar utiliza el mismo QR vigente. Regenerar produce uno nuevo e invalida inmediatamente el anterior. Los paquetes locales ya descargados no se actualizan automáticamente: tras una regeneración, el administrador debe generar un paquete nuevo y retirar las invitaciones locales obsoletas. El servidor rechazará los códigos anteriores aunque se envíen por error.

No utilizar un enlace de autoasistencia. Un GET, abrir la imagen o leer el QR con un teléfono particular nunca registra asistencia ni revela datos del invitado. Únicamente la API autenticada de recepción puede hacerlo.

### 4.4 Preparación web y envío local de invitaciones

**Parte web:** permitir al administrador seleccionar invitados y descargar un ZIP de invitaciones. Generarlo de forma acotada o en lotes si supera los límites de memoria o tiempo del hosting. No conservarlo en una URL pública ni en el disco efímero del servidor.

Contenido del ZIP:

- `manifest.json`: versión del formato, identificador del paquete y evento, fecha de exportación, nombre/fecha/lugar del evento y lista de invitados con identificador, nombre, correo, versión del QR y ruta relativa de su imagen.
- `qr/<guestId>-v<version>.png`: un QR por invitado seleccionado, utilizando identificadores internos como nombres de archivo.
- Plantilla de correo y un archivo de instrucciones. El cuerpo puede generarse localmente con los datos del manifiesto.

El administrador descarga el paquete mediante una sesión autorizada. Registrar quién lo exportó y cuándo. El paquete contiene datos personales y credenciales de invitación: no subirlo a un repositorio ni compartirlo públicamente; eliminarlo al terminar el período acordado.

**Parte local:** una utilidad Node.js por línea de comandos, sin necesidad de construir otra aplicación gráfica en el MVP. Ofrecer estas operaciones:

1. Validar el paquete y mostrar destinatarios, evento y cantidad de mensajes.
2. Preparar una vista previa HTML y PNG local sin enviar.
3. Enviar una prueba a una dirección indicada explícitamente.
4. Enviar el lote seleccionado con confirmación del operador.
5. Consultar resultados y reanudar pendientes/fallidos tras cerrar el programa.

Los nombres exactos de comandos se definirán al implementar. La configuración de remitente, proveedor, credenciales y límites queda en un `.env` o almacén de secretos local excluido de Git. Elegir SMTP o API conforme a los mecanismos admitidos por la cuenta institucional o proveedor; soportar OAuth si la cuenta lo exige. No asumir que una contraseña normal del correo habilita SMTP.

Persistir progreso en un archivo local de estado separado del ZIP original, mediante escrituras atómicas. Identificar un mensaje por evento, invitado y versión de QR, incluso entre paquetes superpuestos, para evitar reenvíos involuntarios. Un reenvío intencional exige una opción explícita. Conservar estados pendiente, procesando, aceptado por proveedor, fallido e incierto. Si el proceso se interrumpe después de enviar pero antes de guardar, marcar el caso como incierto y revisarlo antes de reenviar; no garantizar exactamente una entrega. «Aceptado por proveedor» no prueba recepción en bandeja.

Aplicar concurrencia acotada, pausas y reintentos con espera progresiva según los límites de la cuenta. No se requiere una cola de correo en MongoDB ni sincronizar el estado local con la web en el MVP. Los reportes de asistencia son independientes del resultado de envío; el historial de correo se consulta y exporta localmente.

Asunto propuesto: `Tu invitación y código de acceso — Gala 2026`.

Plantilla:

> Hola **Estrella Inostroza**:
>
> Muestra este código QR a los encargados de recepción de la **Gala 2026**. Al escanearlo, registrarán tu asistencia.
>
> [Imagen del código QR]
>
> Recuerda que este código es personal e intransferible.
>
> Fecha: [fecha y hora]. Lugar: [lugar].

Incluir versión de texto y PNG adjunto; presentar la misma imagen en el cuerpo con un mecanismo compatible con el proveedor, por ejemplo un adjunto inline con CID cuando sea admitido. Evitar depender exclusivamente de imágenes remotas. Verificar el resultado en los clientes de correo que usarán los invitados.

Validar rutas del manifiesto, evitar traversal al extraer ZIP y limitar tamaño y cantidad de archivos. El texto de nombres y evento se escapa antes de incorporarlo a HTML. Una vista previa jamás despacha mensajes.

### 4.5 Recepción y registro

Esta es la pantalla principal y la prioridad de implementación. Tras iniciar sesión, un recepcionista con un solo evento asignado accede directamente al lector; si tiene varios, elige primero uno.

Pantalla optimizada para celular: nombre del evento y estado de conexión visibles, botón grande «Activar cámara», cámara trasera preferida, selección de otra cámara, permiso de cámara, lectura, resultado y botón «Escanear siguiente». El resultado debe combinar color, texto e icono, sin depender solo del color. Mostrar un mensaje útil si se niega el permiso o no hay cámara. Detener la cámara al salir de la pantalla o cerrar sesión; no guardar fotografías ni video. No es necesario instalar una app nativa. Permitir lector USB que escriba el contenido como teclado y búsqueda manual como alternativas.

Flujo normal:

1. El recepcionista inicia sesión y elige el evento asignado.
2. La cámara reconoce el token y el cliente realiza un POST autenticado.
3. El backend verifica sesión, permiso, evento abierto, invitación activa y token vigente.
4. Registra la primera asistencia mediante una actualización atómica condicional.
5. Responde con nombre y hora de entrada, sin exponer información adicional innecesaria.

Resultados visibles:

| Resultado | Respuesta de interfaz |
| --- | --- |
| Registrado | Verde, nombre y hora confirmados por el servidor |
| Ya registrado | Amarillo, nombre y hora original; no sumar asistencia |
| Código desconocido, revocado o de otro evento | Rojo, mensaje de rechazo |
| Evento cerrado / sin permiso | Bloqueo y explicación |
| Error de conexión | Mostrar que no se ha podido confirmar; permitir reintentar |

Desactivar temporalmente la lectura mientras se resuelve el POST para evitar solicitudes continuas por fotograma. Dos dispositivos que escanean simultáneamente deben producir una sola asistencia. El segundo recibe «ya registrado». Si se pierde la respuesta después de que el servidor escribió, el reintento recupera el registro existente.

Ingreso manual: buscar por nombre o correo, elegir al invitado y confirmar expresamente. Registrar método `manual`, operador y motivo; nunca crear un invitado improvisado sin permiso de administración. Las reversiones requieren administración y motivo, conservando el historial.

MVP exclusivamente online: sin confirmación del servidor, la interfaz no muestra una entrada exitosa. Una planilla de contingencia puede servir de respaldo operativo, pero su conciliación posterior es manual y auditada. Un modo offline con múltiples recepcionistas exige resolución de conflictos y constituye otra fase.

### 4.6 Reportes

Panel por evento: invitados activos, presentes, pendientes y porcentaje de asistencia. Calcular el porcentaje sobre invitados activos y mostrar ese denominador. No confundir invitaciones enviadas con asistencias.

Listado con filtros por nombre, correo, estado de asistencia, franja de entrada y operador. El estado de envío se conserva únicamente en el registro local de la utilidad de correo. Exportar CSV y XLSX con: evento, nombre, correo, estado, fecha/hora y zona horaria de entrada, operador y método de registro. No exportar tokens, hashes ni claves.

El reporte cerrado debe ser consistente con las entradas confirmadas. Escapar celdas que puedan interpretarse como fórmulas en Excel. Restringir exportaciones a administración y auditar su realización.

## 5. Modelo de datos mínimo

| Colección | Campos principales |
| --- | --- |
| `users` | `_id`, nombre, correo normalizado, passwordHash, rol, activo, eventIds, fechas |
| `sessions` | identificador seguro de sesión, userId, expiresAt |
| `events` | `_id`, nombre, fecha, timezone, lugar, estado, configuración de invitación |
| `guests` | `_id`, eventId, nombre, correo original/normalizado, codigoExterno, activo, tokenHash, tokenEncrypted, tokenVersion, checkIn, fechas |
| `imports` | `_id`, eventId, operador, resumen, errores por fila, estado, fechas |
| `audit_logs` | `_id`, evento/entidad, acción, operador, fecha, motivo y metadatos mínimos |

`checkIn` es nulo o contiene `at`, `by`, `method` y un identificador de operación. Es el dato autoritativo de asistencia. Las reversiones preservan el estado previo en auditoría.

Índices: único `(eventId, correoNormalizado)`; único parcial para `tokenHash` cuando exista; índice `(eventId, checkIn.at)` y TTL de sesiones. El backend debe comprobar expiración y actividad de usuario, ya que el borrado TTL no es inmediato.

La primera entrada se escribe con una operación equivalente a `findOneAndUpdate` filtrando evento, hash vigente, invitado activo y `checkIn: null`. No usar «consultar si existe y después insertar» como única protección. La auditoría de una mutación y su cambio deben persistirse consistentemente, mediante transacción cuando corresponda o un mecanismo duradero equivalente. Si se usa una colección separada de asistencias, exigir índice único `(eventId, guestId)` y resolver colisiones.

## 6. API orientativa

| Método y ruta | Uso y permiso |
| --- | --- |
| `POST /api/auth/login` | Iniciar sesión; limitar intentos |
| `POST /api/auth/logout` | Cerrar sesión |
| `GET /api/auth/me` | Consultar cuenta y permisos vigentes |
| `GET/POST /api/events` | Listar eventos permitidos / crear como administrador |
| `PATCH /api/events/:id` | Configurar o cambiar estado como administrador |
| `POST /api/events/:id/imports/preview` | Analizar archivo como administrador |
| `POST /api/events/:id/imports/:importId/confirm` | Confirmar importación como administrador |
| `GET/POST /api/events/:id/guests` | Listar según rol / crear como administrador |
| `PATCH /api/events/:id/guests/:guestId` | Editar como administrador |
| `POST /api/events/:id/guests/:guestId/qr/regenerate` | Revocar y emitir nuevo QR como administrador |
| `POST /api/events/:id/invitations/export` | Descargar paquete ZIP de invitados seleccionados como administrador |
| `POST /api/events/:id/check-ins` | Registrar QR o ingreso manual con rol autorizado |
| `POST /api/events/:id/check-ins/:guestId/reverse` | Revertir con motivo como administrador |
| `GET /api/events/:id/reports/attendance` | Consultar reporte como administrador |
| `GET /api/events/:id/reports/attendance/export` | Exportar como administrador |

Todas las rutas con un ID validan pertenencia al evento. El token QR se transmite en el cuerpo del POST, no en la URL ni en logs. Estandarizar respuestas como `CHECKED_IN`, `ALREADY_CHECKED_IN`, `INVALID_QR`, `EVENT_CLOSED` y `FORBIDDEN`, además del código HTTP apropiado.

## 7. Seguridad y operación

- HTTPS y cookies de sesión `HttpOnly`, `Secure` y `SameSite`; protección CSRF en operaciones mutables. No guardar sesiones en localStorage.
- Contraseñas con un algoritmo mantenido de hash adaptativo; límites de acceso y mensajes de login que no revelen cuentas existentes.
- Validación de entradas, límites de archivo y solicitudes, protección contra consultas inyectadas y escape de contenido en HTML y exportaciones.
- Secretos de la API en variables de entorno, separados por ambiente; nunca en variables públicas de compilación de React. Credenciales de correo exclusivamente en el computador del organizador.
- Usuario MongoDB exclusivo para esta app, privilegios mínimos y acceso de red restringido hasta donde permita el hosting.
- No registrar tokens, cuerpos completos de invitaciones ni datos personales innecesarios en logs.
- Desactivar cuentas y sesiones de recepcionistas cuando concluya el evento.
- Acordar plazo de conservación de datos con la organización. Documentar eliminación de invitados, exportaciones y respaldos.
- Exportar una copia de invitados antes del evento y asistencia después. La exportación CSV no reemplaza un respaldo completo de recuperación; ensayar respaldo/restauración con los medios disponibles en el plan elegido.

## 8. Alojamiento y costo con el correo separado

La web solo aloja frontend, API y datos de asistencia. El envío de correo no exige servicios, colas ni procesos residentes en ese hosting. Esto simplifica la operación, pero no elimina la necesidad de backend ni los límites del alojamiento.

Opción inicial: React compilado servido por Express en un servicio Node.js y MongoDB Atlas como base externa. También se puede separar el frontend estático de una API, considerando cookies, CORS y configuración de dominios si tienen distinto origen. Mantener frontend y API en el mismo origen es la opción inicial más sencilla.

Según las condiciones oficiales consultadas para la versión inicial el 26/10/2026, Render ofrece un servicio gratuito con suspensión por inactividad y MongoDB Atlas Free ofrece 512 MB. Usarlos como punto de partida para prototipo, verificando las condiciones al desplegar. La recepción debe ensayarse con el hosting y los teléfonos reales; el envío local no resuelve retrasos del servidor ni una caída de Internet.

El computador del organizador solo debe estar encendido durante preparación/envío. Durante la gala, los encargados acceden a la web por HTTPS y registran en la base compartida sin depender de ese computador.

No hay obligación de usar Resend ni adquirir un dominio por una exigencia de la aplicación. Si se utiliza una cuenta de correo ya disponible, comprobar permisos, autenticación, cuotas y política de envío de su proveedor. Ejecutar el envío localmente no evita dichos límites ni garantiza costo cero en correo.

Para un evento con continuidad exigida, evaluar un servicio que permanezca activo o infraestructura institucional existente. La elección del plan se toma según disponibilidad, cuotas y términos de uso vigentes, no solo según el peso del frontend.

## 9. Criterios de aceptación

1. Importar una nómina válida y repetir la importación sin duplicar invitados ni perder asistencias.
2. Presentar errores por fila, aceptar nombres repetidos y detectar correos repetidos según la política definida.
3. Generar códigos distintos, opacos y sin datos personales; regenerar invalida el anterior.
4. Leer el QR como invitado o realizar peticiones sin sesión no registra asistencia ni revela el registro.
5. Un recepcionista asignado registra correctamente; otro sin asignación recibe rechazo del backend.
6. Dos escaneos simultáneos, incluso desde distintos dispositivos, producen una sola asistencia y conservan hora/operador iniciales.
7. Un QR de otro evento, revocado o de un invitado inactivo es rechazado.
8. Un error de red nunca se muestra como entrada confirmada; el reintento no duplica.
9. El módulo local permite previsualizar sin enviar, enviar una prueba y reanudar pendientes tras reiniciarse sin reenviar automáticamente los mensajes aceptados o inciertos. La web no requiere credenciales ni servicio de correo.
10. Reporte, contador y exportación coinciden; solo administración puede descargarlos.
11. Cámara funcional sobre HTTPS en los teléfonos que se usarán realmente; probar al menos Safari iOS y Chrome Android si ambos estarán disponibles.
12. Ejecutar una prueba de carga con el escenario de diseño: 5 operadores y ráfagas de escaneo sobre una nómina de 1.000 invitados. Medir latencia y errores; como objetivo inicial, percentil 95 menor a 2 segundos con servicio activo y red estable. Ajustar infraestructura si no se cumple.
13. Revertir una entrada requiere motivo y conserva trazabilidad. Cerrar evento bloquea nuevas entradas.
14. Con el computador del organizador apagado, la recepción web y los reportes siguen funcionando.
15. Un paquete exportado contiene imágenes que se validan contra los invitados correctos en la API. Regenerar un QR invalida el anterior y requiere actualizar el paquete local.
16. Un recepcionista con un solo evento llega directamente al lector y puede registrar consecutivamente sin navegar por funciones administrativas. No se guardan imágenes de cámara.

## 10. Orden de implementación y entregables

1. Repositorio, configuración de ambientes, conexión MongoDB, sesiones y roles.
2. Eventos, invitados, importación con vista previa e índices.
3. QR y frontend de recepción como prioridad, incluyendo permisos de cámara, pruebas de concurrencia y autorización.
4. Exportación de paquete y utilidad local de correo, con plantilla, pruebas de visualización y progreso persistido localmente.
5. Reportes, exportaciones, auditoría y reversión.
6. Despliegue, pruebas con teléfonos, carga prevista y ensayo de contingencia.

Entregables de desarrollo: código frontend/backend y utilidad local en carpetas separadas, lockfile, `.env.example` independientes y sin secretos, instrucciones de ejecución/despliegue, CSV y paquete ZIP de ejemplo con datos ficticios, procedimiento de administrador inicial, guía de recepción, guía de envío local y evidencia de las pruebas críticas. Solo frontend y API se despliegan en la web.

Antes de enviar invitaciones reales, confirmar: cantidad de invitados, fecha, cuenta de correo disponible y su mecanismo de autenticación, número de operadores, calidad de conexión del recinto y si se permiten correos compartidos o acompañantes. Estos datos no impiden comenzar el MVP con los supuestos anteriores.

## 11. Fuentes oficiales

- Render Free y sus restricciones: https://render.com/docs/free
- MongoDB Atlas Free, límites: https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/
- MongoDB precios y almacenamiento: https://www.mongodb.com/pricing
- Vite: https://vite.dev/guide/
- Acceso a cámara en navegador: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia

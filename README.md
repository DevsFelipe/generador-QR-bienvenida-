# Encuentro · Recepción de eventos

Aplicación Node.js para cargar invitados desde Excel, asignar mesa y menú y registrar su llegada mediante un QR común y su RUT. Incluye administración, altas individuales y una guía de despliegue dentro de la aplicación. No requiere envío de correos.

## Dos repositorios independientes

- **Fuente:** este repositorio contiene el desarrollo, pruebas, ejemplos de configuración y el generador del paquete.
- **Despliegue:** `outputs/recepcion-render` contiene el paquete generado para otro repositorio Git conectado a Render. `outputs/` está excluido del Git del fuente, aunque tenga su propio Git.

Repositorio del fuente: https://github.com/DevsFelipe/generador-QR-bienvenida-.git

```powershell
git clone https://github.com/DevsFelipe/generador-QR-bienvenida-.git
cd generador-QR-bienvenida-
```

El repositorio de despliegue contiene únicamente el paquete generado.

## 1. Instalar y configurar después de clonar

Requiere Node.js 22 o superior, Git y una base MongoDB Atlas con transacciones. Desde la raíz del código fuente:

```powershell
npm.cmd ci
Copy-Item reception/.env.example reception/.env
```

Copia el ejemplo solo si `reception/.env` no existe: no sobrescribas una configuración que ya funciona. Completa `RECEPTION_MONGODB_URI` con tu propia cadena privada y `RECEPTION_MONGODB_DB` con el nombre de la base. En Atlas crea un usuario de base de datos con `readWrite` sobre esa base y autoriza tu IP actual.

Los archivos `.env` no se incluyen al clonar y deben crearse en cada instalación. Los `.env.example` no contienen claves y sí están versionados. El `.env` de la raíz corresponde al organizador antiguo; no se necesita para la web vigente. La aplicación actual utiliza `reception/.env`.

## 2. Crear el administrador y probar localmente

```powershell
npm.cmd run reception:user -- --username mi_admin --admin
npm.cmd start
```

La contraseña aleatoria se guarda localmente en `reception/acceso-mi_admin.txt`, excluido de Git. Guárdala de forma segura. No ejecutes el alta para un usuario que ya existe: las cuentas y contraseñas residen en MongoDB y se conservan al actualizar código.

Abre http://127.0.0.1:3220. Crea un evento, carga una planilla con encabezados `nombre | rut | mesa | menu` (correo e institución opcionales), revisa y confirma los datos. Abre la recepción para probar una llegada con datos ficticios. El RUT admite puntos y guion o su formato compacto; se valida el dígito verificador.

La guía se encuentra en http://127.0.0.1:3220/guia-despliegue.html y la página del proyecto en http://127.0.0.1:3220/proyecto.html.

## 3. Generar el paquete para Render

Desde la raíz del fuente, después de editar:

```powershell
npm.cmd run package:render
```

En una copia nueva se genera `outputs/recepcion-render` con el código de ejecución autorizado. No copia `.env`, contraseñas, planillas, respaldos ni dependencias instaladas.

**Compatibilidad con el repositorio de despliegue existente:** si `outputs/recepcion-render` ya tiene Git y la subcarpeta versionada `recepcion-render/package.json`, el generador actualiza esa subcarpeta. Conserva el Git y el historial. El comando muestra la carpeta final; revisa esa salida antes de publicar. No vuelvas a inicializar ni borres el repositorio existente.

## 4. Subir el paquete a un Git propio

Solo para un paquete recién generado que todavía no tenga repositorio:

```powershell
cd outputs/recepcion-render
git init -b main
git add .
git commit -m "Publicar aplicación de recepción"
```

Crea un repositorio vacío en GitHub, sin README inicial. Copia su URL real y úsala en `git remote add origin URL_DE_TU_REPOSITORIO`. Después ejecuta `git push -u origin main`.

Para el repositorio de despliegue que ya existe, usa su rama y remoto actuales: revisa `git status` y `git diff`, incorpora el paquete actualizado, realiza commit y push. No uses `push --force` ni mezcles historiales independientes.

## 5. Publicar en Render

Sigue [la guía de publicación](DESPLIEGUE_RENDER.md) o la guía dentro de la app. Crea un Web Service Docker, selecciona la carpeta que contiene el `package.json` del paquete como raíz y `reception/Dockerfile` dentro de ella. Configura la URI privada en Render y autoriza sus rangos de salida en Atlas.

Usa la misma base y conservarás usuarios, eventos y asistencias. Con una base nueva debes crear tu propio administrador. Genera el QR desde la URL pública para que los teléfonos accedan a Render.

## Configuración y datos privados

Git excluye `outputs/`, `.env` y variantes privadas, credenciales de administradores, claves, dependencias, respaldos y planillas. Los archivos privados existentes permanecen en el computador; no se eliminan ni se copian al paquete. Antes de cada primer push revisa `git status` y `git diff --cached`. No publiques datos reales de invitados ni pegues credenciales en código o documentación.

## Verificación y estructura

```powershell
npm.cmd test
```

- `reception/`: web actual y lógica de recepción.
- `scripts/package-render.mjs`: generador del paquete de despliegue.
- `test/`: pruebas automatizadas.
- `src/` y `public/`: organizador anterior conservado como referencia; no es el punto de inicio actual ni se exporta a Render.

Los ensayos de integración en `scripts/` requieren MongoDB y crean registros ficticios; léelos antes de ejecutarlos. Las pruebas locales no sustituyen un ensayo en Render y en teléfonos reales. Para una base antigua revisa `reception/migrate.js`, que genera respaldos privados antes de modificar índices; no es necesario ejecutarlo para cada cambio visual.

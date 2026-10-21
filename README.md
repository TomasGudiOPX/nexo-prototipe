# NEXO · Inteligencia constructiva

Prototipo NEXO con frontend, API propia y una selección del backend Go de RAGFlow en el mismo repositorio. El panel de operaciones de NEXO administra las funciones disponibles; el frontend de administración de RAGFlow no se incluye.

## Requisitos

- Docker Desktop/Engine con Docker Compose v2.
- Node.js 24.4+ para desarrollo local.

## Iniciar el monorepo con Docker

1. Copiá `.env.example` como `.env`.
2. Cambiá `NEXO_BOOTSTRAP_ADMIN_PASSWORD` por una contraseña única y reemplazá `NEXO_SESSION_SECRET`, `NEXO_ENCRYPTION_KEY` y `RAGFLOW_API_KEY` con secretos aleatorios. No reutilices los valores de ejemplo.
3. Generá credenciales locales para los servicios de almacenamiento:

   ```sh
   npm run configure:compose
   ```

   Esto crea `.env.compose.local`, que está excluido de Git. Conservá el archivo: las credenciales deben seguir coincidiendo con los datos persistidos en los volúmenes.
4. Iniciá el proyecto desde la raíz:

   ```sh
   docker compose up --build -d
   ```

Compose construye NEXO web/API y el backend Go seleccionado desde archivos de este repo, e inicia MySQL, Elasticsearch, MinIO, Kvrocks y NATS. No requiere `..\\ragflow-be`, otra instalación RAGFlow ni otro comando Compose. La API de RAGFlow solo está publicada en `127.0.0.1:9380` para desarrollo local; NEXO dentro de Docker la consume por la red privada. El puerto 9381 y los puertos de almacenamiento no se publican.

El archivo `docker-compose.ragflow.yml` contiene los servicios de RAGFlow sin los servicios web/API de este prototipo; una aplicación hermana puede incluirlo en su Compose para compartir el mismo backend, red y dependencias sin iniciar un segundo NEXO.

Abrí `http://localhost:3000` y el panel en `http://localhost:3000/admin/`. El usuario administrador inicial usa el email, nombre y contraseña configurados en `.env`. Con una base nueva, el arranque crea el administrador NEXO/RAGFlow y una cuenta técnica regular de RAGFlow para el API key; RAGFlow bloquea las llamadas de dataset hechas por superusuarios. No hay credenciales predeterminadas. Cambiar las variables de bootstrap no modifica cuentas ya existentes.

Para detener los contenedores y conservar los datos, ejecutá `docker compose down`. No uses `docker compose down -v` salvo que quieras borrar las bases, archivos e índices. Las credenciales generadas deben conservarse junto con los volúmenes para que los servicios puedan abrir sus datos después de reiniciar.

## Configuración de la aplicación

`RAGFLOW_BASE_URL` y `RAGFLOW_API_KEY` son la configuración de deployment de respaldo. Mientras no exista una configuración guardada, NEXO usa esos valores y la conexión se identifica como `deployment-managed`. Un site admin puede abrir `http://localhost:3000/admin/` para guardar una URL y reemplazar la API key en ejecución, validar la conexión o volver explícitamente a los valores de deployment. La API key no se muestra, exporta ni se devuelve al navegador; el override se cifra con `NEXO_ENCRYPTION_KEY` mediante AES-256-GCM. Conservá esa clave al restaurar un respaldo: cambiarla impide descifrar overrides existentes, que deben limpiarse desde el panel para volver al fallback.

La aplicación principal separa Home, Workspaces, Knowledge, Assistants, Activity, Reports y Configuration. Los workspaces agrupan usuarios autorizados con datasets y asistentes de RAGFlow; RAGFlow sigue siendo la fuente de verdad para documentos, procesamiento y configuración de asistentes. `RAGFLOW_DATASET_CHAT_IDS` conserva compatibilidad con la vista de chat anterior. Las Data Sources externas de RAGFlow se muestran como no disponibles si el backend conectado no expone ese contrato.

Para ejecutar NEXO fuera de Docker con `npm run dev`, iniciá primero los servicios con Compose y configurá `RAGFLOW_BASE_URL=http://localhost:9380` en `.env`. Tailwind CSS se recompila con `npm run dev` y se genera optimizado antes de `npm run build`; el archivo estático se escribe en `public/tailwind.css`. El ingreso local necesita `NEXO_BOOTSTRAP_ADMIN_EMAIL`, `NEXO_BOOTSTRAP_ADMIN_NAME`, `NEXO_BOOTSTRAP_ADMIN_PASSWORD` y `NEXO_SESSION_SECRET`: en desarrollo se leen de `.env` y, si existe, de `.env.local`, que Compose también carga como `env_file` opcional. Con la base vacía, la cuenta administradora se crea con esos valores en el primer intento de ingreso; si `NEXO_SESSION_SECRET` falta, el ingreso responde 503 y ningún usuario puede iniciar sesión. Como el contenedor web ocupa por defecto el puerto 3000, detenelo (`docker compose stop nexo`) o elegí otro `NEXO_PORT` antes de iniciar Vite. La API Node dentro de Compose ya usa `http://ragflow-backend:9380`; no cambies esa dirección por una URL del host.

## Arquitectura y selección de RAGFlow

El código upstream seleccionado es RAGFlow `v1.0.0-rc1` (`14bb02ee4584c1ab18f0c722c48beecd6bbf9860`), con licencia Apache-2.0 y atribución en `vendor/ragflow/UPSTREAM.md`. Se conserva la clausura de fuente Go necesaria para API, ingesta, sincronización y funciones de dataset/documentos/chunks/grafo/chat. Se excluyen la API/servicios Python, interfaz web de RAGFlow, SDKs, ejemplos y perfiles opcionales. Las dependencias de datos necesarias se declaran como servicios del Compose raíz.

Las imágenes backend se construyen desde el contexto de este repositorio. Los Dockerfiles pueden descargar imágenes base, toolchains y recursos upstream declarados; no leen otra carpeta de checkout. El stack limita memoria por contenedor, pero el total real depende de los datos, la carga de ingesta y Docker. La medición comparativa de memoria del cambio OpenSpec se documentará cuando se verifique en ejecución.

## Configuración segura para VPS

En el servidor, proporciona `.env` y `.env.compose.local` como secretos fuera de las imágenes y del control de versiones. Configurá `NEXO_PORT` según el proxy frontal. Terminá TLS en ese proxy y reenviá `X-Forwarded-Proto: https` para habilitar cookies seguras. Publicá imágenes construidas desde esta revisión del monorepo; no es necesario clonar otro backend. Respaldá los volúmenes y conservá `NEXO_ENCRYPTION_KEY`, `.env.compose.local` y las credenciales de bootstrap necesarias para restaurar.

La guía de copia/restauración del estado NEXO está en [docs/nexo-data-backup.md](docs/nexo-data-backup.md).

Antes de actualizar una instalación, respaldá los volúmenes y los dos archivos de entorno. Revisá el cambio de versión de `vendor/ragflow/UPSTREAM.md`, reconstruí las imágenes con `docker compose up --build -d` y conservá los archivos/secretos existentes. Las actualizaciones de esquema del backend pueden impedir volver a una imagen anterior con datos ya migrados; restaurá también el respaldo si necesitás volver atrás.
 
## Operación del sitio NEXO

La navegación de producción, workspaces, proveedores, fuentes de datos,
actividad y límites de reportes se describen en
[docs/nexo-production-operations.md](docs/nexo-production-operations.md).

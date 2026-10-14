# NEXO · Inteligencia constructiva

Frontend standalone para el prototipo NEXO. Las vistas de proyectos, documentos, alertas, informes y configuración usan contenido de demostración. El Centro de Inteligencia y el Asistente consultan datasets de RAGFlow.

## Requisitos

- Node.js 20.19+ o 22.12+
- Un servidor `ragflow-be` disponible y un dataset accesible
- Un chat de RAGFlow asociado al dataset para usar el Asistente

## Configuración local

1. Instalá dependencias con `npm ci`.
2. Ejecutá `npm run configure` desde una terminal interactiva. El prompt oculta la API key mientras la escribís y guarda la configuración solo en `.env`, que está excluido de Git. Podés dejar el mapeo de chats como `{}` para explorar grafos; agregá `{"dataset-id":"chat-id"}` para habilitar respuestas del Asistente.
3. Iniciá el frontend con `npm run dev` y abrí `http://localhost:3000`.
4. Si el frontend ya estaba abierto al configurar la conexión, pulsá **Reintentar conexión** en Centro de Inteligencia.
5. Ejecutá `npm run typecheck` y `npm run build` para validar el proyecto.

Las credenciales se leen exclusivamente en los handlers del servidor. El navegador solo llama a rutas del mismo origen y nunca recibe la API key. Si el backend usa otro puerto o esquema, indicá la URL completa durante la configuración.

## Docker

Docker Compose ejecuta dos servicios de NEXO desde este repositorio: `nexo` sirve el frontend y `nexo-api` ejecuta las rutas API de React Router. NEXO se conecta a una instancia RAGFlow existente. Copiá `.env.example` a `.env`, completá `RAGFLOW_API_KEY` y el mapeo de chats, y ejecutá:

```sh
docker compose up --build -d
```

Abrí NEXO en `http://localhost:3000`. El proxy Nginx del servicio `nexo` envía `/api/*` al servicio `nexo-api`; la API key solo se configura en `nexo-api` y no se envía al navegador. `RAGFLOW_BASE_URL_DOCKER` es la dirección que resuelve desde ese contenedor; para RAGFlow en el host, `http://host.docker.internal:9380` funciona con Docker Desktop. La URL local para `npm run dev` sigue siendo `RAGFLOW_BASE_URL=http://localhost:9380`. `RAGFLOW_ADMIN_URL` es independiente y se abre desde el navegador, por ejemplo `http://localhost:80` para la UI del contenedor RAGFlow.

La selección de `ragflow-be` es deliberadamente acotada: NEXO usa por HTTP las operaciones de datasets, documentos/chunks y metadatos de grafo, y chat. El backend distribuible es la API liviana de NEXO en este monorepo. No copiamos los handlers Go porque dependen de paquetes internos de almacenamiento/indexación; tampoco el SDK Python, que duplicaría el cliente TypeScript existente, ni la UI admin completa. Elasticsearch, MySQL, MinIO, ClickHouse, Kvrocks, NATS y el motor RAGFlow quedan en la instalación RAGFlow existente. En el perfil CPU revisado, el stack consumía alrededor de 6.5 GiB de RAM (Elasticsearch cerca de 4.6 GiB). Abrí **RAGFlow Admin** desde la navegación lateral; el enlace usa `RAGFLOW_ADMIN_URL` y debe ser accesible desde el navegador.

## Preparación inicial de RAGFlow

NEXO aún no crea datasets, carga documentos ni configura asistentes. Para la primera puesta en marcha, usa RAGFlow Admin para configurar un proveedor/modelo, crear un dataset, cargar y procesar documentos, y crear un chat asociado a ese dataset. Después selecciona el dataset en NEXO; si el chat no se detecta automáticamente, configúralo en `RAGFLOW_DATASET_CHAT_IDS`. Los hallazgos, la selección de componentes y una propuesta de panel inicial están en [docs/ragflow-discoveries.md](docs/ragflow-discoveries.md).

Para detener NEXO sin borrar configuración ni datos:

```sh
docker compose down
```

Esto detiene y elimina los contenedores/red de NEXO, pero conserva sus imágenes y no opera sobre los volúmenes del proyecto RAGFlow. No uses `docker compose down -v` para detener NEXO. Para volver al modo desarrollo, detené NEXO con el comando anterior e iniciá `npm run dev`; el `.env` local conserva su `RAGFLOW_BASE_URL` de host.

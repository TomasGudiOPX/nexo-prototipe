# Hallazgos sobre RAGFlow

## Alcance y fuente inspeccionada

Estos hallazgos comparan el checkout hermano `../ragflow-be` con la integración NEXO actual. El backend incluido en `vendor/ragflow/` es una exportación seleccionada del mismo upstream (`v1.0.0-rc1`, commit `14bb02ee4584c1ab18f0c722c48beecd6bbf9860`), con los parches de perfil descritos en [`../vendor/ragflow/UPSTREAM.md`](../vendor/ragflow/UPSTREAM.md). El checkout hermano sirve como referencia para estudiar el repositorio completo; no es una dependencia de build o ejecución del monorepo NEXO.

## Qué es el backend de RAGFlow

- RAGFlow no es solo una API HTTP pequeña. El backend Go contiene handlers, servicios de dominio, DAO, entidades, motores, almacenamiento y otros paquetes internos.
- Los handlers de datasets (`ragflow-be/internal/handler/dataset.go`) reciben servicios de dataset y metadata; el handler de chat (`ragflow-be/internal/handler/chat.go`) depende de servicios de chat, usuario, búsqueda, tenant, proveedor de modelos y recuperación de chunks.
- Por eso, copiar solo esos handlers a NEXO no produce un backend ejecutable: también habría que resolver sus dependencias internas y los servicios de estado/índice.
- El SDK Python (`ragflow-be/sdk/python/ragflow_sdk/modules/`) es un cliente HTTP para consumir RAGFlow, no el servidor. Incorporarlo a la API Node de NEXO duplicaría el cliente HTTP existente y añadiría otra runtime.

## Límites y dependencias operativas

El Compose integrado actual inicia `ragflow-backend` junto con MySQL, Elasticsearch, MinIO, Kvrocks y NATS. El perfil Go seleccionado no inicializa el controlador ClickHouse, por eso ClickHouse no forma parte de ese Compose. En una medición anterior del despliegue CPU, el stack ocupaba aproximadamente 6.5 GiB de RAM, con cerca de 4.6 GiB atribuidos a Elasticsearch. Esa medición corresponde a aquel entorno y no predice el consumo de la configuración actual ni es un requisito universal; el uso real depende de datos, concurrencia, parsing, Docker y ajustes de servicios.

El servicio `ragflow-backend` integrado sigue siendo responsable de almacenar datasets, procesar/indexar documentos, generar chunks, mantener modelos/configuración y responder consultas. El contenedor `nexo-api` no reemplaza ese motor; lo consume mediante HTTP.

## Superficie HTTP que NEXO necesita

La integración del servidor NEXO usa la API HTTP de RAGFlow para estas operaciones:

| Operación NEXO | API RAGFlow usada | Para qué |
|---|---|---|
| Listar datasets | `GET /api/v1/datasets` | Elegir el dataset en el Centro de Inteligencia y validar selecciones. |
| Encontrar chats/asistentes y datasets vinculados | `GET /api/v1/chats` | Descubrir una asociación existente o resolver el chat configurado para consultas. |
| Leer documentos | `GET /api/v1/datasets/{dataset_id}/documents` | Mostrar nodos de archivo y construir el grafo alternativo. |
| Leer chunks | `GET /api/v1/datasets/{dataset_id}/documents/{document_id}/chunks` | Derivar conceptos/relaciones explicables desde keywords, contenido y metadatos. |
| Consultar grafo de conocimiento | `GET /api/v1/datasets/{dataset_id}/graph` | Usar el grafo extraído por RAGFlow cuando está disponible. |
| Consultar un asistente | `POST /api/v1/openai/{chat_id}/chat/completions` | Enviar preguntas y recibir respuestas/referencias. |

Las llamadas se originan en el servidor NEXO y usan la API key como credencial Bearer. La key no debe exponerse al frontend. La API de NEXO devuelve errores de configuración o conectividad si falta la URL/key o el motor no es alcanzable.

Cuando RAGFlow no ofrece un grafo de conocimiento para un dataset, NEXO puede construir un grafo de documentos y términos compartidos a partir de chunks/metadata. Ese grafo alternativo es una visualización derivada por NEXO, no un grafo persistido por RAGFlow.

## Estado histórico de NEXO antes del panel de operaciones

En la inspección original NEXO listaba datasets, visualizaba sus documentos/conexiones, consultaba chats asociados y respondía preguntas con el chat vinculado. La asociación podía resolverse desde los chats visibles o configurarse con `RAGFLOW_DATASET_CHAT_IDS`. NEXO también ofrecía un enlace a la UI admin configurada mediante `RAGFLOW_ADMIN_URL`.

En aquel punto de partida faltaban las operaciones de preparación de datos y asistentes:

1. Validar conexión y permisos de API con un botón de diagnóstico.
2. Crear un dataset y configurar método/parser.
3. Subir documentos, iniciar su procesamiento/indexación y mostrar el progreso/errores.
4. Configurar el proveedor/modelo requerido por RAGFlow.
5. Crear o editar un chat/asistente, asociar el dataset y guardar esa asociación sin editar variables de entorno.
6. Verificar desde NEXO que el dataset tenga documentos procesados y un asistente consultable.

Ese diagnóstico describe el punto de partida histórico. La decisión posterior fue implementar en NEXO un panel de operaciones limitado a sus flujos, en lugar de incluir la UI admin completa de RAGFlow. Las capacidades disponibles hoy se detallan en «Estado actual» más abajo; las opciones avanzadas del motor siguen dependiendo de RAGFlow.

## Decisión de arquitectura: propuesta inicial y evolución

La propuesta inicial era mantener RAGFlow como instalación separada y consumirlo por HTTP. Esa separación de responsabilidades sigue vigente, pero la decisión de empaquetado cambió: NEXO ahora incluye una exportación seleccionada del backend Go y la construye como servicio propio del Compose.

**Incluir en NEXO:** frontend NEXO, API Node, adaptador HTTP, transformaciones de grafo, exportación Go seleccionada de RAGFlow y Docker/Compose para la aplicación y el backend.

**Mantener como servicio RAGFlow:** API/ingesta/recuperación Go, estado e índices propios de RAGFlow. NEXO no copia handlers aislados ni accede directamente a sus bases; conserva la UI propia y omite la consola web admin de RAGFlow.

La exportación hace que el build integrado no dependa de un checkout hermano. El acoplamiento de NEXO sigue siendo al contrato HTTP del servicio, mientras la selección vendorizada y sus parches requieren mantenimiento explícito al actualizar upstream.

## Estado actual de NEXO

El panel `/admin/` y sus APIs viven en este repositorio. NEXO administra sus propias cuentas, sesiones y aprobaciones MCP en SQLite; el volumen persistente es `nexo-data`. El Compose sí construye y levanta `ragflow-backend` desde `vendor/ragflow/`, además de MySQL, Elasticsearch, MinIO, Kvrocks y NATS. No usa el checkout hermano `../ragflow-be` ni incluye la consola web admin de RAGFlow.

La API HTTP se consume desde el servidor NEXO con una credencial Bearer. Las rutas actuales cubren datasets, documentos (carga y procesamiento), chats/asistentes, sesiones, referencias de respuesta y grafo; el manifiesto de `vendor/ragflow/UPSTREAM.md` identifica la versión que se empaqueta. Data Sources/connectors y otras operaciones varían entre versiones o distribuciones. NEXO sondea endpoints para reportar capacidades, pero cada operación y forma de respuesta debe verificarse contra la instancia destino. Data Sources son conexiones de ingesta asociadas a datasets; las aprobaciones MCP registradas por NEXO pertenecen al estado de NEXO.

NEXO permite registrar servidores Streamable HTTP, descubrir herramientas y aprobarlas. La invocación MCP desde asistentes sigue deshabilitada hasta confirmar un contrato compatible end-to-end con el backend conectado. No inferir que almacenar una aprobación habilita automáticamente su ejecución por RAGFlow.

La configuración de deployment (`RAGFLOW_BASE_URL`, `RAGFLOW_API_KEY`) tiene precedencia de respaldo; un site admin puede guardar overrides, validar la conexión o volver al fallback. La API key no se expone al navegador y el override persistente se cifra con `NEXO_ENCRYPTION_KEY`. En una base nueva, el bootstrap crea un superusuario y una cuenta técnica regular separada para la API key; el API de datasets de RAGFlow no acepta superusuarios.

Referencias oficiales consultadas: [RAGFlow HTTP API](https://ragflow.io/docs/v1.0.0-rc1/http_api_reference), [MCP overview](https://ragflow.io/docs/mcp_overview), [connect external MCP servers](https://ragflow.io/docs/develop/mcp/connect_an_external_mcp_to_ragflow).

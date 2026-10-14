# Hallazgos sobre RAGFlow

## Alcance y fuente inspeccionada

Estos hallazgos se basan en el checkout hermano `../ragflow-be`, revisión `14bb02e`, y en la integración NEXO presente en este repositorio. Las referencias a `ragflow-be/...` apuntan a ese checkout inspeccionado; no forman parte de este monorepo ni son rutas disponibles en un clon limpio.

## Qué es el backend de RAGFlow

- RAGFlow no es solo una API HTTP pequeña. El backend Go contiene handlers, servicios de dominio, DAO, entidades, motores, almacenamiento y otros paquetes internos.
- Los handlers de datasets (`ragflow-be/internal/handler/dataset.go`) reciben servicios de dataset y metadata; el handler de chat (`ragflow-be/internal/handler/chat.go`) depende de servicios de chat, usuario, búsqueda, tenant, proveedor de modelos y recuperación de chunks.
- Por eso, copiar solo esos handlers a NEXO no produce un backend ejecutable: también habría que resolver sus dependencias internas y los servicios de estado/índice.
- El SDK Python (`ragflow-be/sdk/python/ragflow_sdk/modules/`) es un cliente HTTP para consumir RAGFlow, no el servidor. Incorporarlo a la API Node de NEXO duplicaría el cliente HTTP existente y añadiría otra runtime.

## Límites y dependencias operativas

El despliegue CPU de RAGFlow inspeccionado contiene el servicio RAGFlow y servicios de estado/infraestructura como Elasticsearch, MySQL, MinIO, ClickHouse, Kvrocks y NATS. En el entorno analizado, el stack ocupaba aproximadamente 6.5 GiB de RAM, con cerca de 4.6 GiB atribuidos a Elasticsearch. Es una medición de ese despliegue, no un requisito universal.

La instancia RAGFlow existente sigue siendo responsable de almacenar datasets, procesar/indexar documentos, generar chunks, mantener modelos/configuración y responder consultas. El contenedor `nexo-api` no reemplaza ese motor.

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

## Qué ofrece hoy NEXO y qué falta para la configuración inicial

Hoy NEXO lista datasets, visualiza sus documentos/conexiones, consulta chats asociados y responde preguntas con el chat vinculado. La asociación puede resolverse desde los chats visibles o configurarse con `RAGFLOW_DATASET_CHAT_IDS`. NEXO también ofrece un enlace a la UI admin configurada mediante `RAGFLOW_ADMIN_URL`.

NEXO todavía no cubre de punta a punta las operaciones de preparación de datos y asistentes:

1. Validar conexión y permisos de API con un botón de diagnóstico.
2. Crear un dataset y configurar método/parser.
3. Subir documentos, iniciar su procesamiento/indexación y mostrar el progreso/errores.
4. Configurar el proveedor/modelo requerido por RAGFlow.
5. Crear o editar un chat/asistente, asociar el dataset y guardar esa asociación sin editar variables de entorno.
6. Verificar desde NEXO que el dataset tenga documentos procesados y un asistente consultable.

Por eso, para las primeras operaciones se necesita conservar acceso a la UI admin de RAGFlow o implementar en NEXO un panel guiado y limitado a esos flujos. No conviene copiar toda la UI admin: incluye muchas funciones que este prototipo no necesita y está acoplada a su propio backend. La opción más pequeña es un asistente de configuración NEXO para conexión, dataset/documentos, estado de indexación y asociación de chat; las opciones avanzadas de modelos, proveedores e integraciones pueden seguir en la UI admin.

## Decisión recomendada para el monorepo

**Incluir en NEXO:** frontend NEXO, su API liviana Node, el adaptador HTTP del lado servidor, las transformaciones de grafo necesarias y Docker/Compose para ambos servicios.

**Usar sin copiar:** la superficie HTTP RAGFlow necesaria para dataset, documentos/chunks/metadatos, grafo y chat.

**Dejar en la instalación RAGFlow:** handlers Go y paquetes internos, motor de indexación/recuperación, servicios de almacenamiento/estado, volúmenes persistentes y UI admin completa.

Así, FE y API de NEXO se construyen desde un solo repositorio, mientras RAGFlow mantiene su responsabilidad de motor de conocimiento sin iniciar un segundo stack de alto consumo.

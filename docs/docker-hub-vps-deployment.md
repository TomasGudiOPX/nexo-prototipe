# Publicar NEXO en Docker Hub y desplegarlo en un VPS

## Imágenes que se deben publicar

El proyecto ya tiene las tres imágenes locales necesarias:

| Servicio        | Imagen local                     | Imagen de Docker Hub propuesta                       |
| --------------- | -------------------------------- | ---------------------------------------------------- |
| Frontend Nginx  | `nexo-prototipe:web`             | `DOCKERHUB_NAMESPACE/nexo-web:IMAGE_TAG`             |
| API NEXO        | `nexo-prototipe:api`             | `DOCKERHUB_NAMESPACE/nexo-api:IMAGE_TAG`             |
| Backend RAGFlow | `nexo-prototipe:ragflow-backend` | `DOCKERHUB_NAMESPACE/nexo-ragflow-backend:IMAGE_TAG` |

MySQL, Elasticsearch, MinIO, Kvrocks y NATS usan imágenes públicas declaradas en
`docker-compose.yml`; no hay que publicarlas de nuevo.

## Release publicado

### `v1.1.1` — actual, imágenes Linux `amd64`

Solo cambia el backend de NEXO; `nexo-web` y `nexo-ragflow-backend` siguen
siendo los de `v1.1`.

- `tomasgudiopx/nexo-api:v1.1.1` — `sha256:f3cde2b0fe895764262a3adc03e14747d486de5ab6a56d2a69a87fbe6dfe1a55`

Corrige "Proveedores y modelos": un proveedor que el tenant todavía no vinculó
hacía fallar el listado de conexiones con `no provider found for provider '<X>'`
y no dejaba configurar ninguno. El backend de RAGFlow no cambió.

### `v1.1` — imágenes Linux `amd64`

- `tomasgudiopx/nexo-web:v1.1` — `sha256:05e9cf13b9d5e45098b0a4d9b320328c5c2df8e1767d5829f447e911cbfdbfd0`
- `tomasgudiopx/nexo-api:v1.1` — `sha256:1341a6371018f16204d024b7ac090a86c205752613f70359882add289df13f97`
- `tomasgudiopx/nexo-ragflow-backend:v1.1` — `sha256:e3d8111fa2bb1cf3ae6248a91fc872e039775b8c751bcb28426cb4eaa2fda293`

`v1.1` agrega en el Centro de Inteligencia: los datasets de un solo archivo
muestran sus propios conceptos, el nodo de la fuente deja de quedar tapado por
el bloque central, y el renombre de "dataset" a "fuente". El backend de RAGFlow
no cambió: `nexo-ragflow-backend:v1.1` es el mismo contenido que `v1`.

### `v1` — anterior

La release `v1` publicada en Docker Hub contiene imágenes Linux `amd64`:

- `tomasgudiopx/nexo-web:v1` — `sha256:6e3994eb68f6832b1ed66b216cfe0df953cf3497c4a5cc33f78a4d1cc0068b6d`
- `tomasgudiopx/nexo-api:v1` — `sha256:3f40d86a742c4f94980f95429a4b636bda6fd8128080c248ace5050ce376ddd0`
- `tomasgudiopx/nexo-ragflow-backend:v1` — `sha256:e3d8111fa2bb1cf3ae6248a91fc872e039775b8c751bcb28426cb4eaa2fda293`

Desde la raíz del proyecto, iniciar sesión y publicar las imágenes ya construidas:

```bash
export DOCKERHUB_NAMESPACE="tu_usuario_de_dockerhub"
export IMAGE_TAG="v1.1"

docker login

docker tag nexo-prototipe:web "$DOCKERHUB_NAMESPACE/nexo-web:$IMAGE_TAG"
docker tag nexo-prototipe:api "$DOCKERHUB_NAMESPACE/nexo-api:$IMAGE_TAG"
docker tag nexo-prototipe:ragflow-backend "$DOCKERHUB_NAMESPACE/nexo-ragflow-backend:$IMAGE_TAG"

docker push "$DOCKERHUB_NAMESPACE/nexo-web:$IMAGE_TAG"
docker push "$DOCKERHUB_NAMESPACE/nexo-api:$IMAGE_TAG"
docker push "$DOCKERHUB_NAMESPACE/nexo-ragflow-backend:$IMAGE_TAG"
```

Para una compilación reproducible para un VPS x86_64/Linux, construir y publicar
directamente con Buildx:

```bash
docker buildx build --platform linux/amd64 --target web \
  -t "$DOCKERHUB_NAMESPACE/nexo-web:$IMAGE_TAG" --push .
docker buildx build --platform linux/amd64 --target runtime \
  -t "$DOCKERHUB_NAMESPACE/nexo-api:$IMAGE_TAG" --push .
docker buildx build --platform linux/amd64 \
  -f docker/ragflow-backend.Dockerfile \
  -t "$DOCKERHUB_NAMESPACE/nexo-ragflow-backend:$IMAGE_TAG" --push .
```

Use tags inmutables como `v1`, `v1.0.1` o el SHA corto del commit; no despliegue
producción con `latest` como única referencia.

## Archivos que viajan al VPS

Además de las imágenes, el VPS necesita el `docker-compose.yml` y estos archivos
montados por Compose:

- `vendor/ragflow/docker/init.sql`
- `vendor/ragflow/docker/kvrocks-entrypoint.sh`

También necesita los secretos `.env` y `.env.compose.local`, que nunca se copian
dentro de una imagen ni se suben a Git o Docker Hub.

Para usar la release publicada sin compilar en el VPS, cree junto al Compose un
archivo `docker-compose.images.yml`:

```yaml
services:
  nexo:
    image: tomasgudiopx/nexo-web:v1.1
  nexo-api:
    image: tomasgudiopx/nexo-api:v1.1.1
  ragflow-backend:
    image: tomasgudiopx/nexo-ragflow-backend:v1.1
```

Luego descargue y arranque sin compilar:

```bash
docker compose -f docker-compose.yml -f docker-compose.images.yml pull
docker compose -f docker-compose.yml -f docker-compose.images.yml up -d --no-build
```

## `.env`: NEXO y bootstrap de RAGFlow

Crear `.env` en el VPS con valores propios. Los siguientes son obligatorios en
una instalación nueva:

```dotenv
# La API interna de NEXO se conecta al backend Compose por esta URL.
RAGFLOW_BASE_URL=http://ragflow-backend:9380
RAGFLOW_API_KEY=CAMBIAR_POR_UN_SECRETO_ALEATORIO

# Primer administrador: sólo se usa para una base NEXO nueva.
NEXO_BOOTSTRAP_ADMIN_EMAIL=admin@nexo.com
NEXO_BOOTSTRAP_ADMIN_NAME=Administrador-NEXO
NEXO_BOOTSTRAP_ADMIN_PASSWORD=CAMBIAR_POR_UNA_CONTRASENA_DE_12_O_MAS_CARACTERES

# Cuenta técnica regular para la API de NEXO en RAGFlow.
NEXO_RAGFLOW_SERVICE_EMAIL=nexo-api@internal.nexo.com

# Debe tener al menos 32 bytes; 64 caracteres hexadecimales es una opción segura.
NEXO_SESSION_SECRET=CAMBIAR_POR_64_CARACTERES_HEXADECIMALES

# Obligatoriamente 64 caracteres hexadecimales (AES-256-GCM).
NEXO_ENCRYPTION_KEY=CAMBIAR_POR_64_CARACTERES_HEXADECIMALES

# NEXO sólo escucha localmente; Nginx/Caddy público termina TLS.
NEXO_PORT=127.0.0.1:3000

# Opcional: mapa JSON de dataset a assistant/chat de RAGFlow.
RAGFLOW_DATASET_CHAT_IDS={}
```

Genere los secretos en el VPS, por ejemplo:

```bash
openssl rand -hex 32
```

Ejecute el comando una vez por cada secreto. Conserve especialmente
`NEXO_ENCRYPTION_KEY`: cambiarla impide descifrar las claves de RAGFlow guardadas
desde el panel de NEXO.

## `.env.compose.local`: credenciales de dependencias privadas

El archivo debe contener valores persistentes para:

```dotenv
MYSQL_PASSWORD=
MYSQL_ROOT_PASSWORD=
ELASTIC_PASSWORD=
MINIO_USER=rag_flow
MINIO_ROOT_USER=rag_flow
MINIO_PASSWORD=
MINIO_ROOT_PASSWORD=
REDIS_PASSWORD=
CLICKHOUSE_USER=ragflow
CLICKHOUSE_PASSWORD=
```

En una copia del repositorio puede generarse y conservarse con:

```bash
npm run configure:compose
```

No regenere estas contraseñas si ya existen volúmenes: los servicios no podrán
abrir sus datos. Respáldelas junto con los volúmenes Docker.

## URL pública y TLS

1. Cree un registro DNS `A`, por ejemplo `nexo.tu-dominio.com`, apuntando a la IP
   pública del VPS.
2. Abra únicamente 80/tcp y 443/tcp en el firewall público.
3. Instale un proxy frontal con TLS (Nginx, Caddy o Traefik) que apunte a
   `http://127.0.0.1:3000`.
4. El proxy debe reenviar `Host`, `X-Forwarded-For` y
   `X-Forwarded-Proto: https`; esto permite que NEXO marque las cookies de
   sesión como `Secure`.

Ejemplo mínimo de Nginx detrás de un certificado TLS:

```nginx
server {
  listen 443 ssl http2;
  server_name nexo.tu-dominio.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
  }
}
```

No publique los puertos de RAGFlow, MySQL, Elasticsearch, MinIO, Kvrocks o NATS.
El Compose actual limita RAGFlow a `127.0.0.1:9380`.

## Verificación posterior al despliegue

```bash
docker compose ps
curl -f http://127.0.0.1:3000/
curl -f http://127.0.0.1:9380/api/v1/system/healthz
```

Después, visite `https://nexo.tu-dominio.com` e inicie sesión con el administrador
de bootstrap. Las variables de bootstrap no modifican usuarios ya creados.

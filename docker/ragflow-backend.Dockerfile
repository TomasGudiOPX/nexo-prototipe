FROM infiniflow/github_action_runner:latest AS build

USER root
SHELL ["/bin/bash", "-c"]
WORKDIR /ragflow

COPY vendor/ragflow/go.mod vendor/ragflow/go.sum ./
RUN --mount=type=cache,id=nexo_ragflow_gomod,target=/root/.cache/gomod \
    --mount=type=cache,id=nexo_ragflow_gobuild,target=/root/.cache/gobuild \
    GOMODCACHE=/root/.cache/gomod GOCACHE=/root/.cache/gobuild \
    go mod download

COPY vendor/ragflow/internal ./internal
COPY vendor/ragflow/cmd ./cmd
COPY vendor/ragflow/common ./common
COPY vendor/ragflow/conf ./conf
COPY vendor/ragflow/build.sh ./build.sh
COPY vendor/ragflow/Dockerfile ./Dockerfile
COPY vendor/ragflow/ragflow_deps/download_go_deps.py vendor/ragflow/ragflow_deps/download_deps.py ./ragflow_deps/
RUN chmod +x build.sh && \
    git config --global safe.directory "*" && \
    ./build.sh --cpp
RUN rm -rf /opt/ragflow-native-libs/office_oxide /root/ragflow-native-libs/office_oxide \
      ragflow_deps/office_oxide-linux-x86_64.tar.gz && \
    uv run --with requests --with huggingface-hub python3 ragflow_deps/download_go_deps.py --nexo-profile
RUN curl -fL --retry 3 --retry-all-errors --connect-timeout 15 --max-time 120 \
    -o /ragflow/ragflow_deps/cl100k_base.tiktoken \
    https://openaipublic.blob.core.windows.net/encodings/cl100k_base.tiktoken
RUN --mount=type=cache,id=nexo_ragflow_gomod,target=/root/.cache/gomod \
    --mount=type=cache,id=nexo_ragflow_gobuild,target=/root/.cache/gobuild \
    GOMODCACHE=/root/.cache/gomod GOCACHE=/root/.cache/gobuild \
    ./build.sh --go

FROM infiniflow/github_action_runner:latest AS tokenizer-assets
USER root
RUN git clone --depth 1 https://github.com/infiniflow/resource.git /resource

FROM ubuntu:24.04 AS runtime
ENV DEBIAN_FRONTEND=noninteractive \
    LD_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu \
    HF_ENDPOINT=https://hf-mirror.com
WORKDIR /ragflow

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl fonts-dejavu fontconfig libpcre2-8-0 && \
    rm -rf /var/lib/apt/lists/* && \
    mkdir -p /ragflow/bin /ragflow/conf /ragflow/logs /ragflow/rag/res/deepdoc \
      /ragflow/ragflow_deps/huggingface.co/BAAI/bge-m3 \
      /ragflow/ragflow_deps/huggingface.co/BAAI/bge-large-en-v1.5 \
      /ragflow/ragflow_deps/huggingface.co/Qwen/Qwen3-Embedding-0.6B \
      /ragflow/ragflow_deps/huggingface.co/intfloat/e5-mistral-7b-instruct \
      /usr/share/infinity/resource

COPY --from=build /ragflow/bin/ragflow_server /ragflow/bin/ragflow_server
COPY --from=build /ragflow/rag/res/deepdoc/ /ragflow/rag/res/deepdoc/
COPY --from=build /ragflow/ragflow_deps/cl100k_base.tiktoken /ragflow/ragflow_deps/cl100k_base.tiktoken
COPY --from=build /ragflow/ragflow_deps/huggingface.co/ /ragflow/ragflow_deps/huggingface.co/
COPY --from=tokenizer-assets /resource/rag/ /usr/share/infinity/resource/rag/
COPY --from=tokenizer-assets /resource/opencc/ /usr/share/infinity/resource/opencc/
COPY --from=tokenizer-assets /resource/wordnet/ /usr/share/infinity/resource/wordnet/
COPY vendor/ragflow/conf/ /ragflow/conf/
COPY vendor/ragflow/VERSION /ragflow/VERSION
COPY vendor/ragflow/docker/service_conf.yaml.template /ragflow/conf/service_conf.yaml.template
COPY --chmod=755 vendor/ragflow/docker/entrypoint-go.sh /ragflow/entrypoint-go.sh
COPY vendor/ragflow/agent/templates/ /ragflow/agent/templates/
COPY vendor/ragflow/rag/prompts/ /ragflow/rag/prompts/
COPY vendor/ragflow/api/db/init_data/compilation_templates/ /ragflow/api/db/init_data/compilation_templates/

EXPOSE 9380 9381
HEALTHCHECK --interval=15s --timeout=5s --start-period=3m --retries=6 \
  CMD curl -fsS http://127.0.0.1:9380/api/v1/system/healthz >/dev/null || exit 1

ENTRYPOINT ["./entrypoint-go.sh", "--enable-adminserver", "--init-superuser"]

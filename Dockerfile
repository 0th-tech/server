FROM debian:trixie-slim AS prover

ARG BB_VERSION=3.0.0-nightly.20251104
ARG CIRCUIT_VERSION=v0.1.0

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

ENV HOME=/root

RUN curl -Ls https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/bbup/install | bash \
    && /root/.bb/bbup -v ${BB_VERSION} \
    && /root/.bb/bb --version

RUN mkdir /circuit \
    && for file in login.json vk; do \
        curl -fsSL https://github.com/0th-tech/circuit/releases/download/${CIRCUIT_VERSION}/$file -o /circuit/$file || exit 1; \
    done

FROM node:26.10.0-slim

ARG PNPM_VERSION=12.16.1
RUN npm install -g pnpm@${PNPM_VERSION}

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=prover /root/.bb/bb /usr/local/bin/bb
COPY --from=prover /circuit circuit/
ENV CIRCUIT_DIR=/app/circuit

COPY src/ src/

USER node

RUN bb write_vk -s ultra_honk --oracle_hash keccak -b circuit/login.json -o /tmp/vk \
    && cmp /tmp/vk/vk circuit/vk \
    && rm -r /tmp/vk

CMD ["node", "src/main.ts"]

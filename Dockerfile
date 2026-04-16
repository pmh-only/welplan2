# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm exec tsc -b --force && pnpm --filter @welplan2/webapp build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DB_PATH=/data/cache.db

WORKDIR /app

RUN mkdir -p /data && chown node:node /data

COPY --from=build --chown=node:node /app /app

WORKDIR /app/webapp

USER node

EXPOSE 3000
VOLUME ["/data"]

CMD ["node", "build/index.js"]

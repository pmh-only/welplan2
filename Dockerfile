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
RUN pnpm exec tsc -b --force \
  && pnpm exec tsc -p worker/tsconfig.json \
  && pnpm --filter @pmh-only/welplan2-webapp build

FROM node:22-bookworm-slim AS prod-deps

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY model/package.json model/package.json
COPY impl/welstory_plus/package.json impl/welstory_plus/package.json
COPY impl/planeat_choice/package.json impl/planeat_choice/package.json
COPY webapp/package.json webapp/package.json
COPY worker/package.json worker/package.json

RUN pnpm install --prod --frozen-lockfile

FROM node:22-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

WORKDIR /app

COPY --from=prod-deps --chown=node:node /app /app
COPY --from=build --chown=node:node /app/model/dist /app/model/dist
COPY --from=build --chown=node:node /app/impl/welstory_plus/dist /app/impl/welstory_plus/dist
COPY --from=build --chown=node:node /app/impl/planeat_choice/dist /app/impl/planeat_choice/dist
COPY --from=build --chown=node:node /app/webapp/build /app/webapp/build
COPY --from=build --chown=node:node /app/worker/dist /app/worker/dist

WORKDIR /app

COPY --chown=node:node docker/entrypoint.mjs /app/docker/entrypoint.mjs

USER node

EXPOSE 3000

ENTRYPOINT ["tini", "--"]
CMD ["node", "/app/docker/entrypoint.mjs"]

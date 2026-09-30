FROM node:22-alpine3.23 AS build

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.34.2 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY scripts/build-info.mjs scripts/build-info.mjs
COPY apps/web/package.json apps/web/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/storage/package.json packages/storage/package.json

RUN pnpm install \
  --frozen-lockfile \
  --package-import-method=copy \
  --filter @eotion/web...

COPY apps/web/index.html apps/web/index.html
COPY apps/web/public apps/web/public
COPY apps/web/tsconfig.json apps/web/tsconfig.json
COPY apps/web/vite.config.ts apps/web/vite.config.ts
COPY apps/web/scripts apps/web/scripts
COPY apps/web/src apps/web/src
COPY packages/domain/src packages/domain/src
COPY packages/domain/tsconfig.json packages/domain/tsconfig.json
COPY packages/contracts/src packages/contracts/src
COPY packages/contracts/tsconfig.json packages/contracts/tsconfig.json
COPY packages/sdk/src packages/sdk/src
COPY packages/sdk/tsconfig.json packages/sdk/tsconfig.json
COPY packages/storage/src packages/storage/src
COPY packages/storage/tsconfig.json packages/storage/tsconfig.json

ARG GIT_SHA=unknown
ARG VITE_ALLOW_PAGE_ZOOM=false
ENV GIT_SHA=${GIT_SHA}
ENV VITE_ALLOW_PAGE_ZOOM=${VITE_ALLOW_PAGE_ZOOM}

RUN pnpm --filter @eotion/web build

FROM nginx:1.27-alpine AS runtime

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

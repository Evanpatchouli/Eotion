FROM node:22-alpine3.23 AS build

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.34.2 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/site/package.json apps/site/package.json

RUN pnpm install \
  --frozen-lockfile \
  --package-import-method=copy \
  --filter @eotion/site...

COPY apps/site/.vitepress apps/site/.vitepress
COPY apps/site/data apps/site/data
COPY apps/site/public apps/site/public
COPY apps/site/*.md apps/site/
COPY apps/site/guide apps/site/guide
COPY apps/site/scripts apps/site/scripts
COPY apps/web/src/releaseInfo.ts apps/web/src/releaseInfo.ts

ARG EOTION_SITE_ORIGIN=
ARG EOTION_APP_ORIGIN=https://eotion.evanpatchouli.space
ARG EOTION_DOWNLOAD_WINDOWS_INSTALLER_URL=
ARG EOTION_DOWNLOAD_WINDOWS_PORTABLE_URL=
ARG EOTION_DOWNLOAD_WINDOWS_ZIP_URL=
ARG EOTION_DOWNLOAD_ANDROID_APK_URL=
ARG EOTION_DOWNLOAD_HARMONY_HAP_URL=

ENV EOTION_SITE_ORIGIN=${EOTION_SITE_ORIGIN} \
    EOTION_APP_ORIGIN=${EOTION_APP_ORIGIN} \
    EOTION_DOWNLOAD_WINDOWS_INSTALLER_URL=${EOTION_DOWNLOAD_WINDOWS_INSTALLER_URL} \
    EOTION_DOWNLOAD_WINDOWS_PORTABLE_URL=${EOTION_DOWNLOAD_WINDOWS_PORTABLE_URL} \
    EOTION_DOWNLOAD_WINDOWS_ZIP_URL=${EOTION_DOWNLOAD_WINDOWS_ZIP_URL} \
    EOTION_DOWNLOAD_ANDROID_APK_URL=${EOTION_DOWNLOAD_ANDROID_APK_URL} \
    EOTION_DOWNLOAD_HARMONY_HAP_URL=${EOTION_DOWNLOAD_HARMONY_HAP_URL}

RUN pnpm --filter @eotion/site build

FROM nginx:1.27-alpine AS runtime

COPY apps/site/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/site/.vitepress/dist /usr/share/nginx/html

EXPOSE 80

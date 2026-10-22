FROM node:22.21.1-bookworm-slim@sha256:25b3eb23a00590b7499f2a2ce939322727fcce1b15fdd69754fcd09536a3ae2c AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY . .
ARG SOURCE_REVISION
ARG RELEASE_SEQUENCE
ENV YINSEN_SOURCE_REVISION=$SOURCE_REVISION YINSEN_RELEASE_SEQUENCE=$RELEASE_SEQUENCE
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM dependencies AS tools
ARG SOURCE_REVISION
ARG RELEASE_SEQUENCE
COPY LICENSE ./LICENSE
COPY scripts ./scripts
COPY src ./src
COPY drizzle ./drizzle
RUN YINSEN_SOURCE_REVISION=$SOURCE_REVISION YINSEN_RELEASE_SEQUENCE=$RELEASE_SEQUENCE npx tsx scripts/build-metadata.ts
LABEL org.opencontainers.image.revision=$SOURCE_REVISION
CMD ["npm", "run", "db:status"]

FROM node:22.21.1-bookworm-slim@sha256:25b3eb23a00590b7499f2a2ce939322727fcce1b15fdd69754fcd09536a3ae2c AS runtime
ARG SOURCE_REVISION
LABEL org.opencontainers.image.revision=$SOURCE_REVISION
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --chown=node:node LICENSE ./LICENSE
RUN mkdir -p /app/data/uploads && chown -R node:node /app/data
USER node
EXPOSE 3000
CMD ["node", "server.js"]

FROM node:22-alpine AS build

WORKDIR /app

# Copy manifests first so dependency installation remains cacheable.
COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
RUN npm ci

COPY client ./client
COPY server ./server
RUN npm run build


FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build --chown=node:node /app/client/dist ./client/dist
COPY --from=build --chown=node:node /app/server/dist ./server/dist

USER node

# Railway supplies PORT at runtime. The local fallback is 3001.
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-3001}/health >/dev/null || exit 1

CMD ["node", "server/dist/index.js"]

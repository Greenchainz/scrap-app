# Build stage
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json ./
COPY server/package.json ./server/
COPY server/tsconfig.json ./server/
COPY server/src ./server/src
COPY drizzle ./drizzle
COPY tsconfig.json ./

RUN npm install --workspace=server
RUN npm run build --workspace=server

# Production stage
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY package.json ./
COPY server/package.json ./server/
RUN npm install --workspace=server --omit=dev

COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/drizzle ./drizzle

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "server/dist/index.js"]

# syntax=docker/dockerfile:1

# ---- base: shared image, deps not installed yet ----
FROM oven/bun:1-alpine AS base
WORKDIR /app
  
  # ---- install: cached dependency layer ----
FROM base AS install
COPY package.json pnpm-lock.yaml ./
RUN bun install

  # ---- dev: used by docker-compose for local testing (hot reload via bind mount) ----
FROM install AS dev
COPY . .
EXPOSE 3000
CMD ["bun", "--watch", "apps/gmail-listener/src/main.ts"]
  
  # ---- build: bundles to a single production JS file ----
FROM install AS build
COPY . .
RUN bun build src/index.ts --outdir dist --target bun --minify
  
  # ---- production: minimal runtime image for deployment ----
FROM base AS production
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/dist ./dist
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
CMD bun -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "run", "dist/index.js"]

# X-Ray — production image (Nuxt + Hono full-stack app on Bun).
#   docker build -f docker/Dockerfile -t x-ray .
# See docker/docker-compose.yml for a ready-to-use setup.

FROM oven/bun:1 AS build
WORKDIR /app

ENV NUXT_TELEMETRY_DISABLED=1

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

COPY . .
RUN bunx --bun nuxt prepare && bun run build


FROM oven/bun:1-slim
WORKDIR /app

ENV NODE_ENV=production \
	PORT=12418 \
	XRAY_DB_PATH=/data/db.sqlite \
	XRAY_DB_AUTO_MIGRATE=true \
	XRAY_CONFIG_BASE_DIR=/data/config \
	XRAY_LOG_DIR=/data/logs

COPY --from=build /app/.output ./.output
# Applied on start by DB.init (XRAY_DB_AUTO_MIGRATE).
COPY --from=build /app/drizzle/migrations ./drizzle/migrations

VOLUME /data
EXPOSE 12418

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
	CMD bun -e "fetch('http://127.0.0.1:12418/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["bun", "run", ".output/server/index.mjs"]

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
WORKDIR /opt/x-ray-search/search
	
ENV NODE_ENV=production \
	PORT=12418 \
	XRAY_DB_PATH=/opt/x-ray-search/search/data/db.sqlite \
	XRAY_DB_AUTO_MIGRATE=true \
	XRAY_CONFIG_BASE_DIR=/opt/x-ray-search/search/config \
	XRAY_LOG_DIR=/opt/x-ray-search/search/data/logs

COPY --from=build /app/.output ./app/.output
# Applied on start by DB.init (XRAY_DB_AUTO_MIGRATE).
COPY --from=build /app/drizzle/migrations ./app/drizzle/migrations

VOLUME /opt/x-ray-search/search/data
VOLUME /opt/x-ray-search/search/config
EXPOSE 12418

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
	CMD curl -f http://localhost:12418/health || exit 1

CMD ["bun", "run", "./app/.output/server/index.mjs"]

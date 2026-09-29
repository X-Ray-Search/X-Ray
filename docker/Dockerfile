FROM oven/bun:1-slim

WORKDIR /opt/x-ray-search/search

COPY .output ./app/.output
COPY drizzle/migrations ./app/drizzle/migrations

EXPOSE 12418/tcp

ENV NITRO_ENV=production
ENV NITRO_HOST=::
ENV NITRO_PORT=12418

ENV XRAY_DB_PATH=/opt/x-ray-search/search/data/db.sqlite
ENV XRAY_DB_AUTO_MIGRATE=true
ENV XRAY_DB_MIGRATION_DIR=/opt/x-ray-search/search/app/drizzle/migrations

ENV XRAY_CONFIG_BASE_DIR=/opt/x-ray-search/search/config
ENV XRAY_LOG_DIR=/opt/x-ray-search/search/data/logs

VOLUME /opt/x-ray-search/search/data
VOLUME /opt/x-ray-search/search/config

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
	CMD curl -f http://localhost:12418/health || exit 1

CMD ["bun", "run", "/opt/x-ray-search/search/app/.output/server/index.mjs"]

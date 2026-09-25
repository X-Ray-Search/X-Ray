/**
 * Compiled-binary entrypoint — `bun run scripts/entrypoint.ts` (and the binary's
 * ENTRYPOINT). Enables DB auto-migration on cold start, then imports the real startup
 * in `src/index.ts`. See docs/14-deployment.md.
 */
process.env.APPPREFIX_DB_AUTO_MIGRATE = "true";

await import("../.output/server/index.mjs");

export {};

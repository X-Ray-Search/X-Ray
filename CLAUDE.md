# CLAUDE.md — Claude Code specifics

Read `AGENTS.md` first. This file adds Claude-Code-specific notes.

## Slash commands

Defined in `.claude/settings.json`:

- `/api-client` — regenerate the typed API client (boots the API in-process, then patches).
- `/db` — generate Drizzle migrations from `server/lib/db/schema.ts`.
- `/verify` — typecheck + tests.
- `/typecheck` — `bun run typecheck` (`nuxt typecheck` + `tsc`, includes `server/`).
- `/test` — `bun test`.
- `/dev` — start/inspect the dev setup (port 12418).

## MCP servers

`mcpServers` in `.claude/settings.json` and `.vscode/mcp.json` both register `nuxt` and `nuxt-ui`.

## Backend in `server/`

Hono lives in `server/lib/api`, mounted at `/api` by `server/routes/api/[...].ts`, initialized by
`server/plugins/startup.ts` (DB → engines → proxies → bangs → cron → API). The search domain lives
next to it in `server/lib/{search,proxy,bangs,instant-answers,ai,settings}`. After changing a route
or schema, run `bun run api-client:generate`.

## Verifying changes

- `bun test` covers the API, engine parsers (fixtures), proxies (local SOCKS/HTTP/gateway servers),
  the SearXNG API and admin routes — all offline.
- `bun scripts/engine-smoke-test.ts` hits the real engines. DuckDuckGo blocks an IP for minutes
  after a few rapid requests — don't loop it.
- `bun run typecheck` skips `<template>` code under Bun. For UI changes, check the real app:
  `bun run build && bun run .output/server/index.mjs` (the dev worker is unreliable on Windows
  under Bun), then load the pages.

## Frontend conventions

- Reference components by their Nuxt auto-import names. Nuxt drops repeated path segments:
  `components/search/instant/InstantAnswer.vue` is `SearchInstantAnswer`, `search/SearchBox.vue`
  is `SearchBox`.
- Don't add explicit imports that only the `<template>` uses (Biome reports them as unused).
- In `.vue` files, Biome *warnings* about unused variables/imports are expected; *errors* are not.
- Per-user stores live in `app/composables/stores/`; `useSession()` resets them on sign-in/out.

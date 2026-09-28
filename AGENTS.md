# AGENTS.md — operating manual for AI coding agents

X-Ray is a LeiCraft_MC **full-stack Nuxt app** (Nuxt 4 frontend + Hono backend in `server/`), a
self-hostable meta search engine. Follow the LeiCraft_MC Style Guides:
https://git.leicraftmc.de/LeiCraftMC/Style-Guides (branch `feat/add-static-site-with-docs-template`).

## Must read

- [docs/01-project-structure.md](https://github.com/LeiCraftMC/Style-Guides/blob/main/docs/01-project-structure.md) — the full-stack Nuxt shape
- [docs/04-backend-hono.md](https://github.com/LeiCraftMC/Style-Guides/blob/main/docs/04-backend-hono.md) — incl. "Compatibility-proxy backend"
- [docs/05-api-contract.md](https://github.com/LeiCraftMC/Style-Guides/blob/main/docs/05-api-contract.md)
- [docs/06-frontend-nuxt.md](https://github.com/LeiCraftMC/Style-Guides/blob/main/docs/06-frontend-nuxt.md) / [07-state-and-data.md](https://github.com/LeiCraftMC/Style-Guides/blob/main/docs/07-state-and-data.md)

## Project values

- Env prefix `XRAY_`, token prefix `xray_` (`xray_sess_…`, `xray_apikey_…`), cookie
  `xray_session_token`, port **12418**.
- Primary color: custom `xray` cyan palette (`app/assets/css/main.css`), neutral `slate`,
  near-black `.main-bg-color`. Dark-only.

## Non-negotiable (from the guide)

- `{ success, code, message, data }` envelope via `APIResponse.*` for every `/api/v1` route;
  validate with `hono-openapi`'s validator; routes in `server/lib/api/versions/v1/routes/<resource>/{index.ts, model.ts}`.
- Never hand-edit `app/api-client/*.gen.ts`; run `bun run api-client:generate` (it also runs
  `scripts/patch-api-client.ts`, the sanctioned automated patch).
- Frontend API access through `useAPI` / `useAPIAsyncData`; global state through `AbstractStore`.
- Biome (`bun run check:ci`), `bun run typecheck`, `bun test` before finishing. Conventional Commits.

## Documented exceptions (keep them, don't "fix" them)

- **SearXNG compatible API** (`server/lib/api/searxng/`, mounted at `/api/searxng`) is a
  compatibility-proxy surface: SearXNG-native responses, manual validation, API-key auth
  (`Bearer`, `X-API-Key` or `?api_key=`).
- **`POST /api/v1/search/ai`** and **`POST /api/v1/ai/chats/{chatID}/messages`** stream Server-Sent
  Events; `app/composables/useEventStream.ts` (used by `useAIAnswer` / `useAIChat`) uses raw
  `fetch` because the SDK cannot consume the stream.
- **`/api/v1/proxy/{image,favicon}`** return image bytes (consumed by `<img>`), and
  **`/api/v1/search/suggest/opensearch`** returns OpenSearch JSON and accepts the session cookie.
- **`app/composables/updateAPIClient.ts`** uses a relative base URL and a custom server-side fetch.
  Do not switch SSR calls to `useRequestFetch()` (drops the SDK's `Headers`, i.e. the bearer token),
  and keep stripping the SDK's `url`/`path` options (Nitro's in-process fetch would use them as the
  request URL and recurse into the renderer).
- **`server/runtime/bun-entry.ts`** replaces Nitro's bun entry in production builds to pass the
  client address through; keep it in sync with `nitropack/dist/presets/bun/runtime/bun.mjs`.
- **Stores:** on the server, Nuxt composables (`useState`, `useCookie`, `useAPI`) only work before
  the first `await` of a store's `fetchData`. Start everything synchronously (see
  `useSearchPreferencesStore`).

## Extension points

- Search engines: `server/lib/search/engines/` → register in `engines/index.ts`.
- Proxy types: `server/lib/proxy/transports/` → register in `transports/index.ts`.
- Instant answers: `server/lib/instant-answers/providers/` → register in `instant-answers/index.ts`;
  widgets in `app/components/search/instant/`.

Each class declares a Zod settings schema; the admin UI renders forms from it
(`app/components/dashboard/SchemaForm.vue`). Add parser tests with fixtures (`tests/engines.test.ts`)
— never rely on live requests in `bun test`; use `scripts/engine-smoke-test.ts` for that.

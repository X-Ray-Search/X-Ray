# AGENTS.md — operating manual for AI coding agents

You are working in a LeiCraftMC full-stack Nuxt app (Nuxt frontend + Hono backend in `server/`).
Follow the LeiCraftMC Style Guides: https://github.com/LeiCraftMC/Style-Guides.

## Must read

- [docs/00-overview.md](https://github.com/LeiCraftMC/Style-Guides/blob/main/docs/00-overview.md)
- [docs/01-project-structure.md](https://github.com/LeiCraftMC/Style-Guides/blob/main/docs/01-project-structure.md) — the full-stack Nuxt shape
- [docs/04-backend-hono.md](https://github.com/LeiCraftMC/Style-Guides/blob/main/docs/04-backend-hono.md) — Mounting Hono in Nitro
- [docs/05-api-contract.md](https://github.com/LeiCraftMC/Style-Guides/blob/main/docs/05-api-contract.md)
- [docs/06-frontend-nuxt.md](https://github.com/LeiCraftMC/Style-Guides/blob/main/docs/06-frontend-nuxt.md)
- [docs/07-state-and-data.md](https://github.com/LeiCraftMC/Style-Guides/blob/main/docs/07-state-and-data.md)

## Non-negotiable

- Nuxt 4 `app/` srcDir; Tailwind v4 CSS-first; no `tailwind.config.js`. Dark-only (no toggle).
- The Hono backend lives in `server/` and owns `/api` — no `Bun.serve`, no `Main.main()`; init in
  `server/plugins/startup.ts`.
- Every API response uses the `{ success, code, message, data }` envelope via `APIResponse.*`
  (errors omit `data`).
- Validate with `zValidator` from `hono-openapi`; routes in `server/lib/api/versions/v<n>/routes/<resource>/{index.ts, model.ts}`.
- Auth uses opaque bearer tokens (`<prefix>_<kind>_<id>:<base>`, `Bun.password`-hashed) — not JWT.
  See docs/10-auth.md.
- Frontend API access only through `useAPI`; global state via `AbstractStore` over `useState`;
  component-local form/UI state with `reactive()`/`ref()` is fine.
- Lucide icons only (`i-lucide-*`). Never hand-edit `*.gen.ts` under `app/api-client/` (an
  automated `scripts/patch-api-client.ts` is the only exception).
- `nitro.rollupConfig.external: ["bun:sqlite"]` in `nuxt.config.ts`. WebSocket routes
  (`server/routes/ws/`) require `nitro.experimental.websocket = true` (Bun preset).
- Format with Biome before finishing. Conventional Commits.

Replace `<ProjectName>` and the `FNA_` env prefix with the real project values.
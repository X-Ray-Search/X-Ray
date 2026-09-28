# X-Ray

A self-hostable, modern and extensible **meta search engine**. X-Ray asks several search engines at
once, merges and ranks their results, and answers many questions directly — without ads, trackers
or profiling.

- **Many engines, one result list** — DuckDuckGo, Bing, Brave, Google (Programmable Search),
  Startpage, Yahoo, Wikipedia, Mojeek, Ecosia, Hacker News, Reddit, Lemmy, Openverse, Wikimedia
  Commons, YouTube, Dailymotion, PeerTube, The Guardian, the Brave Search API, other SearXNG/X-Ray
  instances … for web, images, news and videos. Results found by several engines rank higher.
- **Gentle on the engines** — every engine's answers are cached (also on disk), identical
  requests share one upstream call, per-engine rate limits and fallback engines keep searches
  working while an engine is blocked, and blocked engines back off automatically.
- **Bangs** — the ~13,000 DuckDuckGo bangs (`!w black holes`, `!gh nuxt`) plus instance-wide and
  personal custom bangs, with live feedback in the search box. Bangs resolve on the server, so they
  work straight from the browser address bar.
- **Instant answers** — calculator, unit & currency conversion, time zones, weather, timers,
  definitions, a Wikipedia panel, UUID/password/hash/colour/Base64 tools and more.
- **Optional AI answers** — from any OpenAI compatible endpoint (OpenAI, OpenRouter, Ollama,
  LM Studio, vLLM, …), grounded in the top results and citing them. Follow-up questions switch
  to AI mode, a chat whose history is stored per user. AI is for signed-in users only.
- **Outbound proxies** — route engines (or everything) through HTTP(S) proxies, SOCKS5 (Tor, VPN
  containers, `ssh -D`) or the [X-Ray HTTP proxy gateway](https://git.leicraftmc.de/X-Ray-Search/Simple-HTTP-Proxy-Gateway),
  with rotation and fail-over.
- **Private or public** — only signed-in users can search by default (signed-out visitors go
  straight to the login page); switch to public with a per-IP rate limit.
- **SearXNG compatible API** (with API keys) — use X-Ray as the web search backend of Open WebUI,
  Perplexica, LibreChat or any SearXNG client.
- **Instance defaults, personal overrides** — admins set defaults for everything search related
  (language, safe search, bangs, AI mode, engines, …); every user can override each setting.

Built on the [LeiCraft_MC style guide](https://git.leicraftmc.de/LeiCraftMC/Style-Guides)
full-stack template: Nuxt 4 + NuxtUI v4, Hono + Zod + OpenAPI in `server/`, Drizzle + SQLite, Bun.

## Quick start

### Docker

```bash
docker compose -f docker/docker-compose.yml up -d --build
docker compose -f docker/docker-compose.yml logs x-ray | grep reset-password
```

Open the printed link to set the password of the `admin` user, then sign in at
`http://localhost:12418`. Data lives in the `x-ray-data` volume (`/data`).

### From source

Requires [Bun](https://bun.sh) ≥ 1.3.

```bash
bun install
cp example.env .env
bun run build
bun run start              # http://localhost:12418
```

On first start X-Ray creates the `admin` user and prints a password-reset link (also written to
`./config/initial_admin_password_reset_token.txt`). It seeds the engines that need no
configuration and downloads the DuckDuckGo bang dataset in the background.

Put a TLS-terminating reverse proxy (Caddy, nginx, Traefik) in front for anything beyond a LAN and
set `XRAY_TRUST_PROXY=true` so rate limits see the real client IP.

## Configuration

Deployment settings are environment variables (see [`example.env`](example.env)):

| Variable | Default | |
| --- | --- | --- |
| `XRAY_APP_URL` | — (required) | Public URL, used in password-reset links |
| `XRAY_DB_PATH` | `./data/db.sqlite` | SQLite database |
| `XRAY_DB_AUTO_MIGRATE` | `true` | Apply migrations on start |
| `XRAY_DB_MIGRATION_DIR` | `./drizzle/migrations` | Drizzle Migration Directory (only important at runtime) |
| `XRAY_CONFIG_BASE_DIR` | `./config` | Runtime files (initial admin reset link) |
| `XRAY_LOG_DIR` / `XRAY_LOG_LEVEL` | `./data/logs` / `info` | |
| `XRAY_TRUST_PROXY` | `false` | Use `X-Forwarded-For` / `X-Real-IP` from a reverse proxy |
| `XRAY_BANGS_DISABLE_AUTO_FETCH` | `false` | Never download the DuckDuckGo bang dataset |
| `XRAY_API_DISABLE_DOCS` | `false` | Hide the API docs |
| `XRAY_SMTP_*` | — | Optional, for password-reset emails |
| `PORT` | `12418` | HTTP port |

Everything else is configured in the dashboard (**Administration**):

- **Engines** — add, configure, weight, time out, test and route engines through proxies. Every
  engine type brings its own settings form.
- **Proxies** — HTTP(S), SOCKS5 and X-Ray gateway proxies, with a live test that shows the exit IP.
- **Settings › Instance** — who may search (signed-in users / anyone), anonymous rate limit,
  SearXNG API, default proxies, bang dataset updates.
- **Settings › Search defaults** — the defaults every user starts with.
- **Settings › AI** — endpoint URL, key (write-only), model (with model listing), prompt, limits.
- **Instance bangs** and **Users**.

Users change their own **Preferences** (each setting shows whether it follows the instance
default), **My bangs** and **API keys** in the dashboard.

### Caching, rate limits and fallbacks

X-Ray tries hard not to ask the engines more often than necessary — scrapers get IP-banned for
bursts, and a banned engine is worse than a slightly older result.

- **Per-engine cache** — every engine's answer to a query is cached on its own (60 min, news
  10 min), so users with different engine selections share entries and one failing engine doesn't
  invalidate the others. The cache lives in memory and in `search-cache.sqlite` next to the
  database, so it survives restarts; changing an engine's settings gives it new cache keys.
- **Stale fallback** — expired results stay available for 24 h and are served (marked with a
  dashed badge) while their engine is blocked, suspended, rate limited, failing or suddenly
  answering with nothing.
- **Request coalescing** — identical requests that are already running (two users, or the page
  and its AI answer) share one upstream request; failures are remembered for a minute.
- **Rate limits per engine** — at most _n_ requests per minute (scrapers that ban quickly get a
  suggested limit). An engine out of budget is skipped instead of risking a ban.
- **Fallback engines** — mark engines as fallbacks and they are only queried when fewer than
  _n_ regular engines (default 2) deliver results. Engines known to be unavailable are counted up
  front, so their fallbacks start right away.
- **Backoff** — engines that get blocked (captcha, 403, 429) are suspended with exponential
  backoff, at least as long as the engine's `Retry-After` asks for.

All of it is tunable under **Settings › Instance › Search cache & fallbacks** (which also shows
hit rates) and per engine under **Engines**.

## Using X-Ray

### Bangs

A bang anywhere in the query redirects to another site: `!w linux` or `linux !w`. Lookup order:
personal bangs → instance bangs → built-in category bangs → DuckDuckGo bangs.

| Bang | Does |
| --- | --- |
| `!i`, `!img` · `!n`, `!news` · `!v`, `!videos` | Search X-Ray images / news / videos |
| `! query` | Feeling lucky — open the first result |
| `!w`, `!gh`, `!yt`, … | Any of the DuckDuckGo bangs |

### Browser integration

X-Ray publishes an [OpenSearch description](https://developer.mozilla.org/docs/Web/OpenSearch) at
`/opensearch.xml`, so browsers offer to add it as a search engine, including address-bar
suggestions. Search URL: `https://your-instance/search?q=%s`.

### APIs

- **X-Ray API** — `/api/v1/**`, documented at `/api/docs/v1` (OpenAPI at `/api/docs/v1/openapi`).
  Authenticate with `Authorization: Bearer <session token or API key>`.
- **SearXNG compatible API** — `/api/searxng/search?q=…&format=json|csv|rss` (GET or POST), plus
  `/api/searxng/autocompleter` and `/api/searxng/config`. Pass an API key as
  `Authorization: Bearer <key>`, `X-API-Key: <key>`, or `?api_key=<key>` for clients that only
  accept a URL. Keyless access is possible only on public instances with "Require an API key" off.

```bash
curl -H "Authorization: Bearer xray_apikey_…" \
  "https://your-instance/api/searxng/search?q=privacy&format=json"
```

## Extending

The three extension points are small classes registered in one place each. Their settings are Zod
schemas, and the admin UI renders a form for them automatically.

**Search engine** — subclass `SearchEngine` and register it in
[`server/lib/search/engines/index.ts`](server/lib/search/engines/index.ts):

```ts
const Settings = z.object({ api_key: z.string().min(1) });

export class MyEngine extends SearchEngine<z.infer<typeof Settings>> {
	static readonly definition = SearchEngine.define({
		type: "my_engine",
		name: "My Engine",
		description: "Results from my-engine.example",
		website: "https://my-engine.example",
		categories: ["general"],
		settings: Settings,
		secretFields: ["api_key"],
		features: { paging: true, timeRange: false, safeSearch: false, language: true },
		requiresConfiguration: true,
	});

	async search(query: SearchTypes.EngineQuery): Promise<SearchTypes.EngineResponse> {
		const data = await this.http.json<any>(`https://my-engine.example/api?q=${encodeURIComponent(query.query)}&page=${query.page}`, {
			headers: { Authorization: `Bearer ${this.settings.api_key}` },
		});
		return { results: data.items.map((item: any) => ({ url: item.link, title: item.title, content: item.snippet })) };
	}
}
```

`this.http` already applies the engine's timeout and proxies, sets browser-like headers and maps
403/429 to `EngineError("blocked")`, which suspends the engine with backoff.

**Proxy type** — subclass `ProxyTransport` (`fetch(url, request)`) and register it in
[`server/lib/proxy/transports/index.ts`](server/lib/proxy/transports/index.ts).

**Instant answer** — subclass `InstantAnswerProvider` (`answer(query, ctx)` returns an answer or
`null`) and register it in [`server/lib/instant-answers/index.ts`](server/lib/instant-answers/index.ts).
Answers with an unknown `type` fall back to a text card; add a widget in
`app/components/search/instant/` for a custom UI.

## Development

```bash
bun run dev                    # http://localhost:12418 (frontend + API)
bun test                       # backend, engine parser, proxy, SearXNG and admin tests
bun run typecheck              # nuxt typecheck + tsc for server/ and tests/
bun run check:ci               # Biome
bun run api-client:generate    # regenerate app/api-client after changing a route
bun run db:generate            # new migration after changing server/lib/db/schema.ts
bun scripts/engine-smoke-test.ts [query] [engine…]   # hit the real engines
```

Layout (full-stack shape of the style guide):

```
server/
  lib/api/            Hono app: versions/v1/routes/** (REST), searxng/ (compat API), utils/
  lib/search/         engines/, aggregator (fallbacks), service (pipeline), runCache, throttle,
                      health, autocomplete
  lib/proxy/          ProxyManager, transports/, socks/ (SOCKS5 client + local CONNECT bridge)
  lib/bangs/          bang index, DuckDuckGo dataset, custom bangs
  lib/instant-answers/  providers/, math/ (safe expression parser, units)
  lib/ai/             OpenAI compatible client (streaming), stored AI chats
  lib/settings/       instance settings, search defaults + user overrides, AI config
  runtime/bun-entry.ts  production server entry (passes the client IP to Nitro)
app/                  Nuxt 4 frontend (search UI, dashboard, admin)
tests/                bun:test suites
```

Known quirks:

- `@unhead/vue` 3.4.1 ships a broken `.d.ts`; `package.json` pins 3.4.0 via `overrides`.
- `bun run typecheck` does not type-check `<template>` code in `.vue` files under Bun.
- On Windows the Nuxt CLI dev worker is flaky under Bun; if `bun run dev` misbehaves, verify with a
  production build.
- Scrapers break when engines change their markup — `scripts/engine-smoke-test.ts` shows which.
  DuckDuckGo rate-limits aggressively per IP; give it a proxy if you rely on it.

## License

[AGPL-3.0](LICENSE)

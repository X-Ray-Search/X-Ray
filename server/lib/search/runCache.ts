import { Database } from "bun:sqlite";
import { createHash } from "crypto";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import { ConfigHandler } from "../utils/config";
import { Logger } from "../utils/logger";
import { InFlight, TTLCache } from "./cache";
import type { SearchEngine } from "./engines/base";
import type { EngineError } from "./errors";
import type { SearchTypes } from "./types";

/**
 * Cache of individual engine runs — one entry per engine × query, not per result page (the
 * approach degoog takes). Users with different engine selections share entries, a failing
 * engine doesn't invalidate the others, and a changed engine config gets new keys.
 *
 * Entries are fresh for the configured TTL and then stay *stale* for a while: the aggregator
 * serves stale results when the engine is suspended, out of rate limit budget or failing, so a
 * blocked scraper degrades to slightly older results instead of none. Failures and empty
 * answers are remembered briefly (they never overwrite a good entry), and identical requests
 * that are already running are joined instead of repeated.
 *
 * Two tiers: an in-memory LRU and, when enabled, a SQLite file next to the database that
 * survives restarts. It's a separate file on purpose — it's disposable and write-heavy, so it
 * shouldn't bloat the main database or its backups.
 */
export class EngineRunCache {
	static readonly MEMORY_ENTRIES = 3000;
	static readonly DISK_ENTRIES = 25_000;
	/** How long failures and empty answers are remembered. */
	static readonly SHORT_TTL_MS = 60_000;
	static readonly FILE_NAME = "search-cache.sqlite";

	private static readonly memory = new TTLCache<EngineRunCache.Entry>(
		EngineRunCache.MEMORY_ENTRIES,
		0,
	);
	private static readonly shortLived = new TTLCache<EngineRunCache.ShortLived>(
		2000,
		EngineRunCache.SHORT_TTL_MS,
	);
	private static readonly inflight = new InFlight<unknown>();
	private static disk: EngineRunCache.DiskStore | null = null;
	private static diskPath: string | null = null;

	private static readonly counters = { hits: 0, misses: 0, stale_served: 0, coalesced: 0 };
	private static countersSince = Date.now();

	/** Stable key of an engine instance (type + settings) answering a query. */
	static key(engine: SearchEngine, query: SearchTypes.EngineQuery): string {
		return createHash("sha256")
			.update(
				JSON.stringify([
					engine.config.slug,
					engine.cacheFingerprint,
					query.query.trim().replace(/\s+/g, " ").toLowerCase(),
					query.category,
					query.page,
					query.language,
					query.safesearch,
					query.timeRange,
				]),
			)
			.digest("hex");
	}

	/** Open or close the disk tier. Cheap to call on every search. */
	static configure(options: { persistent: boolean; path?: string }) {
		const path = options.persistent ? (options.path ?? this.defaultPath()) : null;
		if (path === this.diskPath) return;
		this.disk?.close();
		this.disk = null;
		this.diskPath = path;
		if (!path) return;
		try {
			this.disk = new EngineRunCache.DiskStore(path);
		} catch (err) {
			Logger.warn(`Search cache file '${path}' could not be opened, caching in memory only:`, err);
		}
	}

	private static defaultPath() {
		return join(dirname(ConfigHandler.getConfig()?.DB_PATH ?? "./data/db.sqlite"), this.FILE_NAME);
	}

	static lookup(key: string, now = Date.now()): EngineRunCache.Lookup {
		let entry = this.memory.get(key);
		if (!entry && this.disk) {
			entry = this.disk.get(key, now) ?? undefined;
			if (entry) this.memory.set(key, entry, entry.staleUntil - now);
		}
		const fresh = entry && entry.freshUntil > now ? entry : null;
		const recent = fresh ? undefined : this.shortLived.get(key);
		return {
			fresh,
			stale: !fresh && entry && entry.staleUntil > now ? entry : null,
			recent: recent ?? null,
		};
	}

	/**
	 * Store a successful run. Empty answers are only remembered briefly and never replace a
	 * cached result — an empty page is often a soft block.
	 */
	static store(
		key: string,
		engine: string,
		response: SearchTypes.EngineResponse,
		policy: EngineRunCache.Policy,
		now = Date.now(),
	) {
		if (response.cacheable === false || policy.freshMs <= 0) return;
		if (!response.results.length) {
			this.shortLived.set(key, { engine, error: null, response });
			return;
		}
		const entry: EngineRunCache.Entry = {
			engine,
			response,
			storedAt: now,
			freshUntil: now + policy.freshMs,
			staleUntil: now + policy.freshMs + policy.staleMs,
		};
		this.shortLived.delete(key);
		this.memory.set(key, entry, policy.freshMs + policy.staleMs);
		this.disk?.put(key, entry);
	}

	static storeFailure(key: string, engine: string, error: EngineError) {
		this.shortLived.set(key, { engine, error: { kind: error.kind, message: error.message } });
	}

	/** Run `task` unless the same key is already running; then share its result. */
	static async coalesce<T>(key: string, task: () => Promise<T>): Promise<T> {
		const { value, joined } = await this.inflight.run(key, task);
		if (joined) this.counters.coalesced++;
		return value as T;
	}

	/** Count a lookup of an engine that actually ran (reserves are looked up just to plan). */
	static countLookup(hit: boolean) {
		if (hit) this.counters.hits++;
		else this.counters.misses++;
	}

	static countStaleServed() {
		this.counters.stale_served++;
	}

	/** Forget everything cached for one engine (after its config changed or it was deleted). */
	static invalidateEngine(slug: string) {
		this.memory.deleteWhere((entry) => entry.engine === slug);
		this.shortLived.deleteWhere((entry) => entry.engine === slug);
		this.disk?.deleteEngine(slug);
	}

	static clear() {
		this.memory.clear();
		this.shortLived.clear();
		this.disk?.clear();
	}

	/** Only the in-memory tier (tests use it to check the disk tier). */
	static clearMemory() {
		this.memory.clear();
		this.shortLived.clear();
	}

	static prune(now = Date.now()) {
		this.memory.prune();
		this.shortLived.prune();
		this.disk?.prune(now, this.DISK_ENTRIES);
	}

	static stats(): EngineRunCache.Stats {
		return {
			persistent: this.disk !== null,
			memory_entries: this.memory.size,
			disk_entries: this.disk?.count() ?? 0,
			disk_bytes: this.disk?.sizeBytes() ?? 0,
			in_flight: this.inflight.size,
			...this.counters,
			since: this.countersSince,
		};
	}

	static resetStats() {
		for (const key of Object.keys(this.counters) as (keyof typeof this.counters)[]) {
			this.counters[key] = 0;
		}
		this.countersSince = Date.now();
	}

	static close() {
		this.disk?.close();
		this.disk = null;
		this.diskPath = null;
	}
}

export namespace EngineRunCache {
	export interface Policy {
		/** How long an entry is served as-is. 0 disables caching. */
		freshMs: number;
		/** How long after that it may still be served while the engine is unavailable. */
		staleMs: number;
	}

	export interface Entry {
		/** Engine slug (for invalidation). */
		engine: string;
		response: SearchTypes.EngineResponse;
		storedAt: number;
		freshUntil: number;
		staleUntil: number;
	}

	/** A recent failure (`error`) or empty answer (`response`), remembered for a minute. */
	export interface ShortLived {
		engine: string;
		error: { kind: EngineError.Kind; message: string } | null;
		response?: SearchTypes.EngineResponse;
	}

	export interface Lookup {
		fresh: Entry | null;
		stale: Entry | null;
		recent: ShortLived | null;
	}

	export interface Stats {
		persistent: boolean;
		memory_entries: number;
		disk_entries: number;
		disk_bytes: number;
		in_flight: number;
		hits: number;
		misses: number;
		stale_served: number;
		coalesced: number;
		since: number;
	}

	/** The SQLite tier. Writes are batched into one transaction per tick. */
	export class DiskStore {
		private readonly db: Database;
		private readonly pending = new Map<string, Entry>();
		private flushTimer: ReturnType<typeof setTimeout> | null = null;

		constructor(readonly path: string) {
			mkdirSync(dirname(path), { recursive: true });
			this.db = new Database(path, { create: true });
			// auto_vacuum only takes effect before the first table is created.
			this.db.exec("PRAGMA auto_vacuum = INCREMENTAL");
			this.db.exec("PRAGMA journal_mode = WAL");
			this.db.exec("PRAGMA synchronous = NORMAL");
			this.db.exec(`CREATE TABLE IF NOT EXISTS engine_runs (
				key TEXT PRIMARY KEY,
				engine TEXT NOT NULL,
				response TEXT NOT NULL,
				stored_at INTEGER NOT NULL,
				fresh_until INTEGER NOT NULL,
				stale_until INTEGER NOT NULL
			)`);
			this.db.exec("CREATE INDEX IF NOT EXISTS engine_runs_stale_until ON engine_runs (stale_until)");
			this.db.exec("CREATE INDEX IF NOT EXISTS engine_runs_engine ON engine_runs (engine)");
		}

		get(key: string, now: number): Entry | null {
			const pending = this.pending.get(key);
			if (pending) return pending;
			const row = this.db
				.query<
					{
						engine: string;
						response: string;
						stored_at: number;
						fresh_until: number;
						stale_until: number;
					},
					[string, number]
				>(
					"SELECT engine, response, stored_at, fresh_until, stale_until FROM engine_runs WHERE key = ? AND stale_until > ?",
				)
				.get(key, now);
			if (!row) return null;
			try {
				return {
					engine: row.engine,
					response: JSON.parse(row.response),
					storedAt: row.stored_at,
					freshUntil: row.fresh_until,
					staleUntil: row.stale_until,
				};
			} catch {
				return null;
			}
		}

		put(key: string, entry: Entry) {
			this.pending.set(key, entry);
			this.flushTimer ??= setTimeout(() => this.flush(), 0);
		}

		flush() {
			if (this.flushTimer) clearTimeout(this.flushTimer);
			this.flushTimer = null;
			if (!this.pending.size) return;
			const entries = [...this.pending];
			this.pending.clear();
			const insert = this.db.query(
				"INSERT OR REPLACE INTO engine_runs (key, engine, response, stored_at, fresh_until, stale_until) VALUES (?, ?, ?, ?, ?, ?)",
			);
			try {
				this.db.transaction(() => {
					for (const [key, entry] of entries) {
						insert.run(
							key,
							entry.engine,
							JSON.stringify(entry.response),
							entry.storedAt,
							entry.freshUntil,
							entry.staleUntil,
						);
					}
				})();
			} catch (err) {
				Logger.warn("Writing to the search cache file failed:", (err as Error).message);
			}
		}

		deleteEngine(slug: string) {
			for (const [key, entry] of this.pending) if (entry.engine === slug) this.pending.delete(key);
			this.db.query("DELETE FROM engine_runs WHERE engine = ?").run(slug);
		}

		clear() {
			this.pending.clear();
			this.db.exec("DELETE FROM engine_runs");
			this.db.exec("PRAGMA incremental_vacuum");
		}

		/** Drop expired rows, then the oldest ones beyond `maxEntries`. */
		prune(now: number, maxEntries: number) {
			this.flush();
			this.db.query("DELETE FROM engine_runs WHERE stale_until <= ?").run(now);
			const excess = this.count() - maxEntries;
			if (excess > 0) {
				this.db
					.query(
						"DELETE FROM engine_runs WHERE key IN (SELECT key FROM engine_runs ORDER BY stored_at LIMIT ?)",
					)
					.run(excess);
			}
			this.db.exec("PRAGMA incremental_vacuum");
		}

		count() {
			return this.db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM engine_runs").get()?.n ?? 0;
		}

		sizeBytes() {
			const pages = this.db.query<{ page_count: number }, []>("PRAGMA page_count").get();
			const size = this.db.query<{ page_size: number }, []>("PRAGMA page_size").get();
			return (pages?.page_count ?? 0) * (size?.page_size ?? 0);
		}

		close() {
			this.flush();
			this.db.close();
		}
	}
}

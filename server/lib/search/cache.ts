/** Tiny TTL + LRU cache (Map insertion order = recency). Single-process, in-memory. */
export class TTLCache<V> {
	private readonly entries = new Map<string, { value: V; expires: number }>();

	constructor(
		private readonly maxEntries: number,
		private ttlMs: number,
	) {}

	setTTL(ttlMs: number) {
		this.ttlMs = ttlMs;
	}

	get(key: string): V | undefined {
		const entry = this.entries.get(key);
		if (!entry) return undefined;
		if (entry.expires < Date.now()) {
			this.entries.delete(key);
			return undefined;
		}
		// Refresh recency.
		this.entries.delete(key);
		this.entries.set(key, entry);
		return entry.value;
	}

	set(key: string, value: V, ttlMs = this.ttlMs) {
		if (ttlMs <= 0) return;
		this.entries.delete(key);
		this.entries.set(key, { value, expires: Date.now() + ttlMs });
		while (this.entries.size > this.maxEntries) {
			const oldest = this.entries.keys().next().value;
			if (oldest === undefined) break;
			this.entries.delete(oldest);
		}
	}

	delete(key: string) {
		this.entries.delete(key);
	}

	clear() {
		this.entries.clear();
	}

	/** Drop expired entries (called periodically). */
	prune() {
		const now = Date.now();
		for (const [key, entry] of this.entries) {
			if (entry.expires < now) this.entries.delete(key);
		}
	}

	get size() {
		return this.entries.size;
	}
}

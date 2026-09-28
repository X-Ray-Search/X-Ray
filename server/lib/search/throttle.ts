/**
 * Per-engine request budget: at most `limit` upstream requests in any rolling 60 seconds.
 * Scrapers get IP-banned for bursts long before they'd hit a daily quota, so the aggregator
 * skips an engine that is out of budget (and serves its cached results instead) rather than
 * risking a ban. Single-process, in-memory.
 */
export class EngineThrottle {
	static readonly WINDOW_MS = 60_000;

	private static readonly windows = new Map<string, number[]>();

	/** Timestamps inside the window (older ones are dropped). */
	private static recent(slug: string, now: number) {
		const window = this.windows.get(slug);
		if (!window) return [];
		while (window.length && window[0]! <= now - this.WINDOW_MS) window.shift();
		return window;
	}

	/** Whether a request would currently be allowed. `limit <= 0` means unlimited. */
	static hasCapacity(slug: string, limit: number, now = Date.now()) {
		return limit <= 0 || this.recent(slug, now).length < limit;
	}

	/** Take one request from the budget; returns false (and takes nothing) when it is used up. */
	static tryAcquire(slug: string, limit: number, now = Date.now()) {
		if (!this.hasCapacity(slug, limit, now)) return false;
		this.record(slug, now);
		return true;
	}

	/** Count a request that bypassed the budget check (e.g. a manual admin test). */
	static record(slug: string, now = Date.now()) {
		const window = this.windows.get(slug);
		if (window) window.push(now);
		else this.windows.set(slug, [now]);
	}

	static usage(slug: string, now = Date.now()) {
		return this.recent(slug, now).length;
	}

	/** Milliseconds until the next request fits into the budget (0 if it fits now). */
	static retryInMs(slug: string, limit: number, now = Date.now()) {
		const window = this.recent(slug, now);
		if (limit <= 0 || window.length < limit) return 0;
		return window[window.length - limit]! + this.WINDOW_MS - now;
	}

	static reset(slug?: string) {
		if (slug === undefined) this.windows.clear();
		else this.windows.delete(slug);
	}
}

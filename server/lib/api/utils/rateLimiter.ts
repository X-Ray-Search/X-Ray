/**
 * Fixed-window in-memory rate limiter (single process), used for anonymous searches when the
 * instance is public. Entries are cleaned up periodically.
 */
export class RateLimiter {
	private static readonly windows = new Map<string, { count: number; resetAt: number }>();

	private static readonly cleanup = setInterval(() => {
		const now = Date.now();
		for (const [key, entry] of RateLimiter.windows) {
			if (entry.resetAt <= now) RateLimiter.windows.delete(key);
		}
	}, 60_000);

	static {
		// Never keep the process alive for the cleanup timer.
		RateLimiter.cleanup.unref?.();
	}

	/** Count a hit; `limit <= 0` disables limiting. */
	static hit(key: string, limit: number, windowMs = 60_000): { allowed: boolean; retryAfterSeconds: number } {
		if (limit <= 0) return { allowed: true, retryAfterSeconds: 0 };
		const now = Date.now();
		let entry = this.windows.get(key);
		if (!entry || entry.resetAt <= now) {
			entry = { count: 0, resetAt: now + windowMs };
			this.windows.set(key, entry);
		}
		entry.count++;
		return {
			allowed: entry.count <= limit,
			retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
		};
	}

	static reset() {
		this.windows.clear();
	}
}

/**
 * Typed engine failure. `kind` drives the reported engine status and the suspension policy:
 * `blocked` (captcha / 403 / 429) suspends the engine with exponential backoff.
 */
export class EngineError extends Error {
	constructor(
		readonly kind: EngineError.Kind,
		message: string,
	) {
		super(message);
		this.name = "EngineError";
	}

	static from(err: unknown): EngineError {
		if (err instanceof EngineError) return err;
		const error = err as Error;
		if (error?.name === "TimeoutError" || error?.name === "AbortError") {
			return new EngineError("timeout", "Request timed out");
		}
		return new EngineError("network", error?.message ?? String(err));
	}
}

export namespace EngineError {
	export type Kind = "timeout" | "blocked" | "http" | "parse" | "network" | "config";
}

import { Logger } from "../utils/logger";
import type { EngineError } from "./errors";

/**
 * Per-engine health tracking. An engine that gets blocked (captcha, 403, 429) is suspended with
 * exponential backoff (1 min → 2 → 4 … capped at 1 h) so we stop hammering it; repeated generic
 * failures suspend it briefly too. Any success clears the state.
 */
export class EngineHealth {
	private static readonly states = new Map<string, EngineHealth.State>();

	static readonly BASE_SUSPENSION_MS = 60_000;
	static readonly MAX_SUSPENSION_MS = 60 * 60_000;
	static readonly FAILURES_BEFORE_SUSPENSION = 5;

	private static state(slug: string): EngineHealth.State {
		let state = this.states.get(slug);
		if (!state) {
			state = {
				consecutiveFailures: 0,
				consecutiveBlocks: 0,
				suspendedUntil: 0,
				lastError: null,
				lastErrorAt: null,
				lastSuccessAt: null,
				lastLatencyMs: null,
			};
			this.states.set(slug, state);
		}
		return state;
	}

	static isSuspended(slug: string, now = Date.now()) {
		return this.state(slug).suspendedUntil > now;
	}

	static recordSuccess(slug: string, latencyMs: number) {
		const state = this.state(slug);
		state.consecutiveFailures = 0;
		state.consecutiveBlocks = 0;
		state.suspendedUntil = 0;
		state.lastSuccessAt = Date.now();
		state.lastLatencyMs = latencyMs;
	}

	static recordFailure(slug: string, error: EngineError) {
		const state = this.state(slug);
		const now = Date.now();
		state.consecutiveFailures++;
		state.lastError = `${error.kind}: ${error.message}`;
		state.lastErrorAt = now;

		let suspendFor = 0;
		if (error.kind === "blocked") {
			state.consecutiveBlocks++;
			suspendFor = Math.min(
				this.BASE_SUSPENSION_MS * 2 ** (state.consecutiveBlocks - 1),
				this.MAX_SUSPENSION_MS,
			);
		} else if (state.consecutiveFailures >= this.FAILURES_BEFORE_SUSPENSION) {
			suspendFor = this.BASE_SUSPENSION_MS;
		}

		if (suspendFor) {
			state.suspendedUntil = now + suspendFor;
			Logger.warn(`Engine '${slug}' suspended for ${Math.round(suspendFor / 1000)}s (${state.lastError})`);
		}
	}

	static reset(slug: string) {
		this.states.delete(slug);
	}

	static snapshot(slug: string): EngineHealth.Snapshot {
		const state = this.state(slug);
		return {
			suspended_until: state.suspendedUntil > Date.now() ? state.suspendedUntil : null,
			consecutive_failures: state.consecutiveFailures,
			last_error: state.lastError,
			last_error_at: state.lastErrorAt,
			last_success_at: state.lastSuccessAt,
			last_latency_ms: state.lastLatencyMs,
		};
	}
}

export namespace EngineHealth {
	export interface State {
		consecutiveFailures: number;
		consecutiveBlocks: number;
		suspendedUntil: number;
		lastError: string | null;
		lastErrorAt: number | null;
		lastSuccessAt: number | null;
		lastLatencyMs: number | null;
	}

	export interface Snapshot {
		suspended_until: number | null;
		consecutive_failures: number;
		last_error: string | null;
		last_error_at: number | null;
		last_success_at: number | null;
		last_latency_ms: number | null;
	}
}

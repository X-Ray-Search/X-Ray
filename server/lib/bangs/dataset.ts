import { z } from "zod";
import { RuntimeMetadata } from "../api/utils/metadata";
import { DB } from "../db";
import { ProxyManager } from "../proxy";
import { SettingsHandler } from "../settings";
import type { SettingsModels } from "../settings/models";
import { Logger } from "../utils/logger";
import { BangService } from ".";

/**
 * Keeps the local copy of the DuckDuckGo bang dataset (`ddg_bangs`) up to date. The dataset is
 * fetched through the instance's default proxies and swapped in atomically.
 */
export class BangDataset {
	static readonly SOURCE_URL = "https://duckduckgo.com/bang.js";

	private static readonly RawBang = z.object({
		t: z.string().min(1).max(64),
		s: z.string().max(256),
		d: z.string().max(256).default(""),
		u: z.string().min(1).max(2048),
		c: z.string().max(128).optional(),
		sc: z.string().max(128).optional(),
		r: z.number().optional(),
	});

	private static refreshing: Promise<SettingsModels.BangDatasetStatus> | null = null;

	static async status(): Promise<SettingsModels.BangDatasetStatus> {
		const stored = await RuntimeMetadata.get("ddg_bangs_status");
		return {
			updated_at: stored.updated_at ?? null,
			count: stored.count ?? 0,
			last_error: stored.last_error ?? null,
			source_url: this.SOURCE_URL,
		};
	}

	/** Download and store the dataset. Concurrent calls share one refresh. */
	static refresh(): Promise<SettingsModels.BangDatasetStatus> {
		this.refreshing ??= this.doRefresh().finally(() => {
			this.refreshing = null;
		});
		return this.refreshing;
	}

	private static async doRefresh(): Promise<SettingsModels.BangDatasetStatus> {
		const previous = await this.status();
		try {
			const res = await ProxyManager.fetch(this.SOURCE_URL, {
				headers: { Accept: "application/json" },
				signal: AbortSignal.timeout(60_000),
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const raw = (await res.json()) as unknown;
			if (!Array.isArray(raw)) throw new Error("Dataset is not an array");

			const byTrigger = new Map<string, DB.Models.DDGBang>();
			for (const item of raw) {
				const parsed = this.RawBang.safeParse(item);
				if (!parsed.success) continue;
				const bang = parsed.data;
				const trigger = bang.t.toLowerCase();
				if (byTrigger.has(trigger)) continue;
				byTrigger.set(trigger, {
					trigger,
					name: bang.s,
					domain: bang.d,
					url_template: bang.u,
					category: bang.c ?? null,
					subcategory: bang.sc ?? null,
					relevance: Math.round(bang.r ?? 0),
				});
			}
			if (byTrigger.size < 1000) throw new Error(`Dataset looks truncated (${byTrigger.size} bangs)`);

			const rows = [...byTrigger.values()];
			await DB.instance().transaction(async (tx) => {
				await tx.delete(DB.Tables.ddgBangs);
				for (let i = 0; i < rows.length; i += 500) {
					await tx.insert(DB.Tables.ddgBangs).values(rows.slice(i, i + 500));
				}
			});

			const status = { updated_at: Date.now(), count: rows.length, last_error: null, source_url: this.SOURCE_URL };
			await RuntimeMetadata.set("ddg_bangs_status", status);
			await BangService.load();
			Logger.info(`DuckDuckGo bang dataset updated (${rows.length} bangs).`);
			return status;
		} catch (err) {
			const message = (err as Error).message;
			Logger.warn("Failed to update the DuckDuckGo bang dataset:", message);
			const status = { ...previous, last_error: message };
			await RuntimeMetadata.set("ddg_bangs_status", status);
			return status;
		}
	}

	/** Refresh when auto-update is on and the dataset is missing or older than the interval. */
	static async refreshIfStale() {
		const settings = await SettingsHandler.getInstance();
		const status = await this.status();
		const maxAge = settings.ddg_bangs_update_interval_hours * 3_600_000;
		const stale = !status.updated_at || Date.now() - status.updated_at > maxAge;
		if (status.count === 0 || (settings.ddg_bangs_auto_update && stale)) {
			await this.refresh();
		}
	}
}

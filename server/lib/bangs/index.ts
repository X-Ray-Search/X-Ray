import { eq, isNull } from "drizzle-orm";
import { DB } from "../db";
import type { SearchTypes } from "../search/types";

/**
 * DuckDuckGo-style `!bangs`.
 *
 * Sources, highest precedence first: the user's personal bangs → instance bangs (admin) →
 * internal bangs (switch the X-Ray category, e.g. `!i` → images) → the DuckDuckGo dataset.
 * A bang may appear anywhere in the query (`!w linux` or `linux !w`); a lone `!` means
 * "feeling lucky" (jump to the first result).
 */
export class BangService {
	/** DuckDuckGo dataset, sorted by trigger for prefix search. */
	private static ddgSorted: BangService.Entry[] = [];
	private static ddgByTrigger = new Map<string, BangService.Entry>();
	private static instanceByTrigger = new Map<string, BangService.Entry>();
	private static readonly userCache = new Map<number, Map<string, BangService.Entry>>();
	private static loaded = false;
	private static loading: Promise<void> | null = null;

	static readonly INTERNAL: readonly BangService.Entry[] = [
		...["i", "img", "images"].map((trigger) =>
			BangService.internal(trigger, "X-Ray Images", "images"),
		),
		...["n", "news"].map((trigger) => BangService.internal(trigger, "X-Ray News", "news")),
		...["v", "vid", "videos"].map((trigger) =>
			BangService.internal(trigger, "X-Ray Videos", "videos"),
		),
	];
	private static readonly internalByTrigger = new Map(
		BangService.INTERNAL.map((e) => [e.trigger, e]),
	);

	private static internal(
		trigger: string,
		name: string,
		category: SearchTypes.Category,
	): BangService.Entry {
		return {
			trigger,
			name,
			domain: "",
			urlTemplate: "",
			category: null,
			relevance: 0,
			source: "internal",
			switchCategory: category,
		};
	}

	// --------------------------------------------------------------------------- loading

	static async load() {
		const [ddgRows, instanceRows] = await Promise.all([
			DB.instance().select().from(DB.Tables.ddgBangs).all(),
			DB.instance().select().from(DB.Tables.bangs).where(isNull(DB.Tables.bangs.owner_user_id)).all(),
		]);
		this.setDDGDataset(
			ddgRows.map((row) => ({
				trigger: row.trigger,
				name: row.name,
				domain: row.domain,
				urlTemplate: row.url_template,
				category: row.category,
				relevance: row.relevance,
				source: "ddg" as const,
			})),
		);
		this.instanceByTrigger = new Map(
			instanceRows.map((row) => [row.trigger, this.fromCustom(row, "instance")]),
		);
		this.userCache.clear();
		this.loaded = true;
	}

	private static async ensureLoaded() {
		if (this.loaded) return;
		this.loading ??= this.load().finally(() => {
			this.loading = null;
		});
		await this.loading;
	}

	static setDDGDataset(entries: BangService.Entry[]) {
		this.ddgSorted = [...entries].sort((a, b) =>
			a.trigger < b.trigger ? -1 : a.trigger > b.trigger ? 1 : 0,
		);
		this.ddgByTrigger = new Map(this.ddgSorted.map((entry) => [entry.trigger, entry]));
	}

	static get ddgCount() {
		return this.ddgSorted.length;
	}

	static invalidateUser(userID: number) {
		this.userCache.delete(userID);
	}

	static async reloadInstanceBangs() {
		const rows = await DB.instance()
			.select()
			.from(DB.Tables.bangs)
			.where(isNull(DB.Tables.bangs.owner_user_id))
			.all();
		this.instanceByTrigger = new Map(
			rows.map((row) => [row.trigger, this.fromCustom(row, "instance")]),
		);
	}

	private static async userBangs(userID: number) {
		let cached = this.userCache.get(userID);
		if (!cached) {
			const rows = await DB.instance()
				.select()
				.from(DB.Tables.bangs)
				.where(eq(DB.Tables.bangs.owner_user_id, userID))
				.all();
			cached = new Map(rows.map((row) => [row.trigger, this.fromCustom(row, "user")]));
			this.userCache.set(userID, cached);
			if (this.userCache.size > 5000) {
				const oldest = this.userCache.keys().next().value;
				if (oldest !== undefined) this.userCache.delete(oldest);
			}
		}
		return cached;
	}

	private static fromCustom(row: DB.Models.Bang, source: "user" | "instance"): BangService.Entry {
		let domain = "";
		try {
			domain = new URL(row.url_template.replace(/\{\{\{s\}\}\}|%s/g, "x")).hostname;
		} catch {}
		return {
			trigger: row.trigger,
			name: row.name,
			domain,
			urlTemplate: row.url_template,
			category: row.category,
			relevance: Number.MAX_SAFE_INTEGER,
			source,
		};
	}

	// ------------------------------------------------------------------------ resolution

	/** Split `!trigger` out of a query. Returns null when the query has no bang token. */
	static parse(rawQuery: string): { trigger: string; query: string } | null {
		const tokens = rawQuery.trim().split(/\s+/);
		const index = tokens.findIndex((token) => token.startsWith("!"));
		if (index === -1) return null;
		const trigger = tokens[index]!.slice(1).toLowerCase();
		const query = [...tokens.slice(0, index), ...tokens.slice(index + 1)].join(" ").trim();
		return { trigger, query };
	}

	static async lookup(
		trigger: string,
		options: BangService.Options,
	): Promise<BangService.Entry | null> {
		await this.ensureLoaded();
		if (options.userID !== null) {
			const personal = (await this.userBangs(options.userID)).get(trigger);
			if (personal) return personal;
		}
		return (
			this.instanceByTrigger.get(trigger) ??
			this.internalByTrigger.get(trigger) ??
			(options.includeDDG ? this.ddgByTrigger.get(trigger) : undefined) ??
			null
		);
	}

	static async resolve(
		rawQuery: string,
		options: BangService.Options,
	): Promise<BangService.Resolution | null> {
		// Try every bang-looking token, so `c++ !w` and `!w c++` both work.
		const tokens = rawQuery.trim().split(/\s+/);
		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i]!;
			if (!token.startsWith("!")) continue;
			const rest = [...tokens.slice(0, i), ...tokens.slice(i + 1)].join(" ").trim();

			if (token === "!") {
				if (rest) return { kind: "lucky", query: rest };
				continue;
			}

			const entry = await this.lookup(token.slice(1).toLowerCase(), options);
			if (!entry) continue;

			const bang = { trigger: entry.trigger, name: entry.name, source: entry.source };
			if (entry.switchCategory) {
				return { kind: "category", category: entry.switchCategory, query: rest, bang };
			}
			return { kind: "redirect", url: this.buildURL(entry.urlTemplate, rest), bang };
		}
		return null;
	}

	/** Fill the `{{{s}}}` / `%s` placeholder; with an empty query open the site itself. */
	static buildURL(template: string, query: string): string {
		const absolute = template.startsWith("/") ? `https://duckduckgo.com${template}` : template;
		if (!query) {
			try {
				return new URL(absolute.replace(/\{\{\{s\}\}\}|%s/g, "")).origin;
			} catch {
				return absolute;
			}
		}
		return absolute.replace(/\{\{\{s\}\}\}|%s/g, encodeURIComponent(query));
	}

	// ------------------------------------------------------------------------- suggestions

	static async suggest(
		prefix: string,
		options: BangService.Options,
		limit = 8,
	): Promise<BangService.Entry[]> {
		await this.ensureLoaded();
		const needle = prefix.replace(/^!/, "").toLowerCase();
		const seen = new Set<string>();
		const out: BangService.Entry[] = [];
		const take = (entries: Iterable<BangService.Entry>, max = Number.POSITIVE_INFINITY) => {
			const matches = [...entries]
				.filter((e) => e.trigger.startsWith(needle) && !seen.has(e.trigger))
				.sort(
					(a, b) =>
						Number(b.trigger === needle) - Number(a.trigger === needle) ||
						b.relevance - a.relevance ||
						a.trigger.length - b.trigger.length,
				)
				.slice(0, max);
			for (const entry of matches) {
				seen.add(entry.trigger);
				out.push(entry);
			}
		};

		if (options.userID !== null) take((await this.userBangs(options.userID)).values());
		take(this.instanceByTrigger.values());
		take(this.INTERNAL);
		if (options.includeDDG && needle) take(this.ddgPrefixRange(needle), limit * 4);

		// Exact matches first, then personal/instance bangs, then by DuckDuckGo relevance.
		return out
			.sort((a, b) => Number(b.trigger === needle) - Number(a.trigger === needle))
			.slice(0, limit);
	}

	/** All DDG bangs whose trigger starts with `prefix`, via binary search on the sorted list. */
	private static *ddgPrefixRange(prefix: string) {
		let low = 0;
		let high = this.ddgSorted.length;
		while (low < high) {
			const mid = (low + high) >> 1;
			if (this.ddgSorted[mid]!.trigger < prefix) low = mid + 1;
			else high = mid;
		}
		for (
			let i = low;
			i < this.ddgSorted.length && this.ddgSorted[i]!.trigger.startsWith(prefix);
			i++
		) {
			yield this.ddgSorted[i]!;
		}
	}

	static toPublic(entry: BangService.Entry) {
		return {
			trigger: entry.trigger,
			name: entry.name,
			domain: entry.domain,
			category: entry.category,
			source: entry.source,
			switches_category: entry.switchCategory ?? null,
		};
	}
}

export namespace BangService {
	export type Source = "user" | "instance" | "internal" | "ddg";

	export interface Entry {
		trigger: string;
		name: string;
		domain: string;
		urlTemplate: string;
		category: string | null;
		relevance: number;
		source: Source;
		/** Internal bangs switch the X-Ray category instead of redirecting. */
		switchCategory?: SearchTypes.Category;
	}

	export interface Options {
		userID: number | null;
		includeDDG: boolean;
	}

	export type Resolution =
		| { kind: "redirect"; url: string; bang: { trigger: string; name: string; source: Source } }
		| {
				kind: "category";
				category: SearchTypes.Category;
				query: string;
				bang: { trigger: string; name: string; source: Source };
		  }
		| { kind: "lucky"; query: string };
}

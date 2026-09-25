import { parse as parseHTML } from "node-html-parser";

/** Small, dependency-free helpers shared by the engines and the aggregator. */
export class SearchUtils {
	private static readonly TRACKING_PARAMS = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_[a-z]+|ref_src|igshid|_hsenc|_hsmi|yclid|srsltid)$/i;

	/** Collapse whitespace and trim. */
	static cleanText(text: string | undefined | null): string {
		return (text ?? "").replace(/\s+/g, " ").trim();
	}

	/** Strip HTML tags and decode entities (for APIs that embed markup in text fields). */
	static stripTags(html: string | undefined | null): string {
		if (!html) return "";
		return this.cleanText(parseHTML(`<div>${html}</div>`).text);
	}

	/** Parse an absolute http(s) URL, returning null for anything else. */
	static safeURL(value: string | undefined | null, base?: string): URL | null {
		if (!value) return null;
		try {
			const url = new URL(value, base);
			return url.protocol === "http:" || url.protocol === "https:" ? url : null;
		} catch {
			return null;
		}
	}

	/** Remove tracking parameters and fragments; used before handing URLs to clients. */
	static cleanURL(value: string): string {
		const url = this.safeURL(value);
		if (!url) return value;
		for (const key of [...url.searchParams.keys()]) {
			if (this.TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
		}
		url.hash = "";
		return url.toString();
	}

	/** Key used to detect the same page returned by different engines. */
	static dedupeKey(value: string): string {
		const url = this.safeURL(this.cleanURL(value));
		if (!url) return value.trim().toLowerCase();
		const host = url.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
		const path = decodeURIComponent(url.pathname).replace(/\/+$/, "").replace(/\/index\.(html?|php)$/, "");
		url.searchParams.sort();
		const query = url.searchParams.toString();
		return `${host}${path}${query ? `?${query}` : ""}`;
	}

	static hostname(value: string): string {
		return this.safeURL(value)?.hostname.replace(/^www\./, "") ?? "";
	}

	/** Parse "5 hours ago", "3y ago", "2 days ago -", "vor 5 Tagen"… into epoch ms (best effort). */
	static parseRelativeTime(text: string | undefined | null, now = Date.now()): number | undefined {
		if (!text) return undefined;
		const match = text
			.toLowerCase()
			.match(/(\d+)\s*(s|sec|second|m|min|minute|h|hr|hour|d|day|w|wk|week|mo|month|y|yr|year)s?\b/);
		if (!match) return undefined;
		const value = Number(match[1]);
		const unit = match[2]!;
		const ms =
			unit.startsWith("s")
				? 1000
				: unit === "m" || unit.startsWith("min")
					? 60_000
					: unit.startsWith("h")
						? 3_600_000
						: unit.startsWith("d")
							? 86_400_000
							: unit.startsWith("w")
								? 7 * 86_400_000
								: unit.startsWith("mo")
									? 30 * 86_400_000
									: 365 * 86_400_000;
		return now - value * ms;
	}

	/** Parse "123,456 views" / "1.2M views" into a number. */
	static parseCount(text: string | undefined | null): number | undefined {
		if (!text) return undefined;
		const match = text.replace(/,/g, "").match(/([\d.]+)\s*([kmb])?/i);
		if (!match) return undefined;
		const factor = { k: 1e3, m: 1e6, b: 1e9 }[match[2]?.toLowerCase() as "k" | "m" | "b"] ?? 1;
		const value = Number(match[1]) * factor;
		return Number.isFinite(value) ? Math.round(value) : undefined;
	}

	/** Split a locale (`en-US`, `de`, `all`) into its parts. */
	static parseLocale(locale: string): { language: string | null; region: string | null } {
		if (!locale || locale === "all") return { language: null, region: null };
		const [language, region] = locale.split("-");
		return { language: language?.toLowerCase() ?? null, region: region?.toUpperCase() ?? null };
	}

	/** Default country for a bare language code, used by engines that need a market. */
	static defaultRegion(language: string): string {
		return (
			{
				en: "US",
				de: "DE",
				fr: "FR",
				es: "ES",
				it: "IT",
				nl: "NL",
				pt: "BR",
				ja: "JP",
				zh: "CN",
				ru: "RU",
				pl: "PL",
				sv: "SE",
				da: "DK",
				fi: "FI",
				nb: "NO",
				no: "NO",
				tr: "TR",
				ko: "KR",
				cs: "CZ",
				uk: "UA",
				el: "GR",
				hu: "HU",
				ro: "RO",
				ar: "SA",
				he: "IL",
				hi: "IN",
			}[language] ?? language.toUpperCase()
		);
	}

	/** `Accept-Language` header value for a locale. */
	static acceptLanguage(locale: string): string {
		const { language, region } = this.parseLocale(locale);
		if (!language) return "en-US,en;q=0.7";
		return region ? `${language}-${region},${language};q=0.9,en;q=0.5` : `${language},en;q=0.5`;
	}
}

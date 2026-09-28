/**
 * Helpers for the search UI: URLs, result display and formatting.
 */
import type { SearchCategory, TimeRange } from "./types";

export const SEARCH_CATEGORIES: ReadonlyArray<{ id: SearchCategory; label: string; icon: string }> =
	[
		{ id: "general", label: "General", icon: "i-lucide-search" },
		{ id: "images", label: "Images", icon: "i-lucide-image" },
		{ id: "news", label: "News", icon: "i-lucide-newspaper" },
		{ id: "videos", label: "Videos", icon: "i-lucide-play-circle" },
	];

export const TIME_RANGES: ReadonlyArray<{ value: TimeRange | "any"; label: string }> = [
	{ value: "any", label: "Any time" },
	{ value: "day", label: "Past day" },
	{ value: "week", label: "Past week" },
	{ value: "month", label: "Past month" },
	{ value: "year", label: "Past year" },
];

export interface SearchRouteQuery {
	q: string;
	category?: SearchCategory;
	page?: number;
	time_range?: TimeRange;
}

/**
 * Route location of a search. Without `category` the server applies the user's default category,
 * so pass it explicitly whenever the user picked one.
 */
export function searchLocation(query: SearchRouteQuery) {
	const params: Record<string, string> = { q: query.q };
	if (query.category) params.category = query.category;
	if (query.page && query.page > 1) params.page = String(query.page);
	if (query.time_range) params.time_range = query.time_range;
	return { path: "/search", query: params };
}

/** `example.org › docs › page` style breadcrumb of a URL. */
export function displayURL(url: string): { host: string; path: string } {
	try {
		const parsed = new URL(url);
		const segments = decodeURIComponent(parsed.pathname).split("/").filter(Boolean);
		return {
			host: parsed.hostname.replace(/^www\./, ""),
			path: segments.length
				? ` › ${segments.slice(0, 3).join(" › ")}${segments.length > 3 ? " › …" : ""}`
				: "",
		};
	} catch {
		return { host: url, path: "" };
	}
}

export function hostnameOf(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return "";
	}
}

/** Favicon of a site — through the X-Ray media proxy unless the user disabled it. */
export function faviconURL(url: string, viaProxy: boolean): string | null {
	const host = hostnameOf(url);
	if (!host) return null;
	return viaProxy
		? `/api/v1/proxy/favicon?domain=${encodeURIComponent(host)}`
		: `https://icons.duckduckgo.com/ip3/${host}.ico`;
}

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function timeAgo(timestamp: number | null | undefined, now = Date.now()): string {
	if (!timestamp) return "";
	const seconds = Math.round((timestamp - now) / 1000);
	const abs = Math.abs(seconds);
	if (abs < 60) return RELATIVE.format(seconds, "second");
	if (abs < 3600) return RELATIVE.format(Math.round(seconds / 60), "minute");
	if (abs < 86_400) return RELATIVE.format(Math.round(seconds / 3600), "hour");
	if (abs < 30 * 86_400) return RELATIVE.format(Math.round(seconds / 86_400), "day");
	return new Date(timestamp).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

const COMPACT = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export function compactNumber(value: number | null | undefined): string {
	return value === null || value === undefined ? "" : COMPACT.format(value);
}

export function formatNumber(value: number): string {
	return value.toLocaleString("en-US");
}

/** Copy to the clipboard with a toast. */
export async function copyText(text: string, label = "Copied to clipboard") {
	const toast = useToast();
	try {
		await navigator.clipboard.writeText(text);
		toast.add({ title: label, icon: "i-lucide-clipboard-check", color: "success" });
	} catch {
		toast.add({
			title: "Copy failed",
			description: "Select the text and copy it manually.",
			color: "warning",
		});
	}
}

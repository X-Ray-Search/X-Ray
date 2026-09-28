import { InstantAnswerProvider } from "../provider";

/** City / country / abbreviation → IANA timezone for the common cases (no network needed). */
const TIMEZONES: Record<string, string> = {
	utc: "UTC",
	gmt: "UTC",
	zulu: "UTC",
	est: "America/New_York",
	edt: "America/New_York",
	et: "America/New_York",
	eastern: "America/New_York",
	cst: "America/Chicago",
	cdt: "America/Chicago",
	ct: "America/Chicago",
	central: "America/Chicago",
	mst: "America/Denver",
	mdt: "America/Denver",
	mt: "America/Denver",
	mountain: "America/Denver",
	pst: "America/Los_Angeles",
	pdt: "America/Los_Angeles",
	pt: "America/Los_Angeles",
	pacific: "America/Los_Angeles",
	akst: "America/Anchorage",
	hst: "Pacific/Honolulu",
	cet: "Europe/Berlin",
	cest: "Europe/Berlin",
	mez: "Europe/Berlin",
	mesz: "Europe/Berlin",
	wet: "Europe/Lisbon",
	eet: "Europe/Athens",
	eest: "Europe/Athens",
	bst: "Europe/London",
	msk: "Europe/Moscow",
	ist: "Asia/Kolkata",
	pkt: "Asia/Karachi",
	jst: "Asia/Tokyo",
	kst: "Asia/Seoul",
	sgt: "Asia/Singapore",
	hkt: "Asia/Hong_Kong",
	aest: "Australia/Sydney",
	aedt: "Australia/Sydney",
	acst: "Australia/Adelaide",
	awst: "Australia/Perth",
	nzst: "Pacific/Auckland",
	nzdt: "Pacific/Auckland",
	// cities
	"new york": "America/New_York",
	nyc: "America/New_York",
	boston: "America/New_York",
	miami: "America/New_York",
	washington: "America/New_York",
	atlanta: "America/New_York",
	toronto: "America/Toronto",
	montreal: "America/Toronto",
	chicago: "America/Chicago",
	houston: "America/Chicago",
	dallas: "America/Chicago",
	"mexico city": "America/Mexico_City",
	denver: "America/Denver",
	phoenix: "America/Phoenix",
	"los angeles": "America/Los_Angeles",
	la: "America/Los_Angeles",
	"san francisco": "America/Los_Angeles",
	seattle: "America/Los_Angeles",
	vancouver: "America/Vancouver",
	"las vegas": "America/Los_Angeles",
	anchorage: "America/Anchorage",
	honolulu: "Pacific/Honolulu",
	"sao paulo": "America/Sao_Paulo",
	"são paulo": "America/Sao_Paulo",
	"rio de janeiro": "America/Sao_Paulo",
	"buenos aires": "America/Argentina/Buenos_Aires",
	santiago: "America/Santiago",
	lima: "America/Lima",
	bogota: "America/Bogota",
	london: "Europe/London",
	dublin: "Europe/Dublin",
	lisbon: "Europe/Lisbon",
	madrid: "Europe/Madrid",
	barcelona: "Europe/Madrid",
	paris: "Europe/Paris",
	brussels: "Europe/Brussels",
	amsterdam: "Europe/Amsterdam",
	berlin: "Europe/Berlin",
	munich: "Europe/Berlin",
	hamburg: "Europe/Berlin",
	frankfurt: "Europe/Berlin",
	cologne: "Europe/Berlin",
	vienna: "Europe/Vienna",
	zurich: "Europe/Zurich",
	geneva: "Europe/Zurich",
	rome: "Europe/Rome",
	milan: "Europe/Rome",
	prague: "Europe/Prague",
	warsaw: "Europe/Warsaw",
	budapest: "Europe/Budapest",
	copenhagen: "Europe/Copenhagen",
	stockholm: "Europe/Stockholm",
	oslo: "Europe/Oslo",
	helsinki: "Europe/Helsinki",
	athens: "Europe/Athens",
	istanbul: "Europe/Istanbul",
	kyiv: "Europe/Kyiv",
	kiev: "Europe/Kyiv",
	moscow: "Europe/Moscow",
	bucharest: "Europe/Bucharest",
	cairo: "Africa/Cairo",
	lagos: "Africa/Lagos",
	nairobi: "Africa/Nairobi",
	johannesburg: "Africa/Johannesburg",
	"cape town": "Africa/Johannesburg",
	casablanca: "Africa/Casablanca",
	dubai: "Asia/Dubai",
	"abu dhabi": "Asia/Dubai",
	riyadh: "Asia/Riyadh",
	doha: "Asia/Qatar",
	tehran: "Asia/Tehran",
	"tel aviv": "Asia/Jerusalem",
	jerusalem: "Asia/Jerusalem",
	karachi: "Asia/Karachi",
	mumbai: "Asia/Kolkata",
	delhi: "Asia/Kolkata",
	"new delhi": "Asia/Kolkata",
	bangalore: "Asia/Kolkata",
	bengaluru: "Asia/Kolkata",
	kolkata: "Asia/Kolkata",
	dhaka: "Asia/Dhaka",
	kathmandu: "Asia/Kathmandu",
	bangkok: "Asia/Bangkok",
	jakarta: "Asia/Jakarta",
	singapore: "Asia/Singapore",
	"kuala lumpur": "Asia/Kuala_Lumpur",
	manila: "Asia/Manila",
	"hong kong": "Asia/Hong_Kong",
	shanghai: "Asia/Shanghai",
	beijing: "Asia/Shanghai",
	shenzhen: "Asia/Shanghai",
	taipei: "Asia/Taipei",
	seoul: "Asia/Seoul",
	tokyo: "Asia/Tokyo",
	osaka: "Asia/Tokyo",
	sydney: "Australia/Sydney",
	melbourne: "Australia/Melbourne",
	brisbane: "Australia/Brisbane",
	perth: "Australia/Perth",
	adelaide: "Australia/Adelaide",
	auckland: "Pacific/Auckland",
	wellington: "Pacific/Auckland",
	reykjavik: "Atlantic/Reykjavik",
	// countries (capital / most populous zone)
	germany: "Europe/Berlin",
	deutschland: "Europe/Berlin",
	france: "Europe/Paris",
	spain: "Europe/Madrid",
	italy: "Europe/Rome",
	uk: "Europe/London",
	england: "Europe/London",
	"united kingdom": "Europe/London",
	ireland: "Europe/Dublin",
	netherlands: "Europe/Amsterdam",
	belgium: "Europe/Brussels",
	austria: "Europe/Vienna",
	switzerland: "Europe/Zurich",
	poland: "Europe/Warsaw",
	sweden: "Europe/Stockholm",
	norway: "Europe/Oslo",
	denmark: "Europe/Copenhagen",
	finland: "Europe/Helsinki",
	portugal: "Europe/Lisbon",
	greece: "Europe/Athens",
	turkey: "Europe/Istanbul",
	ukraine: "Europe/Kyiv",
	russia: "Europe/Moscow",
	japan: "Asia/Tokyo",
	china: "Asia/Shanghai",
	india: "Asia/Kolkata",
	"south korea": "Asia/Seoul",
	korea: "Asia/Seoul",
	taiwan: "Asia/Taipei",
	thailand: "Asia/Bangkok",
	vietnam: "Asia/Ho_Chi_Minh",
	indonesia: "Asia/Jakarta",
	philippines: "Asia/Manila",
	egypt: "Africa/Cairo",
	nigeria: "Africa/Lagos",
	kenya: "Africa/Nairobi",
	"south africa": "Africa/Johannesburg",
	israel: "Asia/Jerusalem",
	uae: "Asia/Dubai",
	"saudi arabia": "Asia/Riyadh",
	iran: "Asia/Tehran",
	pakistan: "Asia/Karachi",
	bangladesh: "Asia/Dhaka",
	"new zealand": "Pacific/Auckland",
	iceland: "Atlantic/Reykjavik",
	brazil: "America/Sao_Paulo",
	argentina: "America/Argentina/Buenos_Aires",
	mexico: "America/Mexico_City",
	canada: "America/Toronto",
	chile: "America/Santiago",
	peru: "America/Lima",
	colombia: "America/Bogota",
};

export class TimeProvider extends InstantAnswerProvider {
	static readonly definition = InstantAnswerProvider.define({
		id: "time",
		name: "Time",
		description: "Current time — locally or in a city, country, timezone or UTC offset.",
		priority: 30,
		network: true,
		examples: ["time", "time in tokyo", "berlin time", "utc+5:30"],
	});

	private static isValidZone(zone: string) {
		return this.canonicalZone(zone) !== null;
	}

	/** IANA names are case-insensitive in Intl — return the canonical spelling, or null. */
	private static canonicalZone(zone: string): string | null {
		try {
			return new Intl.DateTimeFormat("en-US", { timeZone: zone }).resolvedOptions().timeZone;
		} catch {
			return null;
		}
	}

	/** Offset of an IANA zone at `date`, in minutes east of UTC. */
	static offsetMinutes(zone: string, date: Date): number {
		const parts = new Intl.DateTimeFormat("en-US", {
			timeZone: zone,
			hourCycle: "h23",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		}).formatToParts(date);
		const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
		const asUTC = Date.UTC(
			get("year"),
			get("month") - 1,
			get("day"),
			get("hour"),
			get("minute"),
			get("second"),
		);
		return Math.round((asUTC - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
	}

	private static parseOffset(value: string): number | null {
		const match = value.match(/^(?:utc|gmt)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/);
		if (!match) return null;
		const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
		if (minutes > 14 * 60) return null;
		return match[1] === "-" ? -minutes : minutes;
	}

	private static parse(query: string): { location: string | null; strict: boolean } | null {
		const q = query.trim().toLowerCase().replace(/\?$/, "");
		if (
			/^(what\s+)?(is\s+the\s+)?(current\s+|local\s+)?time(\s+is\s+it)?(\s+now)?$/.test(q) ||
			q === "current time"
		) {
			return { location: null, strict: true };
		}
		const inMatch = q.match(
			/^(?:what(?:'s|\s+is)?\s+)?(?:the\s+)?(?:current\s+|local\s+)?time\s+(?:is\s+it\s+)?(?:now\s+)?in\s+(.+)$/,
		);
		if (inMatch) return { location: inMatch[1]!.trim(), strict: false };
		const suffix = q.match(/^(.+?)\s+(?:local\s+)?time$/);
		// "tokyo time" only for known places — avoids "screen time", "prime time", …
		if (suffix) return { location: suffix[1]!.trim(), strict: true };
		if (this.parseOffset(q) !== null) return { location: q, strict: true };
		return null;
	}

	async answer(query: string, ctx: InstantAnswerProvider.Context) {
		const parsed = TimeProvider.parse(query);
		if (!parsed) return null;

		let zone: string | null = null;
		let offset: number | null = null;
		let label = "Your local time";

		if (parsed.location) {
			const location = parsed.location.replace(/^(the\s+)/, "");
			const known = TIMEZONES[location];
			const iana = location.includes("/")
				? TimeProvider.canonicalZone(location.replace(/\s+/g, "_"))
				: null;
			offset = TimeProvider.parseOffset(location);

			if (known) {
				zone = known;
				label = location.replace(/\b\w/g, (c) => c.toUpperCase());
			} else if (iana) {
				zone = iana;
				label = iana.replace(/_/g, " ");
			} else if (offset !== null) {
				label = location.toUpperCase().replace(/\s+/g, "");
			} else if (!parsed.strict) {
				const geo = await TimeProvider.geocode(location, ctx);
				if (!geo) return null;
				zone = geo.timezone;
				label = geo.label;
			} else {
				return null;
			}
			if (zone) offset = TimeProvider.offsetMinutes(zone, ctx.now);
		}

		const text = zone
			? `${new Intl.DateTimeFormat("en-GB", { timeZone: zone, timeStyle: "short", dateStyle: "full" }).format(ctx.now)} (${label})`
			: label;

		return {
			provider: TimeProvider.definition.id,
			type: "time",
			placement: "top" as const,
			title: parsed.location ? `Time in ${label}` : "Current time",
			text,
			data: {
				location: parsed.location ? label : null,
				timezone: zone,
				// null → the client renders its own local time
				offset_minutes: offset,
				server_time: ctx.now.getTime(),
			},
			source: null,
		};
	}

	private static async geocode(location: string, ctx: InstantAnswerProvider.Context) {
		const res = await ctx.fetch(
			`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: location, count: "1", language: "en", format: "json" })}`,
		);
		if (!res.ok) return null;
		const data = (await res.json()) as {
			results?: Array<{ name: string; country?: string; timezone?: string }>;
		};
		const hit = data.results?.[0];
		if (!hit?.timezone || !this.isValidZone(hit.timezone)) return null;
		return { timezone: hit.timezone, label: hit.country ? `${hit.name}, ${hit.country}` : hit.name };
	}
}

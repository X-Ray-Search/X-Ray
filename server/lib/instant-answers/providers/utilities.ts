import { randomInt, randomUUID } from "crypto";
import { InstantAnswerProvider } from "../provider";

function normalize(query: string) {
	return query.trim().toLowerCase().replace(/\s+/g, " ").replace(/\?$/, "");
}

function top(
	provider: string,
	type: string,
	title: string,
	text: string,
	data: Record<string, any>,
) {
	return { provider, type, placement: "top" as const, title, text, data, source: null };
}

export class RandomProvider extends InstantAnswerProvider {
	static readonly definition = InstantAnswerProvider.define({
		id: "random",
		name: "Random",
		description: "Random numbers, coin flips and dice rolls (`2d6`).",
		priority: 40,
		network: false,
		examples: ["random number 1-100", "flip a coin", "roll 2d6"],
	});

	answer(query: string) {
		const q = normalize(query);
		const id = RandomProvider.definition.id;

		if (/^(flip a coin|coin flip|coin toss|toss a coin|heads or tails|flip coin)$/.test(q)) {
			const value = randomInt(2) === 0 ? "Heads" : "Tails";
			return top(id, "random", "Coin flip", value, { kind: "coin", value });
		}

		const dice = q.match(/^(?:roll\s+)?(?:(?:a\s+)?(?:die|dice)|(\d{0,2})d(\d{1,4}))$/);
		if (dice && (q.startsWith("roll") || dice[2])) {
			const count = Math.min(Math.max(Number(dice[1] || 1), 1), 50);
			const sides = Math.min(Math.max(Number(dice[2] || 6), 2), 1000);
			const rolls = Array.from({ length: count }, () => randomInt(1, sides + 1));
			const total = rolls.reduce((a, b) => a + b, 0);
			return top(
				id,
				"random",
				`Roll ${count}d${sides}`,
				`${rolls.join(" + ")}${count > 1 ? ` = ${total}` : ""}`,
				{
					kind: "dice",
					count,
					sides,
					rolls,
					total,
				},
			);
		}

		const number =
			q.match(
				/^(?:random number|random integer|rng|pick a number)(?:\s+(?:between|from))?(?:\s+(-?\d{1,15})\s*(?:-|to|and|,)\s*(-?\d{1,15}))?$/,
			) ?? q.match(/^random\s+(-?\d{1,15})\s*(?:-|to|and|,)\s*(-?\d{1,15})$/);
		if (number) {
			let min = Number(number[1] ?? 1);
			let max = Number(number[2] ?? 100);
			if (min > max) [min, max] = [max, min];
			if (max - min >= 2 ** 47) return null;
			const value = randomInt(min, max + 1);
			return top(id, "random", `Random number between ${min} and ${max}`, String(value), {
				kind: "number",
				min,
				max,
				value,
			});
		}
		return null;
	}
}

export class UUIDProvider extends InstantAnswerProvider {
	static readonly definition = InstantAnswerProvider.define({
		id: "uuid",
		name: "UUID generator",
		description: "Generates random (v4) UUIDs.",
		priority: 40,
		network: false,
		examples: ["uuid", "generate 5 uuids"],
	});

	answer(query: string) {
		const match = normalize(query).match(
			/^(?:generate\s+)?(?:(\d{1,2})\s+)?(?:a\s+)?(?:random\s+)?(?:uuid|guid)s?(?:\s*v?4)?(?:\s+generator)?$/,
		);
		if (!match) return null;
		const count = Math.min(Math.max(Number(match[1] ?? 1), 1), 20);
		const values = Array.from({ length: count }, () => randomUUID());
		return top(
			UUIDProvider.definition.id,
			"uuid",
			count > 1 ? `${count} UUIDs (v4)` : "UUID (v4)",
			values.join("\n"),
			{ values },
		);
	}
}

export class PasswordProvider extends InstantAnswerProvider {
	static readonly definition = InstantAnswerProvider.define({
		id: "password",
		name: "Password generator",
		description: "Generates strong random passwords (regenerated client-side).",
		priority: 40,
		network: false,
		examples: ["password", "generate password 32"],
	});

	static readonly CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+";

	answer(query: string) {
		const match = normalize(query).match(
			/^(?:generate\s+)?(?:a\s+)?(?:random\s+|strong\s+|secure\s+)?(?:password|passphrase|pw)(?:\s+generator)?(?:\s+(\d{1,3}))?(?:\s+(?:chars|characters))?$/,
		);
		if (!match) return null;
		const length = Math.min(Math.max(Number(match[1] ?? 20), 8), 128);
		const value = Array.from(
			{ length },
			() => PasswordProvider.CHARSET[randomInt(PasswordProvider.CHARSET.length)],
		).join("");
		return top(
			PasswordProvider.definition.id,
			"password",
			`Random password (${length} characters)`,
			value,
			{
				value,
				length,
				charset: PasswordProvider.CHARSET,
			},
		);
	}
}

export class LoremIpsumProvider extends InstantAnswerProvider {
	static readonly definition = InstantAnswerProvider.define({
		id: "lorem_ipsum",
		name: "Lorem ipsum",
		description: "Placeholder text.",
		priority: 45,
		network: false,
		examples: ["lorem ipsum", "lorem ipsum 3 paragraphs"],
	});

	private static readonly TEXT =
		"Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";

	answer(query: string) {
		const match = normalize(query).match(/^lorem(?:\s+ipsum)?(?:\s+(\d{1,2})\s*(?:paragraphs?|p))?$/);
		if (!match) return null;
		const count = Math.min(Math.max(Number(match[1] ?? 1), 1), 10);
		const paragraphs = Array.from({ length: count }, () => LoremIpsumProvider.TEXT);
		return top(
			LoremIpsumProvider.definition.id,
			"lorem_ipsum",
			"Lorem ipsum",
			paragraphs.join("\n\n"),
			{ paragraphs },
		);
	}
}

export class HashProvider extends InstantAnswerProvider {
	static readonly definition = InstantAnswerProvider.define({
		id: "hash",
		name: "Hash",
		description: "MD5, SHA-1, SHA-256, SHA-512 and SHA3 hashes of a text.",
		priority: 40,
		network: false,
		examples: ["sha256 hello world", "md5 hello"],
	});

	private static readonly ALGORITHMS: Record<string, string> = {
		md5: "md5",
		sha1: "sha1",
		"sha-1": "sha1",
		sha224: "sha224",
		sha256: "sha256",
		"sha-256": "sha256",
		sha384: "sha384",
		sha512: "sha512",
		"sha-512": "sha512",
		"sha3-256": "sha3-256",
		"sha3-512": "sha3-512",
		blake2b256: "blake2b256",
	};

	answer(query: string) {
		const match = query
			.trim()
			.match(
				/^(md5|sha-?1|sha224|sha-?256|sha384|sha-?512|sha3-256|sha3-512|blake2b256)\s+(?:hash\s+(?:of\s+)?)?([\s\S]{1,2000})$/i,
			);
		if (!match) return null;
		const name = match[1]!.toLowerCase();
		const algorithm = HashProvider.ALGORITHMS[name]!;
		const input = match[2]!;
		const value = new Bun.CryptoHasher(algorithm as Bun.SupportedCryptoAlgorithms)
			.update(input)
			.digest("hex");
		return top(HashProvider.definition.id, "hash", `${name.toUpperCase()} hash`, value, {
			algorithm: name,
			input,
			value,
		});
	}
}

export class EncodingProvider extends InstantAnswerProvider {
	static readonly definition = InstantAnswerProvider.define({
		id: "encoding",
		name: "Base64 & URL encoding",
		description: "Encodes/decodes Base64 and URL (percent) encoding.",
		priority: 40,
		network: false,
		examples: ["base64 encode hello", "base64 decode aGVsbG8=", "url encode a b&c"],
	});

	answer(query: string) {
		const text = query.trim();
		const base64 = text.match(
			/^(?:base64\s+(encode|decode)|(encode|decode)\s+base64)\s+([\s\S]{1,4000})$/i,
		);
		const url = text.match(/^(?:url\s*(encode|decode)|(encode|decode)\s+url)\s+([\s\S]{1,4000})$/i);
		const id = EncodingProvider.definition.id;

		if (base64) {
			const mode = (base64[1] ?? base64[2])!.toLowerCase();
			const input = base64[3]!;
			let output: string;
			if (mode === "encode") {
				output = Buffer.from(input, "utf8").toString("base64");
			} else {
				if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(input)) return null;
				output = Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
			}
			return top(id, "encoding", `Base64 ${mode}`, output, { scheme: "base64", mode, input, output });
		}
		if (url) {
			const mode = (url[1] ?? url[2])!.toLowerCase();
			const input = url[3]!;
			let output: string;
			try {
				output = mode === "encode" ? encodeURIComponent(input) : decodeURIComponent(input);
			} catch {
				return null;
			}
			return top(id, "encoding", `URL ${mode}`, output, { scheme: "url", mode, input, output });
		}
		return null;
	}
}

export class ColorProvider extends InstantAnswerProvider {
	static readonly definition = InstantAnswerProvider.define({
		id: "color",
		name: "Color",
		description: "Shows a color and converts between HEX, RGB and HSL.",
		priority: 40,
		network: false,
		examples: ["#00e5c0", "rgb(255, 136, 0)", "hsl(200, 80%, 50%)"],
	});

	answer(query: string) {
		const q = normalize(query)
			.replace(/^(?:colou?r|hex)\s+/, "")
			.replace(/\s+colou?r$/, "");
		let rgb: [number, number, number] | null = null;

		const hex = q.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
		const rgbMatch = q.match(
			/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/,
		);
		const hslMatch = q.match(
			/^hsla?\(\s*(\d{1,3})\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%\s*(?:,\s*[\d.]+\s*)?\)$/,
		);

		if (hex) {
			const value = hex[1]!.length === 3 ? [...hex[1]!].map((c) => c + c).join("") : hex[1]!;
			rgb = [0, 2, 4].map((i) => Number.parseInt(value.slice(i, i + 2), 16)) as [
				number,
				number,
				number,
			];
		} else if (rgbMatch) {
			rgb = [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])];
			if (rgb.some((c) => c > 255)) return null;
		} else if (hslMatch) {
			rgb = ColorProvider.hslToRgb(
				Number(hslMatch[1]) % 360,
				Math.min(Number(hslMatch[2]), 100),
				Math.min(Number(hslMatch[3]), 100),
			);
		}
		if (!rgb) return null;

		const [r, g, b] = rgb;
		const hexValue = `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
		const [h, s, l] = ColorProvider.rgbToHsl(r, g, b);
		const k = 1 - Math.max(r, g, b) / 255;
		const cmyk =
			k === 1
				? [0, 0, 0, 100]
				: [r, g, b]
						.map((c) => Math.round(((1 - c / 255 - k) / (1 - k)) * 100))
						.concat(Math.round(k * 100));
		const data = {
			hex: hexValue,
			rgb: `rgb(${r}, ${g}, ${b})`,
			hsl: `hsl(${h}, ${s}%, ${l}%)`,
			cmyk: `cmyk(${cmyk.join("%, ")}%)`,
			values: { r, g, b, h, s, l },
		};
		return top(
			ColorProvider.definition.id,
			"color",
			hexValue,
			`${data.hex} · ${data.rgb} · ${data.hsl}`,
			data,
		);
	}

	static rgbToHsl(r: number, g: number, b: number): [number, number, number] {
		const [rn, gn, bn] = [r / 255, g / 255, b / 255];
		const max = Math.max(rn, gn, bn);
		const min = Math.min(rn, gn, bn);
		const l = (max + min) / 2;
		let h = 0;
		let s = 0;
		if (max !== min) {
			const d = max - min;
			s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
			h =
				max === rn
					? (gn - bn) / d + (gn < bn ? 6 : 0)
					: max === gn
						? (bn - rn) / d + 2
						: (rn - gn) / d + 4;
			h *= 60;
		}
		return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
	}

	static hslToRgb(h: number, s: number, l: number): [number, number, number] {
		const sn = s / 100;
		const ln = l / 100;
		const a = sn * Math.min(ln, 1 - ln);
		const f = (n: number) => {
			const k = (n + h / 30) % 12;
			return Math.round((ln - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
		};
		return [f(0), f(8), f(4)];
	}
}

export class IPProvider extends InstantAnswerProvider {
	static readonly definition = InstantAnswerProvider.define({
		id: "ip",
		name: "My IP & user agent",
		description: "Shows your IP address or user agent as seen by X-Ray.",
		priority: 40,
		network: false,
		examples: ["what is my ip", "my user agent"],
	});

	answer(query: string, ctx: InstantAnswerProvider.Context) {
		const q = normalize(query).replace(/^(what(?:'s|s| is)\s+)/, "");
		const id = IPProvider.definition.id;
		if (/^(my\s+)?(public\s+)?ip(\s+address)?$/.test(q) && (q.includes("my") || q.startsWith("ip"))) {
			if (!ctx.clientIP) return null;
			return top(id, "ip", "Your IP address", ctx.clientIP, { kind: "ip", value: ctx.clientIP });
		}
		if (/^(my\s+)?(browser\s+)?user[\s-]?agent$/.test(q)) {
			if (!ctx.userAgent) return null;
			return top(id, "ip", "Your user agent", ctx.userAgent, {
				kind: "user_agent",
				value: ctx.userAgent,
			});
		}
		return null;
	}
}

export class TimestampProvider extends InstantAnswerProvider {
	static readonly definition = InstantAnswerProvider.define({
		id: "timestamp",
		name: "Unix timestamp",
		description: "Current Unix time, or converts a timestamp to a date.",
		priority: 40,
		network: false,
		examples: ["unix timestamp", "timestamp 1700000000"],
	});

	answer(query: string, ctx: InstantAnswerProvider.Context) {
		const q = normalize(query);
		const id = TimestampProvider.definition.id;
		if (/^(?:current\s+)?(?:unix\s+)?(?:timestamp|epoch|unix time)(?:\s+now)?$/.test(q)) {
			const seconds = Math.floor(ctx.now.getTime() / 1000);
			return top(id, "timestamp", "Current Unix timestamp", String(seconds), {
				timestamp: seconds,
				iso: ctx.now.toISOString(),
				live: true,
			});
		}
		const match = q.match(/^(?:unix\s+)?(?:timestamp|epoch|unix time)\s+(\d{9,13})$/);
		if (match) {
			const raw = Number(match[1]);
			const ms = match[1]!.length > 10 ? raw : raw * 1000;
			const date = new Date(ms);
			return top(id, "timestamp", `Unix timestamp ${match[1]}`, date.toISOString(), {
				timestamp: Math.floor(ms / 1000),
				iso: date.toISOString(),
				live: false,
			});
		}
		return null;
	}
}

export class TimerProvider extends InstantAnswerProvider {
	static readonly definition = InstantAnswerProvider.define({
		id: "timer",
		name: "Timer & stopwatch",
		description: "Countdown timers and a stopwatch that run in your browser.",
		priority: 35,
		network: false,
		examples: ["timer 5 minutes", "set a timer for 1h 30m", "stopwatch"],
	});

	static parseDuration(text: string): number | null {
		const clock = text.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/);
		if (clock) return Number(clock[1] ?? 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
		let total = 0;
		let matched = false;
		for (const part of text.matchAll(
			/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|min|mins|minutes?|s|sec|secs|seconds?)\b/g,
		)) {
			matched = true;
			const value = Number(part[1]);
			const unit = part[2]!;
			total += unit.startsWith("h") ? value * 3600 : unit.startsWith("m") ? value * 60 : value;
		}
		if (!matched && /^\d+$/.test(text)) return Number(text) * 60;
		return matched ? Math.round(total) : null;
	}

	answer(query: string) {
		const q = normalize(query);
		const id = TimerProvider.definition.id;
		if (/^(start\s+(a\s+)?)?stop\s?watch$/.test(q)) {
			return top(id, "timer", "Stopwatch", "Stopwatch", { mode: "stopwatch", seconds: 0 });
		}
		const match =
			q.match(/^(?:set\s+(?:a\s+)?)?(?:timer|countdown)(?:\s+(?:for\s+)?(.+))?$/) ??
			q.match(/^(.+?)\s+(?:timer|countdown)$/);
		if (!match) return null;
		const seconds = match[1] ? TimerProvider.parseDuration(match[1]) : 300;
		if (!seconds || seconds > 24 * 3600) return null;
		return top(
			id,
			"timer",
			"Timer",
			`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`,
			{
				mode: "timer",
				seconds,
			},
		);
	}
}

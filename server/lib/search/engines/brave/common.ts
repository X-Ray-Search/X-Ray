import type { SearchTypes } from "../../types";
import { SearchUtils } from "../../utils";

/**
 * Shared Brave Search plumbing: preference cookies, time filters, captcha detection and the
 * search response SvelteKit embeds into the images/videos/news pages.
 */
export class BraveCommon {
	/** Brave's `tf` parameter: past day/week/month/year. */
	static timeFilter(range: SearchTypes.TimeRange | null): string | null {
		return range ? { day: "pd", week: "pw", month: "pm", year: "py" }[range] : null;
	}

	/** Preferences live in cookies: safe search, no IP geolocation, the locale's country/UI language. */
	static cookies(query: SearchTypes.EngineQuery): Record<string, string> {
		const cookies: Record<string, string> = {
			safesearch: ["off", "moderate", "strict"][query.safesearch]!,
			useLocation: "0",
		};
		const { language, region } = SearchUtils.parseLocale(query.language);
		if (language) {
			cookies.country = (region ?? SearchUtils.defaultRegion(language)).toLowerCase();
			cookies.ui_lang = `${language}-${cookies.country}`;
		}
		return cookies;
	}

	/**
	 * Every Brave page embeds its UI strings, which mention "captcha" — so only a page that
	 * carries no search response counts as a captcha.
	 */
	static isCaptcha(raw: string): boolean {
		return /captcha/i.test(raw) && !BraveCommon.searchResponse(raw);
	}

	/**
	 * The search API response a page is hydrated from: SvelteKit passes it as a JavaScript literal
	 * to `kit.start(app, element, { data: [layout, page] })`, under `data.body.response` (images,
	 * videos) or `data.response` (news).
	 */
	static searchResponse(raw: string): Record<string, any> | null {
		const start = raw.search(/kit\.start\(\s*app\s*,\s*element\s*,\s*\{/);
		if (start < 0) return null;
		let hydration: any;
		try {
			hydration = new LiteralReader(raw, raw.indexOf("{", start)).read();
		} catch {
			return null;
		}
		for (const node of Array.isArray(hydration?.data) ? hydration.data : []) {
			const response = node?.data?.body?.response ?? node?.data?.response;
			if (response && typeof response === "object") return response;
		}
		return null;
	}

	/** Parse a JavaScript literal (see {@link LiteralReader}) starting at `start`. */
	static parseLiteral(source: string, start = 0): unknown {
		return new LiteralReader(source, start).read();
	}
}

/**
 * Reads the JavaScript literals SvelteKit (devalue's `uneval`) writes into pages: JSON plus bare
 * keys, single quotes and `void 0`. Values it cannot represent (`new Date(…)`, references to
 * hoisted values) read as `undefined` instead of failing. Never evaluates anything.
 */
class LiteralReader {
	private static readonly NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/iy;
	private static readonly WORD = /-?[A-Za-z_$][\w$.]*/y;
	private static readonly KEY = /[\w$]+/y;
	private static readonly SPACE = /\s+/y;
	private static readonly PLAIN: Record<string, RegExp> = { '"': /[^"\\]+/y, "'": /[^'\\]+/y };
	private static readonly ESCAPES: Record<string, string> = {
		n: "\n",
		r: "\r",
		t: "\t",
		b: "\b",
		f: "\f",
		v: "\v",
		"0": "\0",
		"\n": "",
	};

	constructor(
		private readonly src: string,
		private pos: number,
	) {}

	read(): unknown {
		const char = this.skipSpace();
		if (char === "{") return this.object();
		if (char === "[") return this.array();
		if (char === '"' || char === "'") return this.string();

		const number = this.match(LiteralReader.NUMBER);
		if (number) return Number(number);

		const word = this.match(LiteralReader.WORD);
		if (!word) throw new SyntaxError(`Unexpected ${char ?? "end of input"} at ${this.pos}`);
		switch (word) {
			case "true":
				return true;
			case "false":
				return false;
			case "null":
				return null;
			case "undefined":
				return undefined;
			case "NaN":
			case "Infinity":
			case "-Infinity":
				return Number(word);
			case "void":
				this.read();
				return undefined;
			case "new":
				this.skipSpace();
				this.match(LiteralReader.WORD);
		}
		// Any other identifier, `new X(…)` or a call like `Object.create(null)`: skip the arguments.
		while (this.skipSpace() === "(") {
			this.pos++;
			while (this.skipSpace() !== ")") {
				this.read();
				if (this.skipSpace() === ",") this.pos++;
			}
			this.pos++;
		}
		return undefined;
	}

	private object(): Record<string, unknown> {
		const object: Record<string, unknown> = {};
		this.pos++;
		while (this.skipSpace() !== "}") {
			const char = this.src[this.pos];
			const key = char === '"' || char === "'" ? this.string() : this.match(LiteralReader.KEY);
			if (key === null || this.skipSpace() !== ":") {
				throw new SyntaxError(`Invalid object key at ${this.pos}`);
			}
			this.pos++;
			const value = this.read();
			if (key !== "__proto__") object[key] = value;
			if (this.skipSpace() === ",") this.pos++;
			else if (this.src[this.pos] !== "}") throw new SyntaxError(`Expected , or } at ${this.pos}`);
		}
		this.pos++;
		return object;
	}

	private array(): unknown[] {
		const array: unknown[] = [];
		this.pos++;
		while (this.skipSpace() !== "]") {
			if (this.src[this.pos] === ",") {
				// A hole: `[1,,2]`.
				array.push(undefined);
				this.pos++;
				continue;
			}
			array.push(this.read());
			if (this.skipSpace() === ",") this.pos++;
			else if (this.src[this.pos] !== "]") throw new SyntaxError(`Expected , or ] at ${this.pos}`);
		}
		this.pos++;
		return array;
	}

	private string(): string {
		const quote = this.src[this.pos++]!;
		let out = "";
		while (this.pos < this.src.length) {
			out += this.match(LiteralReader.PLAIN[quote]!) ?? "";
			const char = this.src[this.pos++];
			if (char === quote) return out;
			const escaped = this.src[this.pos++] ?? "";
			if (escaped === "x") out += this.codePoint(2);
			else if (escaped !== "u") out += LiteralReader.ESCAPES[escaped] ?? escaped;
			else if (this.src[this.pos] !== "{") out += this.codePoint(4);
			else {
				// `\u{1F600}`
				this.pos++;
				out += this.codePoint(this.src.indexOf("}", this.pos) - this.pos);
				this.pos++;
			}
		}
		throw new SyntaxError("Unterminated string");
	}

	/** Read `length` hex digits as a code point. */
	private codePoint(length: number): string {
		const hex = this.src.slice(this.pos, this.pos + length);
		this.pos += length;
		if (!/^[\da-f]+$/i.test(hex)) throw new SyntaxError(`Invalid escape at ${this.pos}`);
		return String.fromCodePoint(Number.parseInt(hex, 16));
	}

	/** Skip whitespace and return the next character (`undefined` at the end of input). */
	private skipSpace(): string | undefined {
		this.match(LiteralReader.SPACE);
		return this.src[this.pos];
	}

	private match(pattern: RegExp): string | null {
		pattern.lastIndex = this.pos;
		const match = pattern.exec(this.src);
		if (!match) return null;
		this.pos = pattern.lastIndex;
		return match[0];
	}
}

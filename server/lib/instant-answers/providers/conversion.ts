import { TTLCache } from "../../search/cache";
import { MathParser } from "../math/parser";
import { Units } from "../math/units";
import { InstantAnswerProvider } from "../provider";

/** `<number> <unit> to|in|as <unit>` → the number, the source and target unit strings. */
function parseConversion(query: string) {
	const match = query
		.trim()
		.toLowerCase()
		.replace(/^(convert|how many|how much)\s+/, "")
		.replace(/\?$/, "")
		.match(
			/^([$€£¥₹]?)\s*(-?\d+(?:[.,]\d+)*(?:e[+-]?\d+)?)\s*(.*?)\s+(?:to|in|into|as|=|->|→)\s+(.+)$/,
		);
	if (!match) return null;
	const [, symbol = "", rawNumber = "", from = "", to = ""] = match;
	// "1,000" is a thousands separator, "1,5" a decimal comma.
	const normalized = /,\d{3}(\D|$)/.test(rawNumber)
		? rawNumber.replace(/,/g, "")
		: rawNumber.replace(",", ".");
	const value = Number(normalized);
	if (!Number.isFinite(value)) return null;
	return { symbol, value, from: from.trim(), to: to.trim() };
}

export class UnitConverterProvider extends InstantAnswerProvider {
	static readonly definition = InstantAnswerProvider.define({
		id: "unit_converter",
		name: "Unit converter",
		description: "Converts length, mass, temperature, volume, area, speed, data, energy and more.",
		priority: 20,
		network: false,
		examples: ["10 km to miles", "72 f in c", "5 gb in gib", "3 cups in ml"],
	});

	answer(query: string) {
		const parsed = parseConversion(query);
		if (!parsed || parsed.symbol) return null;
		const from = Units.find(parsed.from);
		const to = Units.find(parsed.to);
		if (!from || !to || from.dimension !== to.dimension || from === to) return null;

		const result = Units.convert(parsed.value, from, to);
		const formatted = MathParser.format(result);
		return {
			provider: UnitConverterProvider.definition.id,
			type: "unit_conversion",
			placement: "top" as const,
			title: "Unit conversion",
			text: `${MathParser.format(parsed.value)} ${from.label} = ${formatted} ${to.label}`,
			data: {
				dimension: from.dimension,
				from: { value: parsed.value, unit: from.id, label: from.label },
				to: { value: result, formatted, unit: to.id, label: to.label },
				// Everything the widget needs to convert live without another request.
				units: Units.ALL.filter((unit) => unit.dimension === from.dimension).map((unit) => ({
					id: unit.id,
					label: unit.label,
					factor: unit.factor,
					offset: unit.offset ?? 0,
				})),
			},
			source: null,
		};
	}
}

/** Currency conversion with ECB reference rates (frankfurter.dev, no API key). */
export class CurrencyProvider extends InstantAnswerProvider {
	static readonly definition = InstantAnswerProvider.define({
		id: "currency",
		name: "Currency converter",
		description: "Converts currencies with daily European Central Bank reference rates.",
		priority: 20,
		network: true,
		examples: ["100 usd to eur", "$50 in gbp", "2500 yen to euro"],
	});

	private static readonly rates = new TTLCache<{ date: string; rates: Record<string, number> }>(
		64,
		3_600_000,
	);

	private static readonly ALIASES: Record<string, string> = {
		$: "USD",
		dollar: "USD",
		dollars: "USD",
		"us dollar": "USD",
		"us dollars": "USD",
		"€": "EUR",
		euro: "EUR",
		euros: "EUR",
		"£": "GBP",
		pound: "GBP",
		pounds: "GBP",
		"british pound": "GBP",
		"british pounds": "GBP",
		quid: "GBP",
		"¥": "JPY",
		yen: "JPY",
		"₹": "INR",
		rupee: "INR",
		rupees: "INR",
		franc: "CHF",
		francs: "CHF",
		"swiss franc": "CHF",
		"swiss francs": "CHF",
		yuan: "CNY",
		renminbi: "CNY",
		rmb: "CNY",
		won: "KRW",
		zloty: "PLN",
		lira: "TRY",
		real: "BRL",
		reais: "BRL",
		rand: "ZAR",
		peso: "MXN",
		pesos: "MXN",
		"canadian dollar": "CAD",
		"canadian dollars": "CAD",
		"australian dollar": "AUD",
		"australian dollars": "AUD",
	};

	/** Currencies published by the ECB reference rates. */
	static readonly CODES = new Set([
		"AUD",
		"BGN",
		"BRL",
		"CAD",
		"CHF",
		"CNY",
		"CZK",
		"DKK",
		"EUR",
		"GBP",
		"HKD",
		"HUF",
		"IDR",
		"ILS",
		"INR",
		"ISK",
		"JPY",
		"KRW",
		"MXN",
		"MYR",
		"NOK",
		"NZD",
		"PHP",
		"PLN",
		"RON",
		"SEK",
		"SGD",
		"THB",
		"TRY",
		"USD",
		"ZAR",
	]);

	private static code(value: string): string | null {
		const key = value.trim().toLowerCase();
		const code = this.ALIASES[key] ?? key.toUpperCase();
		return this.CODES.has(code) ? code : null;
	}

	async answer(query: string, ctx: InstantAnswerProvider.Context) {
		const parsed = parseConversion(query);
		if (!parsed) return null;
		const from = parsed.from
			? CurrencyProvider.code(parsed.from)
			: parsed.symbol
				? CurrencyProvider.code(parsed.symbol)
				: null;
		const to = CurrencyProvider.code(parsed.to);
		if (!from || !to || from === to) return null;
		// "10 pounds to kg" is a weight conversion.
		if (Units.find(parsed.to)) return null;

		let table = CurrencyProvider.rates.get(from);
		if (!table) {
			const res = await ctx.fetch(`https://api.frankfurter.dev/v1/latest?base=${from}`);
			if (!res.ok) return null;
			const data = (await res.json()) as { date: string; rates: Record<string, number> };
			table = { date: data.date, rates: data.rates };
			CurrencyProvider.rates.set(from, table);
		}
		const rate = table.rates[to];
		if (!rate) return null;

		const result = parsed.value * rate;
		const formatted = result.toLocaleString("en-US", { maximumFractionDigits: result < 1 ? 6 : 2 });
		return {
			provider: CurrencyProvider.definition.id,
			type: "currency",
			placement: "top" as const,
			title: "Currency conversion",
			text: `${parsed.value} ${from} = ${formatted} ${to}`,
			data: {
				amount: parsed.value,
				from,
				to,
				rate,
				result,
				formatted,
				date: table.date,
				// All rates for the base, so the widget can switch the target currency locally.
				rates: table.rates,
			},
			source: { name: "European Central Bank via Frankfurter", url: "https://frankfurter.dev" },
		};
	}
}

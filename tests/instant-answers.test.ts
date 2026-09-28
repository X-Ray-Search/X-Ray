import { describe, expect, test } from "bun:test";
import { InstantAnswerService } from "../server/lib/instant-answers";
import { MathParser } from "../server/lib/instant-answers/math/parser";
import { Units } from "../server/lib/instant-answers/math/units";
import type { InstantAnswerProvider } from "../server/lib/instant-answers/provider";
import { CalculatorProvider } from "../server/lib/instant-answers/providers/calculator";
import {
	CurrencyProvider,
	UnitConverterProvider,
} from "../server/lib/instant-answers/providers/conversion";
import { TimeProvider } from "../server/lib/instant-answers/providers/time";
import {
	ColorProvider,
	EncodingProvider,
	HashProvider,
	IPProvider,
	PasswordProvider,
	RandomProvider,
	TimerProvider,
	TimestampProvider,
	UUIDProvider,
} from "../server/lib/instant-answers/providers/utilities";

const offlineContext = (
	overrides: Partial<InstantAnswerProvider.Context> = {},
): InstantAnswerProvider.Context => ({
	language: "en",
	units: "metric",
	clientIP: "203.0.113.7",
	userAgent: "TestAgent/1.0",
	now: new Date("2026-09-25T12:00:00Z"),
	fetch: async () => {
		throw new Error("network disabled in tests");
	},
	...overrides,
});

describe("MathParser", () => {
	const cases: Array<[string, number]> = [
		["1 + 2 * 3", 7],
		["(1 + 2) * 3", 9],
		["2 ^ 10", 1024],
		["2 ** 3 ** 2", 512],
		["-2 ^ 2", -4],
		["10 / 4", 2.5],
		["7 mod 3", 1],
		["10 % 3", 1],
		["50%", 0.5],
		["20% of 150", 30],
		["150 + 10%", 165],
		["200 - 25%", 150],
		["5!", 120],
		["2pi", 2 * Math.PI],
		["3(4 + 5)", 27],
		["sqrt(16) + sqrt 9", 7],
		["log(100)", 2],
		["log(8, 2)", 3],
		["ln(e)", 1],
		["max(1, 7, 3)", 7],
		["3 x 4", 12],
		["12 ÷ 4 × 3", 9],
		["1,000 + 1", 1001],
		["1.5e3", 1500],
	];

	for (const [expression, expected] of cases) {
		test(`evaluates ${expression}`, () => {
			expect(MathParser.evaluate(expression)).toBeCloseTo(expected, 10);
		});
	}

	test("handles degrees", () => {
		expect(MathParser.evaluate("sin(30°)")).toBeCloseTo(0.5, 10);
		expect(MathParser.evaluate("cos(60 deg)")).toBeCloseTo(0.5, 10);
	});

	test("rejects invalid input", () => {
		expect(() => MathParser.evaluate("1 +")).toThrow();
		expect(() => MathParser.evaluate("foo(1)")).toThrow();
		expect(() => MathParser.evaluate("1 / 0")).toThrow();
		expect(() => MathParser.evaluate("(1 + 2")).toThrow();
		expect(() => MathParser.evaluate("alert(1)")).toThrow();
	});

	test("formats results", () => {
		expect(MathParser.format(0.1 + 0.2)).toBe("0.3");
		expect(MathParser.format(1e20)).toBe("1e+20");
		expect(MathParser.format(2 / 3)).toBe("0.666666666667");
	});
});

describe("CalculatorProvider", () => {
	const calculator = new CalculatorProvider();

	test("answers arithmetic", () => {
		const answer = calculator.answer("what is 12 * 12 =");
		expect(answer?.type).toBe("calculator");
		expect(answer?.data.result).toBe("144");
	});

	test("ignores non-math queries, dates and phone numbers", () => {
		for (const query of [
			"linux kernel",
			"2026",
			"2026-09-25",
			"1-800-555-1234",
			"-5",
			"c++ tutorial",
		]) {
			expect(calculator.answer(query)).toBeNull();
		}
	});
});

describe("Unit conversion", () => {
	const converter = new UnitConverterProvider();

	test("converts length, temperature and data", () => {
		expect(converter.answer("10 km to miles")?.data.to.value).toBeCloseTo(6.21371, 4);
		expect(converter.answer("32 f in c")?.data.to.value).toBeCloseTo(0, 10);
		expect(converter.answer("100 celsius to fahrenheit")?.data.to.value).toBeCloseTo(212, 10);
		expect(converter.answer("1 gib in mb")?.data.to.value).toBeCloseTo(1073.741824, 6);
		expect(converter.answer("5 in in cm")?.data.to.value).toBeCloseTo(12.7, 10);
		expect(converter.answer("1,5 kg to g")?.data.to.value).toBeCloseTo(1500, 10);
	});

	test("rejects mismatched dimensions and unknown units", () => {
		expect(converter.answer("10 km to kg")).toBeNull();
		expect(converter.answer("10 foo to bar")).toBeNull();
		expect(converter.answer("100 usd to eur")).toBeNull();
	});

	test("unit table round-trips", () => {
		const f = Units.find("fahrenheit")!;
		const k = Units.find("kelvin")!;
		expect(Units.convert(Units.convert(98.6, f, k), k, f)).toBeCloseTo(98.6, 10);
	});
});

describe("CurrencyProvider", () => {
	const currency = new CurrencyProvider();
	const rates = offlineContext({
		fetch: async (url) => {
			expect(url).toContain("base=USD");
			return Response.json({
				amount: 1,
				base: "USD",
				date: "2026-09-24",
				rates: { EUR: 0.9, GBP: 0.75 },
			});
		},
	});

	test("converts with fetched rates", async () => {
		const answer = await currency.answer("$50 in eur", rates);
		expect(answer?.data.result).toBeCloseTo(45, 10);
		expect(answer?.data.from).toBe("USD");
	});

	test("leaves weight conversions alone", async () => {
		expect(await currency.answer("10 pounds to kg", rates)).toBeNull();
	});
});

describe("TimeProvider", () => {
	const time = new TimeProvider();

	test("local time has no timezone", async () => {
		const answer = await time.answer("what time is it", offlineContext());
		expect(answer?.data.timezone).toBeNull();
	});

	test("known cities and IANA names resolve offline", async () => {
		expect((await time.answer("time in tokyo", offlineContext()))?.data.timezone).toBe("Asia/Tokyo");
		expect((await time.answer("berlin time", offlineContext()))?.data.offset_minutes).toBe(120);
		expect((await time.answer("time in america/new_york", offlineContext()))?.data.timezone).toBe(
			"America/New_York",
		);
		expect((await time.answer("utc+5:30", offlineContext()))?.data.offset_minutes).toBe(330);
	});

	test("unknown '<x> time' phrases are not answered", async () => {
		expect(await time.answer("screen time", offlineContext())).toBeNull();
	});
});

describe("Utility providers", () => {
	test("random, dice and coin", () => {
		const random = new RandomProvider();
		const number = random.answer("random number between 5 and 6");
		expect([5, 6]).toContain(number?.data.value);
		const dice = random.answer("roll 3d6");
		expect(dice?.data.rolls).toHaveLength(3);
		expect(["Heads", "Tails"]).toContain(random.answer("flip a coin")?.data.value);
		expect(random.answer("random")).toBeNull();
	});

	test("uuid and password", () => {
		expect(new UUIDProvider().answer("generate 3 uuids")?.data.values).toHaveLength(3);
		const password = new PasswordProvider().answer("password 32");
		expect(password?.data.value).toHaveLength(32);
	});

	test("hash and encodings", () => {
		expect(new HashProvider().answer("md5 hello")?.data.value).toBe(
			"5d41402abc4b2a76b9719d911017c592",
		);
		expect(new HashProvider().answer("sha256 hello")?.data.value).toBe(
			"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
		);
		const encoding = new EncodingProvider();
		expect(encoding.answer("base64 encode hello")?.data.output).toBe("aGVsbG8=");
		expect(encoding.answer("base64 decode aGVsbG8=")?.data.output).toBe("hello");
		expect(encoding.answer("url encode a b&c")?.data.output).toBe("a%20b%26c");
	});

	test("colors", () => {
		const color = new ColorProvider();
		expect(color.answer("#ff8800")?.data.rgb).toBe("rgb(255, 136, 0)");
		expect(color.answer("rgb(0, 229, 192)")?.data.hex).toBe("#00e5c0");
		expect(color.answer("hsl(0, 100%, 50%)")?.data.hex).toBe("#ff0000");
		expect(color.answer("cafe")).toBeNull();
	});

	test("ip, user agent, timestamp and timer", () => {
		const ctx = offlineContext();
		expect(new IPProvider().answer("what is my ip", ctx)?.data.value).toBe("203.0.113.7");
		expect(new IPProvider().answer("my user agent", ctx)?.data.value).toBe("TestAgent/1.0");
		expect(new TimestampProvider().answer("unix timestamp", ctx)?.data.timestamp).toBe(1790337600);
		expect(new TimestampProvider().answer("timestamp 1700000000", ctx)?.data.iso).toBe(
			"2023-11-14T22:13:20.000Z",
		);
		expect(new TimerProvider().answer("timer 1h 30m")?.data.seconds).toBe(5400);
		expect(new TimerProvider().answer("5 minute timer")?.data.seconds).toBe(300);
		expect(new TimerProvider().answer("stopwatch")?.data.mode).toBe("stopwatch");
		expect(new TimerProvider().answer("egg timer")).toBeNull();
	});
});

describe("InstantAnswerService", () => {
	test("runs enabled providers and respects the disabled list", async () => {
		const options = {
			disabled: [],
			language: "en",
			units: "metric" as const,
			clientIP: null,
			userAgent: null,
		};
		const answers = await InstantAnswerService.run("2 + 2", {
			...options,
			disabled: ["wikipedia", "definition", "weather", "currency", "time"],
		});
		expect(answers[0]?.provider).toBe("calculator");

		const none = await InstantAnswerService.run("2 + 2", {
			...options,
			disabled: InstantAnswerService.list().map((p) => p.id),
		});
		expect(none).toHaveLength(0);
	});

	test("lists providers ordered by priority", () => {
		const list = InstantAnswerService.list();
		expect(list[0]?.id).toBe("calculator");
		expect(list.map((p) => p.id)).toContain("wikipedia");
	});
});

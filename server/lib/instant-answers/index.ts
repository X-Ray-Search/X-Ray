import { ProxyManager } from "../proxy";
import type { SearchModels } from "../search/types";
import { Logger } from "../utils/logger";
import type { InstantAnswerProvider } from "./provider";
import { CalculatorProvider } from "./providers/calculator";
import { CurrencyProvider, UnitConverterProvider } from "./providers/conversion";
import { DefinitionProvider, WikipediaPanelProvider } from "./providers/knowledge";
import { TimeProvider } from "./providers/time";
import {
	ColorProvider,
	EncodingProvider,
	HashProvider,
	IPProvider,
	LoremIpsumProvider,
	PasswordProvider,
	RandomProvider,
	TimerProvider,
	TimestampProvider,
	UUIDProvider,
} from "./providers/utilities";
import { WeatherProvider } from "./providers/weather";

/**
 * Runs the enabled instant answer providers for a query (in parallel, with a deadline) and
 * returns their answers ordered by priority. Register new providers here.
 */
export class InstantAnswerService {
	private static readonly providers = new Map<string, InstantAnswerProvider>();
	private static readonly definitions = new Map<string, InstantAnswerProvider.Definition>();

	/** Overall time budget; network providers that are slower are dropped. */
	static readonly TIMEOUT_MS = 2500;
	/** Per-request timeout of provider fetches. */
	static readonly FETCH_TIMEOUT_MS = 2000;

	static register(cls: InstantAnswerProvider.Class) {
		if (this.providers.has(cls.definition.id)) {
			throw new Error(`Instant answer provider '${cls.definition.id}' is already registered`);
		}
		this.providers.set(cls.definition.id, new cls());
		this.definitions.set(cls.definition.id, cls.definition);
		return this;
	}

	static list(): InstantAnswerProvider.Definition[] {
		return [...this.definitions.values()].sort((a, b) => a.priority - b.priority);
	}

	static async run(
		query: string,
		options: {
			disabled: readonly string[];
			language: string;
			units: "metric" | "imperial";
			clientIP: string | null;
			userAgent: string | null;
		},
	): Promise<SearchModels.InstantAnswer[]> {
		const trimmed = query.trim();
		if (!trimmed || trimmed.length > 4000) return [];

		const controller = new AbortController();
		const ctx: InstantAnswerProvider.Context = {
			language: options.language,
			units: options.units,
			clientIP: options.clientIP,
			userAgent: options.userAgent,
			now: new Date(),
			fetch: (url, init) =>
				ProxyManager.fetch(url, {
					headers: { Accept: "application/json", ...init?.headers },
					signal: AbortSignal.any([controller.signal, AbortSignal.timeout(this.FETCH_TIMEOUT_MS)]),
				}),
		};

		const active = this.list().filter((definition) => !options.disabled.includes(definition.id));
		let timer: ReturnType<typeof setTimeout> | undefined;
		const deadline = new Promise<null>((resolve) => {
			timer = setTimeout(() => {
				controller.abort();
				resolve(null);
			}, this.TIMEOUT_MS);
		});

		const answers = await Promise.all(
			active.map(async (definition) => {
				try {
					const pending = Promise.resolve(this.providers.get(definition.id)!.answer(trimmed, ctx));
					return await Promise.race([pending, deadline]);
				} catch (err) {
					if (!controller.signal.aborted) {
						Logger.debug(`Instant answer '${definition.id}' failed:`, (err as Error).message);
					}
					return null;
				}
			}),
		);
		clearTimeout(timer);
		controller.abort();

		const results = answers.filter((a): a is SearchModels.InstantAnswer => a !== null);
		// At most two top answers (the calculator and a conversion can both match) and one panel.
		const topAnswers = results.filter((a) => a.placement === "top").slice(0, 2);
		const side = results.filter((a) => a.placement === "side").slice(0, 1);
		return [...topAnswers, ...side];
	}
}

InstantAnswerService.register(CalculatorProvider)
	.register(UnitConverterProvider)
	.register(CurrencyProvider)
	.register(TimeProvider)
	.register(WeatherProvider)
	.register(TimerProvider)
	.register(RandomProvider)
	.register(UUIDProvider)
	.register(PasswordProvider)
	.register(HashProvider)
	.register(EncodingProvider)
	.register(ColorProvider)
	.register(IPProvider)
	.register(TimestampProvider)
	.register(LoremIpsumProvider)
	.register(DefinitionProvider)
	.register(WikipediaPanelProvider);

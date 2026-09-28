import type { SearchEngine } from "./base";
import { BingImagesEngine, BingNewsEngine, BingVideosEngine } from "./bing/media";
import { BingEngine } from "./bing/web";
import { BraveAPIEngine } from "./brave/api";
import { BraveImagesEngine, BraveNewsEngine, BraveVideosEngine } from "./brave/media";
import { BraveEngine } from "./brave/web";
import { DailymotionEngine } from "./dailymotion";
import {
	DuckDuckGoImagesEngine,
	DuckDuckGoNewsEngine,
	DuckDuckGoVideosEngine,
} from "./duckduckgo/media";
import { DuckDuckGoEngine } from "./duckduckgo/web";
import { EcosiaEngine } from "./ecosia";
import { GoogleCSEEngine } from "./googleCse";
import { GuardianEngine } from "./guardian";
import { HackerNewsEngine } from "./hackerNews";
import { LemmyEngine } from "./lemmy";
import { MojeekEngine } from "./mojeek";
import { OpenverseEngine } from "./openverse";
import { PeerTubeEngine } from "./peertube";
import { RedditEngine } from "./reddit";
import { SearXNGEngine } from "./searxng";
import {
	StartpageImagesEngine,
	StartpageNewsEngine,
	StartpageVideosEngine,
} from "./startpage/media";
import { StartpageEngine } from "./startpage/web";
import { WikimediaCommonsEngine } from "./wikimediaCommons";
import { WikipediaEngine } from "./wikipedia";
import { YahooEngine, YahooNewsEngine } from "./yahoo";
import { YouTubeEngine } from "./youtube";

/**
 * All search engine types known to X-Ray. Register new `SearchEngine` subclasses here — they
 * immediately show up in the admin UI (`GET /v1/admin/engines/types`) with a settings form
 * generated from their zod schema.
 */
export class SearchEngineRegistry {
	private static readonly types = new Map<string, SearchEngine.Class>();

	static register(cls: SearchEngine.Class<any>) {
		if (this.types.has(cls.definition.type)) {
			throw new Error(`Search engine type '${cls.definition.type}' is already registered`);
		}
		this.types.set(cls.definition.type, cls);
		return this;
	}

	static unregister(type: string) {
		this.types.delete(type);
	}

	static get(type: string): SearchEngine.Class | undefined {
		return this.types.get(type);
	}

	static list(): SearchEngine.Class[] {
		return [...this.types.values()];
	}
}

SearchEngineRegistry
	// Web
	.register(DuckDuckGoEngine)
	.register(BingEngine)
	.register(BraveEngine)
	.register(StartpageEngine)
	.register(GoogleCSEEngine)
	.register(YahooEngine)
	.register(MojeekEngine)
	.register(EcosiaEngine)
	.register(WikipediaEngine)
	.register(HackerNewsEngine)
	.register(RedditEngine)
	.register(LemmyEngine)
	// Images
	.register(DuckDuckGoImagesEngine)
	.register(BingImagesEngine)
	.register(BraveImagesEngine)
	.register(StartpageImagesEngine)
	.register(OpenverseEngine)
	.register(WikimediaCommonsEngine)
	// News
	.register(DuckDuckGoNewsEngine)
	.register(BingNewsEngine)
	.register(BraveNewsEngine)
	.register(StartpageNewsEngine)
	.register(YahooNewsEngine)
	.register(GuardianEngine)
	// Videos
	.register(DuckDuckGoVideosEngine)
	.register(YouTubeEngine)
	.register(BingVideosEngine)
	.register(BraveVideosEngine)
	.register(StartpageVideosEngine)
	.register(DailymotionEngine)
	.register(PeerTubeEngine)
	// Keyed / self-hosted backends
	.register(SearXNGEngine)
	.register(BraveAPIEngine);

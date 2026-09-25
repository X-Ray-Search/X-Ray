import type { SearchEngine } from "./base";
import { BingEngine } from "./bing/web";
import { BingImagesEngine, BingNewsEngine } from "./bing/media";
import { BraveEngine } from "./brave";
import { BraveAPIEngine } from "./braveApi";
import { DuckDuckGoEngine } from "./duckduckgo/web";
import { DuckDuckGoImagesEngine, DuckDuckGoNewsEngine, DuckDuckGoVideosEngine } from "./duckduckgo/media";
import { MojeekEngine } from "./mojeek";
import { SearXNGEngine } from "./searxng";
import { WikipediaEngine } from "./wikipedia";
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

SearchEngineRegistry.register(DuckDuckGoEngine)
	.register(BingEngine)
	.register(BraveEngine)
	.register(MojeekEngine)
	.register(WikipediaEngine)
	.register(DuckDuckGoImagesEngine)
	.register(BingImagesEngine)
	.register(DuckDuckGoNewsEngine)
	.register(BingNewsEngine)
	.register(DuckDuckGoVideosEngine)
	.register(YouTubeEngine)
	.register(SearXNGEngine)
	.register(BraveAPIEngine);

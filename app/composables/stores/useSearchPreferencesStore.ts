/**
 * useSearchPreferencesStore — the search preferences that apply to the current visitor.
 *
 * Signed-in users get the instance defaults merged with their personal overrides
 * (`GET /account/preferences/search`); anonymous visitors get the instance defaults from the
 * instance store. `update()` replaces the user's overrides. Clear on login/logout.
 *
 * Both requests start synchronously: on the server Nuxt composables (`useState`, `useCookie`) only
 * work before the first `await`, so nothing may call them once a request has been awaited.
 */
import { ModifiableAbstractStore } from "~/utils/abstractStore";
import type { SearchPreferenceOverrides, SearchPreferences } from "~/utils/types";
import { useInstanceStore } from "./useInstanceStore";

export interface SearchPreferencesState {
	defaults: SearchPreferences;
	overrides: SearchPreferenceOverrides;
	effective: SearchPreferences;
	/** False for anonymous visitors — they cannot store overrides. */
	personal: boolean;
}

class SearchPreferencesStore extends ModifiableAbstractStore<
	SearchPreferencesState,
	SearchPreferenceOverrides
> {
	private readonly instanceStore = useInstanceStore();

	constructor() {
		super("searchPreferences", { enableAutoFetchIfEmpty: true });
	}

	protected override async fetchData(): Promise<SearchPreferencesState | null> {
		const signedIn = !!useAppCookies().sessionToken.get().value;
		const [personal, instance] = await Promise.all([
			signedIn ? useAPI((api) => api.getAccountPreferencesSearch({}), true) : null,
			this.instanceStore.use(),
		]);

		if (personal?.success) return { ...personal.data, personal: true };
		if (!instance.value) return null;
		const defaults = instance.value.search_defaults;
		return { defaults, overrides: {}, effective: defaults, personal: false };
	}

	/** Replace the personal overrides (keys left out follow the instance default). */
	override async update(overrides: SearchPreferenceOverrides) {
		const response = await useAPI((api) => api.putAccountPreferencesSearch({ body: overrides }));
		if (!response.success) {
			throw new Error(response.message || "Failed to save your preferences.");
		}
		this.useRaw().value = { ...response.data, personal: true };
	}
}

export function useSearchPreferencesStore() {
	return new SearchPreferencesStore();
}

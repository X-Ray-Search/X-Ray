/**
 * useInstanceStore — public instance information (`GET /instance`): name, access mode, whether
 * the current visitor may search, categories, features and the instance search defaults.
 *
 * `can_search` / `authenticated` depend on the session, so refresh the store after login and
 * logout. See docs/07-state-and-data.md.
 */
import { BasicAbstractStore } from "~/utils/abstractStore";
import type { InstanceInfo } from "~/utils/types";

class InstanceStore extends BasicAbstractStore<InstanceInfo> {
	constructor() {
		super("instanceInfo", { enableAutoFetchIfEmpty: true });
	}

	protected override async fetchData() {
		const response = await useAPI((api) => api.getInstance({}), true);
		return response.success ? response.data : null;
	}
}

export function useInstanceStore() {
	return new InstanceStore();
}

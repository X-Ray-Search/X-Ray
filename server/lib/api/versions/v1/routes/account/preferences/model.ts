import { z } from "zod";
import { SettingsModels } from "../../../../../../settings/models";
import { UserPreferences } from "../../../../../utils/preferences";

export namespace AccountPreferencesModel.GetAll {
	export const Response = UserPreferences.allSchema;
	export type Response = z.infer<typeof Response>;
}

export namespace AccountPreferencesModel.Search {
	export const Response = z.object({
		defaults: SettingsModels.SearchPreferences.describe("Instance-wide defaults set by the admin"),
		overrides: SettingsModels.SearchPreferenceOverrides.describe("Your personal overrides"),
		effective: SettingsModels.SearchPreferences.describe("Defaults merged with your overrides"),
	});
	export type Response = z.infer<typeof Response>;

	/** Replace semantics: omitted keys follow the instance default again. */
	export const Body = SettingsModels.SearchPreferenceOverrides;
	export type Body = z.infer<typeof Body>;
}

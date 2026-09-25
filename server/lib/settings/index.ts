import { randomBytes } from "crypto";
import { RuntimeMetadata } from "../api/utils/metadata";
import { UserPreferencesHandler } from "../api/utils/preferences";
import { SettingsModels } from "./models";

/**
 * Instance-wide settings, search defaults and the AI config. Reads are served from an
 * in-process cache (settings are read on every search); every write invalidates it.
 *
 * Search preferences resolve in two layers: the instance defaults (admin) and the user's
 * personal overrides (`user_preferences.search`). `getEffectivePreferences` merges them.
 */
export class SettingsHandler {
	private static cache = new Map<string, unknown>();

	private static async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
		if (this.cache.has(key)) return this.cache.get(key) as T;
		const value = await load();
		this.cache.set(key, value);
		return value;
	}

	static invalidate() {
		this.cache.clear();
	}

	// ------------------------------------------------------------------ instance settings

	static async getInstance(): Promise<SettingsModels.Instance> {
		return this.cached("instance", async () => ({
			...SettingsModels.INSTANCE_DEFAULTS,
			...(await RuntimeMetadata.get("instance_settings")),
		}));
	}

	static async updateInstance(updates: Partial<SettingsModels.Instance>) {
		const next = SettingsModels.Instance.parse({ ...(await this.getInstance()), ...updates });
		await RuntimeMetadata.set("instance_settings", next);
		this.invalidate();
		return next;
	}

	// ------------------------------------------------------------------- search defaults

	static async getSearchDefaults(): Promise<SettingsModels.SearchPreferences> {
		return this.cached("search_defaults", async () => ({
			...SettingsModels.SEARCH_PREFERENCE_DEFAULTS,
			...(await RuntimeMetadata.get("search_defaults")),
		}));
	}

	static async updateSearchDefaults(updates: Partial<SettingsModels.SearchPreferences>) {
		const next = SettingsModels.SearchPreferences.parse({
			...(await this.getSearchDefaults()),
			...updates,
		});
		await RuntimeMetadata.set("search_defaults", next);
		this.invalidate();
		return next;
	}

	// -------------------------------------------------------------------- user overrides

	static async getUserOverrides(userID: number): Promise<SettingsModels.SearchPreferenceOverrides> {
		return UserPreferencesHandler.getSearchOverrides(userID);
	}

	/** Replace semantics: keys missing from `overrides` fall back to the instance default. */
	static async setUserOverrides(userID: number, overrides: SettingsModels.SearchPreferenceOverrides) {
		const cleaned = Object.fromEntries(
			Object.entries(overrides).filter(([, value]) => value !== undefined && value !== null),
		) as SettingsModels.SearchPreferenceOverrides;
		await UserPreferencesHandler.setSearchOverrides(userID, cleaned);
		return cleaned;
	}

	/** Instance defaults merged with the user's overrides (anonymous users get the defaults). */
	static async getEffectivePreferences(
		userID: number | null,
	): Promise<SettingsModels.SearchPreferences> {
		const defaults = await this.getSearchDefaults();
		if (userID === null) return defaults;
		return { ...defaults, ...(await this.getUserOverrides(userID)) };
	}

	// ------------------------------------------------------------------------- AI config

	static async getAIConfig(): Promise<SettingsModels.AIConfig> {
		return this.cached("ai_config", async () => ({
			...SettingsModels.AI_DEFAULTS,
			...(await RuntimeMetadata.get("ai_config")),
		}));
	}

	static async updateAIConfig(updates: Partial<SettingsModels.AIConfig>) {
		const next = SettingsModels.AIConfig.parse({ ...(await this.getAIConfig()), ...updates });
		await RuntimeMetadata.set("ai_config", next);
		this.invalidate();
		return next;
	}

	static toPublicAIConfig(config: SettingsModels.AIConfig): SettingsModels.AIConfigPublic {
		const { api_key, ...rest } = config;
		return { ...rest, api_key_set: api_key.length > 0 };
	}

	/** Whether the admin configured a usable AI endpoint. */
	static async isAIAvailable() {
		const config = await this.getAIConfig();
		return config.enabled && config.base_url.length > 0 && config.model.length > 0;
	}

	// --------------------------------------------------------------------------- secrets

	/** HMAC key for signed image-proxy URLs, generated on first use. */
	static async getImageProxyKey(): Promise<string> {
		return this.cached("image_proxy_key", async () => {
			const secrets = await RuntimeMetadata.get("secrets");
			if (secrets.image_proxy_key) return secrets.image_proxy_key;

			const key = randomBytes(32).toString("hex");
			await RuntimeMetadata.set("secrets", { ...secrets, image_proxy_key: key });
			return key;
		});
	}
}

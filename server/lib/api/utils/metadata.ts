import { eq } from "drizzle-orm";
import { DB } from "../../db/index";
import { z } from "zod";
import { SettingsModels } from "../../settings/models";

/**
 * Schemaless-at-rest, schema-validated-on-read key/value store over the `metadata` table.
 * Each key has a fixed zod schema; values are stored raw and merged over defaults on read.
 */
export class RuntimeMetadata {
	static readonly schemas = {
		instance_settings: SettingsModels.Instance.partial(),
		search_defaults: SettingsModels.SearchPreferenceOverrides,
		ai_config: SettingsModels.AIConfig.partial(),
		secrets: SettingsModels.Secrets.partial(),
		ddg_bangs_status: SettingsModels.BangDatasetStatus.partial(),
	} as const;

	static async get<T extends RuntimeMetadata.Key>(key: T): Promise<RuntimeMetadata.Value<T>> {
		const record = await DB.instance()
			.select()
			.from(DB.Tables.metadata)
			.where(eq(DB.Tables.metadata.key, key))
			.get();

		// Stored values from older versions may contain keys that no longer validate — drop the
		// whole value in that case instead of failing every read.
		const parsed = this.schemas[key].safeParse(record?.data ?? {});
		return (parsed.success ? parsed.data : {}) as RuntimeMetadata.Value<T>;
	}

	static async set<T extends RuntimeMetadata.Key>(
		key: T,
		data: RuntimeMetadata.Value<T>,
	): Promise<void> {
		const parsed = this.schemas[key].parse(data) as Record<string, any>;

		await DB.instance()
			.insert(DB.Tables.metadata)
			.values({ key, data: parsed })
			.onConflictDoUpdate({
				target: DB.Tables.metadata.key,
				set: { data: parsed },
			});
	}
}

export namespace RuntimeMetadata {
	export type Key = keyof (typeof RuntimeMetadata)["schemas"];
	export type Value<T extends Key> = z.infer<(typeof RuntimeMetadata)["schemas"][T]>;
}

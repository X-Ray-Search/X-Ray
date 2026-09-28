import { and, eq, isNull } from "drizzle-orm";
import type { CustomBangModels } from "../api/utils/shared-models/bangs";
import { DB } from "../db";
import { BangService } from ".";

/**
 * CRUD for custom bangs. `ownerID = null` manages the instance-wide bangs, a user id the
 * personal bangs of that user. Keeps the in-memory bang index in sync.
 */
export class CustomBangs {
	private static ownerFilter(ownerID: number | null) {
		return ownerID === null
			? isNull(DB.Tables.bangs.owner_user_id)
			: eq(DB.Tables.bangs.owner_user_id, ownerID);
	}

	private static strip(row: DB.Models.Bang): CustomBangModels.Bang {
		const { owner_user_id, ...rest } = row;
		return rest;
	}

	private static async afterChange(ownerID: number | null) {
		if (ownerID === null) await BangService.reloadInstanceBangs();
		else BangService.invalidateUser(ownerID);
	}

	static async list(ownerID: number | null) {
		const rows = await DB.instance()
			.select()
			.from(DB.Tables.bangs)
			.where(this.ownerFilter(ownerID))
			.orderBy(DB.Tables.bangs.trigger)
			.all();
		return rows.map((row) => this.strip(row));
	}

	private static async findByTrigger(ownerID: number | null, trigger: string) {
		return DB.instance()
			.select()
			.from(DB.Tables.bangs)
			.where(and(this.ownerFilter(ownerID), eq(DB.Tables.bangs.trigger, trigger)))
			.get();
	}

	static async create(
		ownerID: number | null,
		body: CustomBangModels.Body,
	): Promise<CustomBangModels.Bang | "conflict"> {
		if (await this.findByTrigger(ownerID, body.trigger)) return "conflict";
		const row = await DB.instance()
			.insert(DB.Tables.bangs)
			.values({ ...body, owner_user_id: ownerID })
			.returning()
			.get();
		await this.afterChange(ownerID);
		return this.strip(row);
	}

	static async update(
		ownerID: number | null,
		id: number,
		body: CustomBangModels.Body,
	): Promise<CustomBangModels.Bang | "not_found" | "conflict"> {
		const existing = await DB.instance()
			.select()
			.from(DB.Tables.bangs)
			.where(and(this.ownerFilter(ownerID), eq(DB.Tables.bangs.id, id)))
			.get();
		if (!existing) return "not_found";

		const clash = await this.findByTrigger(ownerID, body.trigger);
		if (clash && clash.id !== id) return "conflict";

		const row = await DB.instance()
			.update(DB.Tables.bangs)
			.set(body)
			.where(eq(DB.Tables.bangs.id, id))
			.returning()
			.get();
		await this.afterChange(ownerID);
		return this.strip(row);
	}

	static async delete(ownerID: number | null, id: number): Promise<boolean> {
		const deleted = await DB.instance()
			.delete(DB.Tables.bangs)
			.where(and(this.ownerFilter(ownerID), eq(DB.Tables.bangs.id, id)))
			.returning()
			.all();
		if (!deleted.length) return false;
		await this.afterChange(ownerID);
		return true;
	}
}

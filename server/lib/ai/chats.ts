import { and, asc, desc, eq, exists, inArray, lt, notExists } from "drizzle-orm";
import { DB } from "../db";
import type { DrizzleDB } from "../db/utils";
import type { AIService } from ".";

/**
 * Stored AI conversations ("AI mode"). A chat belongs to one user and is a sequence of turns:
 * the user's message followed by the assistant's answer with the sources it cites.
 *
 * A chat is created before its first message is sent (the client then streams into it), so
 * chats without messages are hidden from the history and cleaned up after a day.
 */
export class AIChats {
	static readonly NEW_CHAT_TITLE = "New chat";
	private static readonly TITLE_LENGTH = 80;
	private static readonly EMPTY_CHAT_TTL_MS = 24 * 60 * 60 * 1000;

	static titleFor(text: string) {
		const line = text.replace(/\s+/g, " ").trim();
		if (!line) return this.NEW_CHAT_TITLE;
		return line.length > this.TITLE_LENGTH ? `${line.slice(0, this.TITLE_LENGTH - 1)}…` : line;
	}

	private static hasMessages() {
		return DB.instance()
			.select({ id: DB.Tables.aiChatMessages.id })
			.from(DB.Tables.aiChatMessages)
			.where(eq(DB.Tables.aiChatMessages.chat_id, DB.Tables.aiChats.id));
	}

	/** The user's chats that have messages, most recently active first. */
	static async list(userID: number, limit = 200): Promise<AIChats.Summary[]> {
		const { id, title, created_at, updated_at } = DB.Tables.aiChats;
		return DB.instance()
			.select({ id, title, created_at, updated_at })
			.from(DB.Tables.aiChats)
			.where(and(eq(DB.Tables.aiChats.user_id, userID), exists(this.hasMessages())))
			.orderBy(desc(updated_at), desc(id))
			.limit(limit)
			.all();
	}

	static async get(userID: number, chatID: number): Promise<AIChats.Summary | null> {
		const { id, title, created_at, updated_at } = DB.Tables.aiChats;
		const chat = await DB.instance()
			.select({ id, title, created_at, updated_at })
			.from(DB.Tables.aiChats)
			.where(and(eq(DB.Tables.aiChats.id, chatID), eq(DB.Tables.aiChats.user_id, userID)))
			.get();
		return chat ?? null;
	}

	static async messages(chatID: number): Promise<AIChats.Message[]> {
		const rows = await DB.instance()
			.select()
			.from(DB.Tables.aiChatMessages)
			.where(eq(DB.Tables.aiChatMessages.chat_id, chatID))
			.orderBy(asc(DB.Tables.aiChatMessages.id))
			.all();
		return rows.map(({ chat_id, ...message }) => message);
	}

	/** Create a chat, optionally seeded with complete turns (e.g. the AI answer of a search). */
	static async create(userID: number, seed: readonly AIChats.NewMessage[] = []) {
		const firstQuestion = seed.find((m) => m.role === "user")?.content ?? "";

		const chat = await DB.instance().transaction(async (tx: DrizzleDB) => {
			await this.deleteStaleEmptyChats(userID, tx);
			const row = await tx
				.insert(DB.Tables.aiChats)
				.values({ user_id: userID, title: this.titleFor(firstQuestion) })
				.returning()
				.get();
			if (seed.length) {
				// A seeded answer was grounded in a search for the question before it.
				await tx
					.insert(DB.Tables.aiChatMessages)
					.values(
						seed.map((m, i) => ({
							search_query: m.role === "assistant" ? (seed[i - 1]?.content ?? null) : null,
							...m,
							chat_id: row.id,
						})),
					)
					.run();
			}
			return row;
		});

		return (await this.get(userID, chat.id)) as AIChats.Summary;
	}

	/**
	 * Store a finished turn and bump the chat in the history. The first turn of an empty chat
	 * also names it after the question.
	 */
	static async addTurn(
		chatID: number,
		question: string,
		answer: Omit<AIChats.NewMessage, "role" | "content"> & { content: string },
	): Promise<AIChats.Message> {
		return DB.instance().transaction(async (tx: DrizzleDB) => {
			const chat = await tx
				.select()
				.from(DB.Tables.aiChats)
				.where(eq(DB.Tables.aiChats.id, chatID))
				.get();
			const now = Date.now();

			await tx
				.insert(DB.Tables.aiChatMessages)
				.values({ chat_id: chatID, role: "user", content: question, created_at: now })
				.run();
			const { chat_id, ...message } = await tx
				.insert(DB.Tables.aiChatMessages)
				.values({ chat_id: chatID, role: "assistant", created_at: now, ...answer })
				.returning()
				.get();

			await tx
				.update(DB.Tables.aiChats)
				.set({
					updated_at: now,
					...(chat?.title === this.NEW_CHAT_TITLE ? { title: this.titleFor(question) } : {}),
				})
				.where(eq(DB.Tables.aiChats.id, chatID))
				.run();

			return message;
		});
	}

	static async delete(userID: number, chatID: number): Promise<boolean> {
		if (!(await this.get(userID, chatID))) return false;
		await DB.instance().transaction(async (tx: DrizzleDB) => {
			await tx
				.delete(DB.Tables.aiChatMessages)
				.where(eq(DB.Tables.aiChatMessages.chat_id, chatID))
				.run();
			await tx.delete(DB.Tables.aiChats).where(eq(DB.Tables.aiChats.id, chatID)).run();
		});
		return true;
	}

	/** Used when an account is deleted. */
	static async deleteAllForUser(userID: number, tx: DrizzleDB = DB.instance()) {
		const chatIDs = tx
			.select({ id: DB.Tables.aiChats.id })
			.from(DB.Tables.aiChats)
			.where(eq(DB.Tables.aiChats.user_id, userID));
		await tx
			.delete(DB.Tables.aiChatMessages)
			.where(inArray(DB.Tables.aiChatMessages.chat_id, chatIDs))
			.run();
		await tx.delete(DB.Tables.aiChats).where(eq(DB.Tables.aiChats.user_id, userID)).run();
	}

	private static async deleteStaleEmptyChats(userID: number, tx: DrizzleDB) {
		await tx
			.delete(DB.Tables.aiChats)
			.where(
				and(
					eq(DB.Tables.aiChats.user_id, userID),
					lt(DB.Tables.aiChats.created_at, Date.now() - this.EMPTY_CHAT_TTL_MS),
					notExists(this.hasMessages()),
				),
			)
			.run();
	}
}

export namespace AIChats {
	export type Summary = Pick<DB.Models.AIChat, "id" | "title" | "created_at" | "updated_at">;
	export type Message = Omit<DB.Models.AIChatMessage, "chat_id">;

	export interface NewMessage {
		role: AIService.ChatMessage["role"];
		content: string;
		sources?: AIService.Source[];
		search_query?: string | null;
	}
}

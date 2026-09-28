import type { Context } from "hono";
import { SearchService } from "../../search/service";
import { SettingsHandler } from "../../settings";
import type { SettingsModels } from "../../settings/models";
import { APIResponse } from "./api-res";
import { AuthHandler } from "./authHandler";
import { RequestInfo } from "./requestInfo";

/**
 * Gate for the AI endpoints. AI answers are for signed-in users only — also on public
 * instances, where anonymous visitors can search but not use the (costly) AI endpoint. They
 * also need an AI endpoint configured by the admin and respect the user's `ai_mode`.
 */
export class AIAccess {
	/** Signed-in callers only (session or API key). */
	static authenticate(c: Context): AIAccess.UserResult {
		const authContext = AuthHandler.AuthContext.get(c);
		if (authContext.type === "unauthenticated") {
			return { ok: false, response: APIResponse.unauthorized(c, "Sign in to use AI answers") };
		}
		return {
			ok: true,
			userID: authContext.user_id,
			// Only admins get to see which model answered.
			showModel: authContext.user_role === "admin",
		};
	}

	/** Signed in, AI configured and not turned off in the user's preferences. */
	static async check(c: Context): Promise<AIAccess.Result> {
		const user = this.authenticate(c);
		if (!user.ok) return user;

		const [preferences, available] = await Promise.all([
			SettingsHandler.getEffectivePreferences(user.userID),
			SettingsHandler.isAIAvailable(),
		]);
		if (!available || preferences.ai_mode === "off") {
			return { ok: false, response: APIResponse.forbidden(c, "AI answers are not available") };
		}
		return { ...user, preferences, config: await SettingsHandler.getAIConfig() };
	}

	/**
	 * The top search results an answer is grounded in. Reuses the cached results page of the
	 * normal search in the common case.
	 */
	static async groundingResults(
		c: Context,
		access: Extract<AIAccess.Result, { ok: true }>,
		query: string,
		language?: string,
	) {
		const search = await SearchService.search(
			{ query, category: "general", page: 1, language, instantAnswers: false },
			{
				userID: access.userID,
				preferences: access.preferences,
				clientIP: RequestInfo.clientIP(c),
				userAgent: RequestInfo.userAgent(c),
				resolveBangs: false,
				imageProxy: false,
			},
		);
		return search.results.slice(0, access.config.context_results);
	}
}

export namespace AIAccess {
	type Failure = { ok: false; response: Response };

	export type UserResult = { ok: true; userID: number; showModel: boolean } | Failure;

	export type Result =
		| {
				ok: true;
				userID: number;
				showModel: boolean;
				preferences: SettingsModels.SearchPreferences;
				config: SettingsModels.AIConfig;
		  }
		| Failure;
}

import type {
	GetAccountApikeysResponses,
	GetAccountBangsResponses,
	GetAccountPreferencesSearchResponses,
	GetAccountResponses,
	GetAdminEnginesResponses,
	GetAdminEnginesTypesResponses,
	GetAdminProxiesResponses,
	GetAdminProxiesTypesResponses,
	GetAiChatsByChatIdResponses,
	GetAiChatsResponses,
	GetInstanceResponses,
	GetSearchAutocompleteResponses,
	GetSearchResponses,
	PostAccountApikeysData,
	PostAiChatsByChatIdMessagesResponses,
	PostAiChatsData,
} from "~/api-client";

export namespace UtilityTypes {
	export type SomePartial<T, K extends keyof T> = Partial<Pick<T, K>> & Omit<T, K>;
}

export type UserInfo = GetAccountResponses["200"]["data"];

export type APIKey = GetAccountApikeysResponses["200"]["data"][number];
export type NewAPIKey = NonNullable<PostAccountApikeysData["body"]>;

export type InstanceInfo = GetInstanceResponses["200"]["data"];

export type SearchResponse = GetSearchResponses["200"]["data"];
export type SearchResult = SearchResponse["results"][number];
export type InstantAnswer = SearchResponse["instant_answers"][number];
export type EngineStatus = SearchResponse["engines"][number];
export type SearchCategory = SearchResponse["category"];
export type TimeRange = "day" | "week" | "month" | "year";

export type BangSuggestion = GetSearchAutocompleteResponses["200"]["data"]["bangs"][number];

export type SearchPreferences = GetAccountPreferencesSearchResponses["200"]["data"]["effective"];
export type SearchPreferenceOverrides =
	GetAccountPreferencesSearchResponses["200"]["data"]["overrides"];

export type CustomBang = GetAccountBangsResponses["200"]["data"][number];

export type AdminEngine = GetAdminEnginesResponses["200"]["data"][number];
export type EngineType = GetAdminEnginesTypesResponses["200"]["data"][number];
export type AdminProxy = GetAdminProxiesResponses["200"]["data"][number];
export type ProxyType = GetAdminProxiesTypesResponses["200"]["data"][number];

export type AIChatSummary = GetAiChatsResponses["200"]["data"][number];
export type AIChat = GetAiChatsByChatIdResponses["200"]["data"];
export type AIChatMessage = AIChat["messages"][number];
export type AIChatSource = AIChatMessage["sources"][number];
export type AIChatSeedMessage = NonNullable<PostAiChatsData["body"]["messages"]>[number];
export type AIChatTurnResult = PostAiChatsByChatIdMessagesResponses["200"]["data"];

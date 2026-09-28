import * as z from "zod";

/** Mirrors `UserDataPolicies.Password` on the server so users see the reason before submitting. */
export const passwordPolicy = z
	.string("Password is required")
	.min(8, "Must be at least 8 characters")
	.max(50, "Must be at most 50 characters")
	.regex(
		/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).+$/,
		"Use upper- and lowercase letters, a number and a special character",
	);

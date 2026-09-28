export namespace AppConstants {
	export const APP_NAME = "X-Ray";

	/** Injected by the compile script / CI; `dev` for local runs. */
	export const APP_VERSION = process.env.APP_VERSION || "0.1.0-dev";

	export const APP_ENV_PREFIX = "XRAY";

	export const APP_KEYS_PREFIX = "xray";

	export const APP_DEFAULT_PORT = 12418;

	export const DEFAULT_EMAIL_FROM_HOST = "xray.local";

	export const DEFAULT_SMTP_FROM = `"${AppConstants.APP_NAME}" <noreply@${AppConstants.DEFAULT_EMAIL_FROM_HOST}>`;

	export const BINARY_NAME = "x-ray";

	/** Sent to APIs that ask clients to identify themselves (Wikipedia, Wiktionary, …). */
	export const BOT_USER_AGENT = `${AppConstants.APP_NAME}/1.0 (+https://git.leicraftmc.de/X-Ray-Search/X-Ray)`;
}

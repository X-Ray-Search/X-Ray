import { TTLCache } from "../../search/cache";
import { SearchUtils } from "../../search/utils";
import { InstantAnswerProvider } from "../provider";

/** WMO weather interpretation codes → description + Lucide icon. */
const WEATHER_CODES: Record<number, [string, string]> = {
	0: ["Clear sky", "sun"],
	1: ["Mainly clear", "sun"],
	2: ["Partly cloudy", "cloud-sun"],
	3: ["Overcast", "cloud"],
	45: ["Fog", "cloud-fog"],
	48: ["Depositing rime fog", "cloud-fog"],
	51: ["Light drizzle", "cloud-drizzle"],
	53: ["Drizzle", "cloud-drizzle"],
	55: ["Dense drizzle", "cloud-drizzle"],
	56: ["Freezing drizzle", "cloud-drizzle"],
	57: ["Freezing drizzle", "cloud-drizzle"],
	61: ["Light rain", "cloud-rain"],
	63: ["Rain", "cloud-rain"],
	65: ["Heavy rain", "cloud-rain"],
	66: ["Freezing rain", "cloud-rain"],
	67: ["Freezing rain", "cloud-rain"],
	71: ["Light snow", "cloud-snow"],
	73: ["Snow", "cloud-snow"],
	75: ["Heavy snow", "cloud-snow"],
	77: ["Snow grains", "cloud-snow"],
	80: ["Rain showers", "cloud-rain"],
	81: ["Rain showers", "cloud-rain"],
	82: ["Violent rain showers", "cloud-rain"],
	85: ["Snow showers", "cloud-snow"],
	86: ["Heavy snow showers", "cloud-snow"],
	95: ["Thunderstorm", "cloud-lightning"],
	96: ["Thunderstorm with hail", "cloud-lightning"],
	99: ["Thunderstorm with heavy hail", "cloud-lightning"],
};

function describe(code: number) {
	const [description, icon] = WEATHER_CODES[code] ?? ["Unknown", "cloud"];
	return { description, icon: `i-lucide-${icon}` };
}

/** Weather via Open-Meteo (geocoding + forecast, no API key). */
export class WeatherProvider extends InstantAnswerProvider {
	static readonly definition = InstantAnswerProvider.define({
		id: "weather",
		name: "Weather",
		description: "Current weather and a 5-day forecast for a place (Open-Meteo).",
		priority: 30,
		network: true,
		examples: ["weather berlin", "tokyo weather", "forecast new york"],
	});

	private static readonly cache = new TTLCache<Record<string, any>>(256, 10 * 60_000);

	private static parseLocation(query: string): string | null {
		const q = query.trim().toLowerCase().replace(/\?$/, "");
		const match =
			q.match(/^(?:weather|wetter|météo|meteo|forecast|weather forecast)\s+(?:in\s+|for\s+|at\s+)?(.{2,60})$/) ??
			q.match(/^(?:what(?:'s|\s+is)\s+the\s+)?weather\s+(?:like\s+)?(?:in|at)\s+(.{2,60})$/) ??
			q.match(/^(.{2,60}?)\s+(?:weather|wetter|forecast)(?:\s+(?:today|tomorrow|now))?$/);
		return match?.[1]?.trim() ?? null;
	}

	async answer(query: string, ctx: InstantAnswerProvider.Context) {
		const location = WeatherProvider.parseLocation(query);
		if (!location) return null;

		const language = SearchUtils.parseLocale(ctx.language).language ?? "en";
		const cacheKey = `${location}|${ctx.units}|${language}`;
		let data = WeatherProvider.cache.get(cacheKey);

		if (!data) {
			const geoRes = await ctx.fetch(
				`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: location, count: "1", language, format: "json" })}`,
			);
			if (!geoRes.ok) return null;
			const geo = ((await geoRes.json()) as { results?: any[] }).results?.[0];
			if (!geo) return null;

			const imperial = ctx.units === "imperial";
			const params = new URLSearchParams({
				latitude: String(geo.latitude),
				longitude: String(geo.longitude),
				current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day",
				daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
				timezone: "auto",
				forecast_days: "5",
				temperature_unit: imperial ? "fahrenheit" : "celsius",
				wind_speed_unit: imperial ? "mph" : "kmh",
			});
			const res = await ctx.fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
			if (!res.ok) return null;
			const forecast = (await res.json()) as any;

			data = {
				location: {
					name: geo.name,
					region: geo.admin1 ?? null,
					country: geo.country ?? null,
					latitude: geo.latitude,
					longitude: geo.longitude,
					timezone: forecast.timezone ?? geo.timezone ?? null,
				},
				units: {
					temperature: imperial ? "°F" : "°C",
					wind_speed: imperial ? "mph" : "km/h",
				},
				current: {
					temperature: forecast.current?.temperature_2m,
					apparent_temperature: forecast.current?.apparent_temperature,
					humidity: forecast.current?.relative_humidity_2m,
					wind_speed: forecast.current?.wind_speed_10m,
					is_day: forecast.current?.is_day === 1,
					weather_code: forecast.current?.weather_code,
					...describe(forecast.current?.weather_code),
				},
				daily: (forecast.daily?.time ?? []).map((date: string, i: number) => ({
					date,
					max: forecast.daily.temperature_2m_max?.[i],
					min: forecast.daily.temperature_2m_min?.[i],
					precipitation_probability: forecast.daily.precipitation_probability_max?.[i] ?? null,
					weather_code: forecast.daily.weather_code?.[i],
					...describe(forecast.daily.weather_code?.[i]),
				})),
			};
			WeatherProvider.cache.set(cacheKey, data);
		}

		const place = [data.location.name, data.location.country].filter(Boolean).join(", ");
		return {
			provider: WeatherProvider.definition.id,
			type: "weather",
			placement: "top" as const,
			title: `Weather in ${place}`,
			text: `${place}: ${data.current.temperature}${data.units.temperature}, ${data.current.description}`,
			data,
			source: { name: "Open-Meteo", url: "https://open-meteo.com" },
		};
	}
}

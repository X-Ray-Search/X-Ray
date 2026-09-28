/**
 * Unit table for the converter. Every unit converts to its dimension's base unit with
 * `base = (value + offset) * factor` (offset is only used for temperatures).
 */
export namespace Units {
	export type Dimension =
		| "length"
		| "mass"
		| "temperature"
		| "volume"
		| "area"
		| "speed"
		| "time"
		| "data"
		| "energy"
		| "pressure"
		| "power"
		| "angle"
		| "frequency";

	export interface Unit {
		id: string;
		label: string;
		dimension: Dimension;
		factor: number;
		offset?: number;
		aliases: string[];
	}

	const u = (
		dimension: Dimension,
		id: string,
		label: string,
		factor: number,
		aliases: string[],
		offset?: number,
	): Unit => ({ id, label, dimension, factor, offset, aliases: [id, ...aliases] });

	export const ALL: Unit[] = [
		// length (m)
		u("length", "m", "meters", 1, ["meter", "meters", "metre", "metres"]),
		u("length", "km", "kilometers", 1000, [
			"kilometer",
			"kilometers",
			"kilometre",
			"kilometres",
			"kms",
		]),
		u("length", "cm", "centimeters", 0.01, [
			"centimeter",
			"centimeters",
			"centimetre",
			"centimetres",
		]),
		u("length", "mm", "millimeters", 0.001, [
			"millimeter",
			"millimeters",
			"millimetre",
			"millimetres",
		]),
		u("length", "µm", "micrometers", 1e-6, ["um", "micrometer", "micrometers", "micron", "microns"]),
		u("length", "nm", "nanometers", 1e-9, ["nanometer", "nanometers"]),
		u("length", "mi", "miles", 1609.344, ["mile", "miles"]),
		u("length", "yd", "yards", 0.9144, ["yard", "yards"]),
		u("length", "ft", "feet", 0.3048, ["foot", "feet", "'"]),
		u("length", "in", "inches", 0.0254, ["inch", "inches", '"']),
		u("length", "nmi", "nautical miles", 1852, ["nautical mile", "nautical miles"]),
		u("length", "au", "astronomical units", 149_597_870_700, [
			"astronomical unit",
			"astronomical units",
		]),
		u("length", "ly", "light years", 9.4607304725808e15, [
			"light year",
			"light years",
			"lightyear",
			"lightyears",
		]),
		// mass (kg)
		u("mass", "kg", "kilograms", 1, ["kilogram", "kilograms", "kilo", "kilos", "kgs"]),
		u("mass", "g", "grams", 0.001, ["gram", "grams", "gr"]),
		u("mass", "mg", "milligrams", 1e-6, ["milligram", "milligrams"]),
		u("mass", "µg", "micrograms", 1e-9, ["ug", "mcg", "microgram", "micrograms"]),
		u("mass", "t", "tonnes", 1000, ["tonne", "tonnes", "metric ton", "metric tons"]),
		u("mass", "lb", "pounds", 0.45359237, ["lbs", "pound", "pounds"]),
		u("mass", "oz", "ounces", 0.028349523125, ["ounce", "ounces"]),
		u("mass", "st", "stone", 6.35029318, ["stone", "stones"]),
		u("mass", "ton", "short tons", 907.18474, ["tons", "short ton", "short tons"]),
		// temperature (K)
		u(
			"temperature",
			"°C",
			"degrees Celsius",
			1,
			["c", "°c", "celsius", "degc", "degrees celsius"],
			273.15,
		),
		u(
			"temperature",
			"°F",
			"degrees Fahrenheit",
			5 / 9,
			["f", "°f", "fahrenheit", "degf", "degrees fahrenheit"],
			459.67,
		),
		u("temperature", "K", "kelvin", 1, ["k", "kelvin", "kelvins"], 0),
		// volume (l)
		u("volume", "l", "liters", 1, ["liter", "liters", "litre", "litres", "ltr"]),
		u("volume", "ml", "milliliters", 0.001, [
			"milliliter",
			"milliliters",
			"millilitre",
			"millilitres",
		]),
		u("volume", "cl", "centiliters", 0.01, ["centiliter", "centiliters"]),
		u("volume", "dl", "deciliters", 0.1, ["deciliter", "deciliters"]),
		u("volume", "m³", "cubic meters", 1000, [
			"m3",
			"cubic meter",
			"cubic meters",
			"cubic metre",
			"cubic metres",
		]),
		u("volume", "gal", "US gallons", 3.785411784, ["gallon", "gallons", "us gallon", "us gallons"]),
		u("volume", "imp gal", "imperial gallons", 4.54609, [
			"imperial gallon",
			"imperial gallons",
			"uk gallon",
			"uk gallons",
		]),
		u("volume", "qt", "US quarts", 0.946352946, ["quart", "quarts"]),
		u("volume", "pt", "US pints", 0.473176473, ["pint", "pints"]),
		u("volume", "cup", "US cups", 0.2365882365, ["cups"]),
		u("volume", "fl oz", "US fluid ounces", 0.0295735295625, ["floz", "fluid ounce", "fluid ounces"]),
		u("volume", "tbsp", "tablespoons", 0.01478676478125, ["tablespoon", "tablespoons"]),
		u("volume", "tsp", "teaspoons", 0.00492892159375, ["teaspoon", "teaspoons"]),
		// area (m²)
		u("area", "m²", "square meters", 1, [
			"m2",
			"sqm",
			"square meter",
			"square meters",
			"square metre",
			"square metres",
		]),
		u("area", "km²", "square kilometers", 1e6, ["km2", "square kilometer", "square kilometers"]),
		u("area", "cm²", "square centimeters", 1e-4, ["cm2", "square centimeter", "square centimeters"]),
		u("area", "ha", "hectares", 10_000, ["hectare", "hectares"]),
		u("area", "ac", "acres", 4046.8564224, ["acre", "acres"]),
		u("area", "ft²", "square feet", 0.09290304, [
			"ft2",
			"sqft",
			"sq ft",
			"square foot",
			"square feet",
		]),
		u("area", "in²", "square inches", 0.00064516, ["in2", "sq in", "square inch", "square inches"]),
		u("area", "mi²", "square miles", 2_589_988.110336, [
			"mi2",
			"sq mi",
			"square mile",
			"square miles",
		]),
		// speed (m/s)
		u("speed", "m/s", "meters per second", 1, ["mps", "meters per second"]),
		u("speed", "km/h", "kilometers per hour", 1 / 3.6, ["kmh", "kph", "kmph", "kilometers per hour"]),
		u("speed", "mph", "miles per hour", 0.44704, ["miles per hour", "mi/h"]),
		u("speed", "kn", "knots", 1852 / 3600, ["knot", "knots", "kt", "kts"]),
		u("speed", "ft/s", "feet per second", 0.3048, ["fps", "feet per second"]),
		// time (s)
		u("time", "ms", "milliseconds", 0.001, ["millisecond", "milliseconds"]),
		u("time", "s", "seconds", 1, ["sec", "secs", "second", "seconds"]),
		u("time", "min", "minutes", 60, ["mins", "minute", "minutes"]),
		u("time", "h", "hours", 3600, ["hr", "hrs", "hour", "hours"]),
		u("time", "d", "days", 86_400, ["day", "days"]),
		u("time", "wk", "weeks", 604_800, ["week", "weeks"]),
		u("time", "mo", "months", 2_629_746, ["month", "months"]),
		u("time", "yr", "years", 31_556_952, ["year", "years"]),
		// data (bytes)
		u("data", "B", "bytes", 1, ["b", "byte", "bytes"]),
		u("data", "bit", "bits", 1 / 8, ["bits"]),
		u("data", "kB", "kilobytes", 1e3, ["kb", "kilobyte", "kilobytes"]),
		u("data", "MB", "megabytes", 1e6, ["mb", "megabyte", "megabytes"]),
		u("data", "GB", "gigabytes", 1e9, ["gb", "gigabyte", "gigabytes"]),
		u("data", "TB", "terabytes", 1e12, ["tb", "terabyte", "terabytes"]),
		u("data", "PB", "petabytes", 1e15, ["pb", "petabyte", "petabytes"]),
		u("data", "KiB", "kibibytes", 1024, ["kib", "kibibyte", "kibibytes"]),
		u("data", "MiB", "mebibytes", 1024 ** 2, ["mib", "mebibyte", "mebibytes"]),
		u("data", "GiB", "gibibytes", 1024 ** 3, ["gib", "gibibyte", "gibibytes"]),
		u("data", "TiB", "tebibytes", 1024 ** 4, ["tib", "tebibyte", "tebibytes"]),
		u("data", "kbit", "kilobits", 125, ["kbits", "kilobit", "kilobits"]),
		u("data", "Mbit", "megabits", 125_000, ["mbits", "megabit", "megabits"]),
		u("data", "Gbit", "gigabits", 125_000_000, ["gbits", "gigabit", "gigabits"]),
		// energy (J)
		u("energy", "J", "joules", 1, ["j", "joule", "joules"]),
		u("energy", "kJ", "kilojoules", 1000, ["kj", "kilojoule", "kilojoules"]),
		u("energy", "cal", "calories", 4.184, ["calorie", "calories"]),
		u("energy", "kcal", "kilocalories", 4184, ["kilocalorie", "kilocalories"]),
		u("energy", "Wh", "watt hours", 3600, ["wh", "watt hour", "watt hours"]),
		u("energy", "kWh", "kilowatt hours", 3.6e6, ["kwh", "kilowatt hour", "kilowatt hours"]),
		// pressure (Pa)
		u("pressure", "Pa", "pascals", 1, ["pa", "pascal", "pascals"]),
		u("pressure", "hPa", "hectopascals", 100, ["hpa", "hectopascal", "hectopascals"]),
		u("pressure", "kPa", "kilopascals", 1000, ["kpa", "kilopascal", "kilopascals"]),
		u("pressure", "bar", "bar", 1e5, ["bars"]),
		u("pressure", "mbar", "millibar", 100, ["millibar", "millibars"]),
		u("pressure", "psi", "pounds per square inch", 6894.757293168, []),
		u("pressure", "atm", "atmospheres", 101_325, ["atmosphere", "atmospheres"]),
		u("pressure", "mmHg", "millimeters of mercury", 133.322387415, ["mmhg", "torr"]),
		// power (W)
		u("power", "W", "watts", 1, ["w", "watt", "watts"]),
		u("power", "kW", "kilowatts", 1000, ["kw", "kilowatt", "kilowatts"]),
		u("power", "hp", "horsepower", 745.69987158227, ["horsepower", "bhp"]),
		u("power", "PS", "metric horsepower", 735.49875, ["ps", "metric horsepower"]),
		// angle (rad)
		u("angle", "rad", "radians", 1, ["radian", "radians"]),
		u("angle", "°", "degrees", Math.PI / 180, ["deg", "degree", "degrees"]),
		u("angle", "grad", "gradians", Math.PI / 200, ["gradian", "gradians", "gon"]),
		// frequency (Hz)
		u("frequency", "Hz", "hertz", 1, ["hz", "hertz"]),
		u("frequency", "kHz", "kilohertz", 1e3, ["khz", "kilohertz"]),
		u("frequency", "MHz", "megahertz", 1e6, ["mhz", "megahertz"]),
		u("frequency", "GHz", "gigahertz", 1e9, ["ghz", "gigahertz"]),
	];

	const byAlias = new Map<string, Unit>();
	for (const unit of ALL) {
		for (const alias of unit.aliases) {
			const key = alias.toLowerCase();
			if (!byAlias.has(key)) byAlias.set(key, unit);
		}
	}

	export function find(name: string): Unit | undefined {
		const key = name
			.toLowerCase()
			.trim()
			.replace(/\s+/g, " ")
			.replace(/^(a|an|the)\s+/, "");
		return byAlias.get(key) ?? byAlias.get(key.replace(/\.$/, ""));
	}

	export function convert(value: number, from: Unit, to: Unit): number {
		const base = (value + (from.offset ?? 0)) * from.factor;
		return base / to.factor - (to.offset ?? 0);
	}
}

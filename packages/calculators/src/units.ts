/**
 * Quantities and their units. Every value is held in the quantity's base unit (SI where there is
 * one); a unit converts to and from that base. Most units are a plain factor; temperatures carry an
 * offset and fuel economy is reciprocal, so each unit has its own pair of functions.
 *
 * Exact factors are used where a definition exists (1 in = 0.0254 m, 1 lb = 0.45359237 kg,
 * 1 BTU(IT) = 1055.05585262 J, 1 atm = 101325 Pa...). Sources: NIST SP 811 (2008), Appendix B.
 */

export interface Unit {
  id: string;
  /** What people read ("km/h", "°C"). */
  symbol: string;
  name: string;
  toBase: (v: number) => number;
  fromBase: (v: number) => number;
  /** Plain factor to the base unit, when there is one (shown as "1 ft = 0.3048 m"). */
  factor?: number;
}

export interface Quantity {
  id: string;
  name: string;
  /** The base unit's id. */
  base: string;
  units: Unit[];
  /** Shown as its own converter tab. */
  converter?: boolean;
}

const lin = (id: string, symbol: string, name: string, factor: number): Unit => ({
  id,
  symbol,
  name,
  factor,
  toBase: (v) => v * factor,
  fromBase: (v) => v / factor,
});
const aff = (id: string, symbol: string, name: string, factor: number, offset: number): Unit => ({
  id,
  symbol,
  name,
  toBase: (v) => (v + offset) * factor,
  fromBase: (v) => v / factor - offset,
});

const IN = 0.0254;
const FT = 0.3048;
const LB = 0.45359237;
const G0 = 9.80665;
const LBF = LB * G0;
const US_GAL = 231 * IN ** 3;
const IMP_GAL = 4.54609e-3;
const BTU = 1055.05585262;
const CAL = 4.184;

/** SI prefixes for a base unit (only the ones engineers use). */
function prefixed(baseId: string, symbol: string, name: string, prefixes: string[]): Unit[] {
  const P: Record<string, [string, string, number]> = {
    p: ["p", "pico", 1e-12],
    n: ["n", "nano", 1e-9],
    u: ["µ", "micro", 1e-6],
    m: ["m", "milli", 1e-3],
    "": ["", "", 1],
    k: ["k", "kilo", 1e3],
    M: ["M", "mega", 1e6],
    G: ["G", "giga", 1e9],
    T: ["T", "tera", 1e12],
  };
  return prefixes.map((p) => {
    const [s, n, f] = P[p]!;
    return lin(`${p}${baseId}`, `${s}${symbol}`, `${n}${name}`, f);
  });
}

export const QUANTITIES: Quantity[] = [
  { id: "dimensionless", name: "Number", base: "1", units: [lin("1", "", "number", 1)] },
  {
    id: "ratio",
    name: "Ratio",
    base: "fraction",
    units: [lin("fraction", "", "fraction", 1), lin("percent", "%", "percent", 0.01), lin("ppm", "ppm", "parts per million", 1e-6)],
  },
  { id: "count", name: "Count", base: "count", units: [lin("count", "", "count", 1)] },
  { id: "money", name: "Amount of money", base: "money", units: [lin("money", "", "amount", 1)] },
  {
    id: "length",
    name: "Length",
    base: "m",
    converter: true,
    units: [
      lin("nm", "nm", "nanometre", 1e-9),
      lin("um", "µm", "micrometre", 1e-6),
      lin("mm", "mm", "millimetre", 1e-3),
      lin("cm", "cm", "centimetre", 1e-2),
      lin("m", "m", "metre", 1),
      lin("km", "km", "kilometre", 1e3),
      lin("mil", "mil", "mil (thou)", IN / 1000),
      lin("in", "in", "inch", IN),
      lin("ft", "ft", "foot", FT),
      lin("yd", "yd", "yard", 3 * FT),
      lin("mi", "mi", "mile", 1609.344),
      lin("nmi", "nmi", "nautical mile", 1852),
      lin("angstrom", "Å", "ångström", 1e-10),
      lin("au", "au", "astronomical unit", 149597870700),
      lin("ly", "ly", "light-year", 9460730472580800),
      lin("pc", "pc", "parsec", 3.0856775814913673e16),
    ],
  },
  {
    id: "area",
    name: "Area",
    base: "m2",
    converter: true,
    units: [
      lin("mm2", "mm²", "square millimetre", 1e-6),
      lin("cm2", "cm²", "square centimetre", 1e-4),
      lin("m2", "m²", "square metre", 1),
      lin("ha", "ha", "hectare", 1e4),
      lin("km2", "km²", "square kilometre", 1e6),
      lin("in2", "in²", "square inch", IN ** 2),
      lin("ft2", "ft²", "square foot", FT ** 2),
      lin("yd2", "yd²", "square yard", (3 * FT) ** 2),
      lin("acre", "ac", "acre", 4046.8564224),
      lin("mi2", "mi²", "square mile", 1609.344 ** 2),
      lin("kcmil", "kcmil", "thousand circular mils", (Math.PI / 4) * (IN / 1000) ** 2 * 1000),
    ],
  },
  {
    id: "volume",
    name: "Volume",
    base: "m3",
    converter: true,
    units: [
      lin("mm3", "mm³", "cubic millimetre", 1e-9),
      lin("mL", "mL", "millilitre", 1e-6),
      lin("cm3", "cm³", "cubic centimetre", 1e-6),
      lin("L", "L", "litre", 1e-3),
      lin("m3", "m³", "cubic metre", 1),
      lin("in3", "in³", "cubic inch", IN ** 3),
      lin("ft3", "ft³", "cubic foot", FT ** 3),
      lin("yd3", "yd³", "cubic yard", (3 * FT) ** 3),
      lin("tsp", "tsp", "teaspoon (US)", US_GAL / 768),
      lin("tbsp", "tbsp", "tablespoon (US)", US_GAL / 256),
      lin("floz", "fl oz", "fluid ounce (US)", US_GAL / 128),
      lin("cup", "cup", "cup (US)", US_GAL / 16),
      lin("pt", "pt", "pint (US)", US_GAL / 8),
      lin("qt", "qt", "quart (US)", US_GAL / 4),
      lin("gal", "gal", "gallon (US)", US_GAL),
      lin("impgal", "imp gal", "gallon (imperial)", IMP_GAL),
      lin("bbl", "bbl", "barrel (oil)", 42 * US_GAL),
    ],
  },
  {
    id: "mass",
    name: "Weight / mass",
    base: "kg",
    converter: true,
    units: [
      lin("mg", "mg", "milligram", 1e-6),
      lin("g", "g", "gram", 1e-3),
      lin("kg", "kg", "kilogram", 1),
      lin("t", "t", "tonne", 1000),
      lin("ct", "ct", "carat", 2e-4),
      lin("gr", "gr", "grain", 64.79891e-6),
      lin("oz", "oz", "ounce", LB / 16),
      lin("lb", "lb", "pound", LB),
      lin("st", "st", "stone", 14 * LB),
      lin("ton", "ton", "short ton (US)", 2000 * LB),
      lin("longton", "long ton", "long ton (UK)", 2240 * LB),
    ],
  },
  {
    id: "time",
    name: "Time",
    base: "s",
    converter: true,
    units: [
      lin("ns", "ns", "nanosecond", 1e-9),
      lin("us", "µs", "microsecond", 1e-6),
      lin("ms", "ms", "millisecond", 1e-3),
      lin("s", "s", "second", 1),
      lin("min", "min", "minute", 60),
      lin("h", "h", "hour", 3600),
      lin("day", "d", "day", 86400),
      lin("week", "wk", "week", 604800),
      lin("month", "mo", "month (average)", 2629746),
      lin("year", "yr", "year (Julian, 365.25 d)", 31557600),
    ],
  },
  {
    id: "temperature",
    name: "Temperature",
    base: "K",
    converter: true,
    units: [
      lin("K", "K", "kelvin", 1),
      aff("C", "°C", "degree Celsius", 1, 273.15),
      aff("F", "°F", "degree Fahrenheit", 5 / 9, 459.67),
      lin("R", "°R", "degree Rankine", 5 / 9),
    ],
  },
  {
    id: "temperatureDelta",
    name: "Temperature difference",
    base: "dK",
    units: [lin("dK", "K", "kelvin", 1), lin("dC", "°C", "degree Celsius", 1), lin("dF", "°F", "degree Fahrenheit", 5 / 9)],
  },
  {
    id: "speed",
    name: "Speed",
    base: "m/s",
    converter: true,
    units: [
      lin("m/s", "m/s", "metre per second", 1),
      lin("km/h", "km/h", "kilometre per hour", 1000 / 3600),
      lin("mph", "mph", "mile per hour", 1609.344 / 3600),
      lin("kn", "kn", "knot", 1852 / 3600),
      lin("ft/s", "ft/s", "foot per second", FT),
      lin("mach", "Ma", "Mach (sea level, 15 °C: 340.29 m/s)", 340.29),
    ],
  },
  {
    id: "acceleration",
    name: "Acceleration",
    base: "m/s2",
    units: [lin("m/s2", "m/s²", "metre per second squared", 1), lin("ft/s2", "ft/s²", "foot per second squared", FT), lin("gn", "g", "standard gravity", G0)],
  },
  {
    id: "force",
    name: "Force",
    base: "N",
    converter: true,
    units: [
      lin("N", "N", "newton", 1),
      lin("kN", "kN", "kilonewton", 1e3),
      lin("MN", "MN", "meganewton", 1e6),
      lin("dyn", "dyn", "dyne", 1e-5),
      lin("kgf", "kgf", "kilogram-force", G0),
      lin("lbf", "lbf", "pound-force", LBF),
      lin("kip", "kip", "kip", 1000 * LBF),
    ],
  },
  {
    id: "torque",
    name: "Torque",
    base: "N·m",
    converter: true,
    units: [
      lin("N·m", "N·m", "newton metre", 1),
      lin("N·mm", "N·mm", "newton millimetre", 1e-3),
      lin("kN·m", "kN·m", "kilonewton metre", 1e3),
      lin("kgf·m", "kgf·m", "kilogram-force metre", G0),
      lin("lbf·ft", "lbf·ft", "pound-force foot", LBF * FT),
      lin("lbf·in", "lbf·in", "pound-force inch", LBF * IN),
    ],
  },
  {
    id: "energy",
    name: "Energy",
    base: "J",
    converter: true,
    units: [
      lin("J", "J", "joule", 1),
      lin("kJ", "kJ", "kilojoule", 1e3),
      lin("MJ", "MJ", "megajoule", 1e6),
      lin("Wh", "Wh", "watt hour", 3600),
      lin("kWh", "kWh", "kilowatt hour", 3.6e6),
      lin("MWh", "MWh", "megawatt hour", 3.6e9),
      lin("cal", "cal", "calorie (thermochemical)", CAL),
      lin("kcal", "kcal", "kilocalorie", CAL * 1000),
      lin("BTU", "BTU", "British thermal unit (IT)", BTU),
      lin("erg", "erg", "erg", 1e-7),
      lin("ft·lbf", "ft·lbf", "foot pound-force", LBF * FT),
      lin("eV", "eV", "electronvolt", 1.602176634e-19),
    ],
  },
  {
    id: "power",
    name: "Power",
    base: "W",
    converter: true,
    units: [
      lin("mW", "mW", "milliwatt", 1e-3),
      lin("W", "W", "watt", 1),
      lin("kW", "kW", "kilowatt", 1e3),
      lin("MW", "MW", "megawatt", 1e6),
      lin("GW", "GW", "gigawatt", 1e9),
      lin("hp", "hp", "horsepower (mechanical)", 550 * LBF * FT),
      lin("PS", "PS", "metric horsepower", 75 * G0),
      lin("BTU/h", "BTU/h", "BTU per hour", BTU / 3600),
      lin("ft·lbf/s", "ft·lbf/s", "foot pound-force per second", LBF * FT),
      lin("TR", "TR", "ton of refrigeration", 12000 * (BTU / 3600)),
    ],
  },
  {
    id: "reactivePower",
    name: "Reactive power",
    base: "var",
    units: [lin("var", "var", "volt-ampere reactive", 1), lin("kvar", "kvar", "kilovar", 1e3), lin("Mvar", "Mvar", "megavar", 1e6)],
  },
  {
    id: "apparentPower",
    name: "Apparent power",
    base: "VA",
    units: [lin("VA", "VA", "volt-ampere", 1), lin("kVA", "kVA", "kilovolt-ampere", 1e3), lin("MVA", "MVA", "megavolt-ampere", 1e6)],
  },
  {
    id: "pressure",
    name: "Pressure / stress",
    base: "Pa",
    converter: true,
    units: [
      lin("Pa", "Pa", "pascal", 1),
      lin("kPa", "kPa", "kilopascal", 1e3),
      lin("MPa", "MPa", "megapascal (N/mm²)", 1e6),
      lin("GPa", "GPa", "gigapascal", 1e9),
      lin("mbar", "mbar", "millibar", 100),
      lin("bar", "bar", "bar", 1e5),
      lin("atm", "atm", "standard atmosphere", 101325),
      lin("torr", "Torr", "torr", 101325 / 760),
      lin("mmHg", "mmHg", "millimetre of mercury", 133.322387415),
      lin("inHg", "inHg", "inch of mercury", 3386.388640341),
      lin("mmH2O", "mmH₂O", "millimetre of water", G0),
      lin("psi", "psi", "pound per square inch", LBF / IN ** 2),
      lin("ksi", "ksi", "kilopound per square inch", (1000 * LBF) / IN ** 2),
      lin("psf", "psf", "pound per square foot", LBF / FT ** 2),
    ],
  },
  {
    id: "frequency",
    name: "Frequency",
    base: "Hz",
    converter: true,
    units: prefixed("Hz", "Hz", "hertz", ["", "k", "M", "G", "T"]),
  },
  {
    id: "angularSpeed",
    name: "Rotational speed",
    base: "rad/s",
    units: [lin("rad/s", "rad/s", "radian per second", 1), lin("rpm", "rpm", "revolution per minute", (2 * Math.PI) / 60), lin("rps", "rev/s", "revolution per second", 2 * Math.PI), lin("deg/s", "°/s", "degree per second", Math.PI / 180)],
  },
  {
    id: "angle",
    name: "Angle",
    base: "rad",
    converter: true,
    units: [
      lin("rad", "rad", "radian", 1),
      lin("deg", "°", "degree", Math.PI / 180),
      lin("grad", "gon", "gradian", Math.PI / 200),
      lin("arcmin", "′", "arcminute", Math.PI / 10800),
      lin("arcsec", "″", "arcsecond", Math.PI / 648000),
      lin("turn", "turn", "turn", 2 * Math.PI),
    ],
  },
  {
    id: "data",
    name: "Data",
    base: "bit",
    converter: true,
    units: [
      lin("bit", "bit", "bit", 1),
      lin("kbit", "kbit", "kilobit", 1e3),
      lin("Mbit", "Mbit", "megabit", 1e6),
      lin("Gbit", "Gbit", "gigabit", 1e9),
      lin("B", "B", "byte", 8),
      lin("kB", "kB", "kilobyte", 8e3),
      lin("MB", "MB", "megabyte", 8e6),
      lin("GB", "GB", "gigabyte", 8e9),
      lin("TB", "TB", "terabyte", 8e12),
      lin("PB", "PB", "petabyte", 8e15),
      lin("KiB", "KiB", "kibibyte", 8 * 1024),
      lin("MiB", "MiB", "mebibyte", 8 * 1024 ** 2),
      lin("GiB", "GiB", "gibibyte", 8 * 1024 ** 3),
      lin("TiB", "TiB", "tebibyte", 8 * 1024 ** 4),
    ],
  },
  {
    id: "dataRate",
    name: "Data rate",
    base: "bit/s",
    units: [
      lin("bit/s", "bit/s", "bit per second", 1),
      lin("kbit/s", "kbit/s", "kilobit per second", 1e3),
      lin("Mbit/s", "Mbit/s", "megabit per second", 1e6),
      lin("Gbit/s", "Gbit/s", "gigabit per second", 1e9),
      lin("B/s", "B/s", "byte per second", 8),
      lin("kB/s", "kB/s", "kilobyte per second", 8e3),
      lin("MB/s", "MB/s", "megabyte per second", 8e6),
      lin("GB/s", "GB/s", "gigabyte per second", 8e9),
    ],
  },
  { id: "voltage", name: "Voltage", base: "V", units: prefixed("V", "V", "volt", ["u", "m", "", "k", "M"]) },
  { id: "current", name: "Current", base: "A", units: prefixed("A", "A", "ampere", ["n", "u", "m", "", "k"]) },
  { id: "resistance", name: "Resistance", base: "ohm", units: prefixed("ohm", "Ω", "ohm", ["m", "", "k", "M", "G"]) },
  { id: "conductance", name: "Conductance", base: "S", units: prefixed("S", "S", "siemens", ["u", "m", ""]) },
  { id: "capacitance", name: "Capacitance", base: "F", units: prefixed("F", "F", "farad", ["p", "n", "u", "m", ""]) },
  { id: "inductance", name: "Inductance", base: "H", units: prefixed("H", "H", "henry", ["n", "u", "m", ""]) },
  {
    id: "charge",
    name: "Electric charge",
    base: "C",
    units: [lin("C", "C", "coulomb", 1), lin("mAh", "mAh", "milliampere hour", 3.6), lin("Ah", "Ah", "ampere hour", 3600)],
  },
  {
    id: "resistivity",
    name: "Resistivity",
    base: "ohm·m",
    units: [lin("ohm·m", "Ω·m", "ohm metre", 1), lin("ohm·cm", "Ω·cm", "ohm centimetre", 1e-2), lin("ohm·mm2/m", "Ω·mm²/m", "ohm square millimetre per metre", 1e-6)],
  },
  {
    id: "magneticField",
    name: "Magnetic flux density",
    base: "T",
    units: [lin("T", "T", "tesla", 1), lin("mT", "mT", "millitesla", 1e-3), lin("uT", "µT", "microtesla", 1e-6), lin("G", "G", "gauss", 1e-4)],
  },
  {
    id: "density",
    name: "Density",
    base: "kg/m3",
    units: [
      lin("kg/m3", "kg/m³", "kilogram per cubic metre", 1),
      lin("g/cm3", "g/cm³", "gram per cubic centimetre", 1000),
      lin("kg/L", "kg/L", "kilogram per litre", 1000),
      lin("lb/ft3", "lb/ft³", "pound per cubic foot", LB / FT ** 3),
      lin("lb/in3", "lb/in³", "pound per cubic inch", LB / IN ** 3),
    ],
  },
  {
    id: "flow",
    name: "Volume flow",
    base: "m3/s",
    units: [
      lin("m3/s", "m³/s", "cubic metre per second", 1),
      lin("m3/h", "m³/h", "cubic metre per hour", 1 / 3600),
      lin("L/s", "L/s", "litre per second", 1e-3),
      lin("L/min", "L/min", "litre per minute", 1e-3 / 60),
      lin("gpm", "gpm", "US gallon per minute", US_GAL / 60),
      lin("cfm", "cfm", "cubic foot per minute", FT ** 3 / 60),
    ],
  },
  {
    id: "massFlow",
    name: "Mass flow",
    base: "kg/s",
    units: [lin("kg/s", "kg/s", "kilogram per second", 1), lin("kg/h", "kg/h", "kilogram per hour", 1 / 3600), lin("g/s", "g/s", "gram per second", 1e-3), lin("lb/h", "lb/h", "pound per hour", LB / 3600)],
  },
  {
    id: "dynamicViscosity",
    name: "Dynamic viscosity",
    base: "Pa·s",
    units: [lin("Pa·s", "Pa·s", "pascal second", 1), lin("cP", "cP", "centipoise (mPa·s)", 1e-3), lin("P", "P", "poise", 0.1)],
  },
  {
    id: "kinematicViscosity",
    name: "Kinematic viscosity",
    base: "m2/s",
    units: [lin("m2/s", "m²/s", "square metre per second", 1), lin("cSt", "cSt", "centistokes (mm²/s)", 1e-6), lin("St", "St", "stokes", 1e-4)],
  },
  {
    id: "thermalConductivity",
    name: "Thermal conductivity",
    base: "W/mK",
    units: [lin("W/mK", "W/(m·K)", "watt per metre kelvin", 1), lin("BTU/hftF", "BTU/(h·ft·°F)", "BTU per hour foot °F", 1.730734666)],
  },
  {
    id: "heatTransferCoeff",
    name: "Heat transfer coefficient",
    base: "W/m2K",
    units: [lin("W/m2K", "W/(m²·K)", "watt per square metre kelvin", 1), lin("BTU/hft2F", "BTU/(h·ft²·°F)", "BTU per hour square foot °F", 5.678263341)],
  },
  { id: "thermalResistance", name: "Thermal resistance", base: "K/W", units: [lin("K/W", "K/W", "kelvin per watt", 1), lin("C/W", "°C/W", "degree Celsius per watt", 1)] },
  {
    id: "expansionCoeff",
    name: "Expansion coefficient",
    base: "1/K",
    units: [lin("1/K", "1/K", "per kelvin", 1), lin("ppm/K", "µm/(m·K)", "parts per million per kelvin", 1e-6), lin("1/F", "1/°F", "per degree Fahrenheit", 9 / 5)],
  },
  {
    id: "specificHeat",
    name: "Specific heat",
    base: "J/kgK",
    units: [lin("J/kgK", "J/(kg·K)", "joule per kilogram kelvin", 1), lin("kJ/kgK", "kJ/(kg·K)", "kilojoule per kilogram kelvin", 1000), lin("BTU/lbF", "BTU/(lb·°F)", "BTU per pound °F", 4186.8)],
  },
  { id: "amount", name: "Amount of substance", base: "mol", units: [lin("mmol", "mmol", "millimole", 1e-3), lin("mol", "mol", "mole", 1), lin("kmol", "kmol", "kilomole", 1e3)] },
  { id: "molarMass", name: "Molar mass", base: "kg/mol", units: [lin("g/mol", "g/mol", "gram per mole", 1e-3), lin("kg/mol", "kg/mol", "kilogram per mole", 1)] },
  {
    id: "concentration",
    name: "Concentration",
    base: "mol/m3",
    units: [lin("mol/L", "mol/L (M)", "mole per litre", 1000), lin("mmol/L", "mmol/L", "millimole per litre", 1), lin("mol/m3", "mol/m³", "mole per cubic metre", 1)],
  },
  {
    id: "secondMoment",
    name: "Second moment of area",
    base: "m4",
    units: [lin("m4", "m⁴", "metre to the fourth", 1), lin("cm4", "cm⁴", "centimetre to the fourth", 1e-8), lin("mm4", "mm⁴", "millimetre to the fourth", 1e-12), lin("in4", "in⁴", "inch to the fourth", IN ** 4)],
  },
  {
    id: "stiffness",
    name: "Stiffness",
    base: "N/m",
    units: [lin("N/m", "N/m", "newton per metre", 1), lin("N/mm", "N/mm", "newton per millimetre", 1e3), lin("kN/m", "kN/m", "kilonewton per metre", 1e3), lin("lbf/in", "lbf/in", "pound-force per inch", LBF / IN)],
  },
  { id: "momentum", name: "Momentum / impulse", base: "kg·m/s", units: [lin("kg·m/s", "kg·m/s", "kilogram metre per second", 1), lin("N·s", "N·s", "newton second", 1)] },
  { id: "massMoment", name: "Moment of inertia", base: "kg·m2", units: [lin("kg·m2", "kg·m²", "kilogram square metre", 1), lin("g·cm2", "g·cm²", "gram square centimetre", 1e-7)] },
  { id: "irradiance", name: "Heat flux / irradiance", base: "W/m2", units: [lin("W/m2", "W/m²", "watt per square metre", 1), lin("kW/m2", "kW/m²", "kilowatt per square metre", 1e3)] },
  { id: "energyPerMass", name: "Specific energy", base: "J/kg", units: [lin("J/kg", "J/kg", "joule per kilogram", 1), lin("kJ/kg", "kJ/kg", "kilojoule per kilogram", 1e3), lin("MJ/kg", "MJ/kg", "megajoule per kilogram", 1e6)] },
  {
    id: "fuelEconomy",
    name: "Fuel economy",
    base: "km/L",
    converter: true,
    units: [
      lin("km/L", "km/L", "kilometre per litre", 1),
      { id: "L/100km", symbol: "L/100 km", name: "litre per 100 km", toBase: (v) => 100 / v, fromBase: (v) => 100 / v },
      lin("mpg", "mpg", "mile per US gallon", 1.609344 / (US_GAL * 1000)),
      lin("mpgimp", "mpg (imp)", "mile per imperial gallon", 1.609344 / (IMP_GAL * 1000)),
    ],
  },
  {
    id: "cooking",
    name: "Cooking",
    base: "m3",
    converter: true,
    units: [
      lin("tsp", "tsp", "teaspoon (US)", US_GAL / 768),
      lin("tbsp", "tbsp", "tablespoon (US)", US_GAL / 256),
      lin("floz", "fl oz", "fluid ounce (US)", US_GAL / 128),
      lin("cup", "cup", "cup (US)", US_GAL / 16),
      lin("pt", "pt", "pint (US)", US_GAL / 8),
      lin("qt", "qt", "quart (US)", US_GAL / 4),
      lin("mL", "mL", "millilitre", 1e-6),
      lin("L", "L", "litre", 1e-3),
    ],
  },
];

const byId = new Map(QUANTITIES.map((q) => [q.id, q]));

export function quantity(id: string): Quantity {
  const q = byId.get(id);
  if (!q) throw new Error(`Unknown quantity: ${id}`);
  return q;
}

export function unitOf(quantityId: string, unitId?: string | null): Unit {
  const q = quantity(quantityId);
  const id = unitId ?? q.base;
  const u = q.units.find((x) => x.id === id);
  if (!u) throw new UnitError(`"${id}" is not a unit of ${q.name.toLowerCase()}.`);
  return u;
}

export class UnitError extends Error {}

/** Convert between two units of one quantity. */
export function convert(value: number, quantityId: string, from: string, to: string): number {
  return unitOf(quantityId, to).fromBase(unitOf(quantityId, from).toBase(value));
}

/** Conversion result with the factor both ways, for the converter screen. */
export function conversion(value: number, quantityId: string, from: string, to: string) {
  const f = unitOf(quantityId, from);
  const t = unitOf(quantityId, to);
  const result = t.fromBase(f.toBase(value));
  const linear = f.factor !== undefined && t.factor !== undefined;
  return {
    value,
    result,
    from: f,
    to: t,
    /** "1 from = x to", only for plain factors (not °C → °F or L/100 km). */
    factor: linear ? f.factor! / t.factor! : null,
    inverse: linear ? t.factor! / f.factor! : null,
  };
}

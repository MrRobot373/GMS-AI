/** Physics, chemistry, chemical, aerospace, environmental, materials, instrumentation and computer engineering (beta). */
import type { CalculatorDef } from "../registry";
import { def, fail, G0, inp, nonneg, out, pos } from "./helpers";

const R_GAS = 8.314462618;
const K_E = 8.9875517923e9;
const H_P = 6.62607015e-34;
const C0 = 299792458;
const QE = 1.602176634e-19;
const NA = 6.02214076e23;
const G_N = 6.6743e-11;

export const SCIENCE: CalculatorDef[] = [
  /* ── Physics ── */
  def({
    id: "kinetic-energy",
    name: "Kinetic energy",
    category: "physics",
    description: "Kinetic energy and momentum of a moving mass.",
    formula: ["KE = ½·m·v²", "p = m·v"],
    assumptions: ["Speeds well below the speed of light"],
    inputs: [inp("m", "Mass", "mass", "kg", { ...pos }), inp("v", "Speed", "speed", "m/s")],
    outputs: [out("KE", "Kinetic energy", "energy", "J"), out("p", "Momentum", "momentum", "kg·m/s")],
    compute: ({ m, v }) => ({ values: { KE: 0.5 * m! * v! * v!, p: m! * v! } }),
    refs: [
      { inputs: { m: 2, v: 3 }, expect: { KE: 9, p: 6 }, note: "½·2·9" },
      { inputs: { m: 1000, v: [36, "km/h"] }, expect: { KE: 50000 }, note: "1 t at 10 m/s" },
    ],
  }),
  def({
    id: "potential-energy",
    name: "Gravitational potential energy",
    category: "physics",
    description: "Potential energy of a mass raised through a height.",
    formula: ["PE = m·g·h"],
    assumptions: ["Near the Earth's surface, g = 9.80665 m/s²"],
    inputs: [inp("m", "Mass", "mass", "kg", { ...pos }), inp("h", "Height", "length", "m"), inp("g", "Gravity", "acceleration", "m/s2", { ...pos, default: 9.80665 })],
    outputs: [out("PE", "Potential energy", "energy", "J")],
    compute: ({ m, h, g }) => ({ values: { PE: m! * g! * h! } }),
    refs: [{ inputs: { m: 10, h: 5, g: 9.80665 }, expect: { PE: 490.3325 }, note: "10·9.80665·5" }],
  }),
  def({
    id: "newtons-second-law",
    name: "Force, mass and acceleration",
    category: "physics",
    description: "Any two of force, mass and acceleration give the third.",
    formula: ["F = m·a"],
    assumptions: ["Constant mass, inertial frame"],
    inputs: [inp("F", "Force", "force", "N", { optional: true }), inp("m", "Mass", "mass", "kg", { optional: true, ...pos }), inp("a", "Acceleration", "acceleration", "m/s2", { optional: true })],
    outputs: [out("F", "Force", "force", "N"), out("m", "Mass", "mass", "kg"), out("a", "Acceleration", "acceleration", "m/s2")],
    pick: { count: 2, keys: ["F", "m", "a"] },
    compute: ({ F, m, a }) => {
      if (F === undefined) return { values: { m: m!, a: a!, F: m! * a! } };
      if (m === undefined) {
        if (a === 0) fail("Acceleration can't be zero here.", "a");
        return { values: { F, a: a!, m: F / a! } };
      }
      return { values: { F, m, a: F / m } };
    },
    refs: [
      { inputs: { m: 10, a: 2 }, expect: { F: 20 }, note: "10·2" },
      { inputs: { F: 100, a: 4 }, expect: { m: 25 }, note: "100/4" },
    ],
  }),
  def({
    id: "weight",
    name: "Weight",
    category: "physics",
    description: "Weight of a mass in a gravitational field.",
    formula: ["W = m·g"],
    assumptions: ["g = 9.80665 m/s² on Earth (Moon 1.62, Mars 3.71)"],
    inputs: [inp("m", "Mass", "mass", "kg", { ...nonneg }), inp("g", "Gravity", "acceleration", "m/s2", { ...pos, default: 9.80665 })],
    outputs: [out("W", "Weight", "force", "N")],
    compute: ({ m, g }) => ({ values: { W: m! * g! } }),
    refs: [{ inputs: { m: 70, g: 1.62 }, expect: { W: 113.4 }, note: "70 kg on the Moon" }],
  }),
  def({
    id: "work-done",
    name: "Work and power",
    category: "physics",
    description: "Work done by a force over a distance, and the power if done in a time.",
    formula: ["W = F·d·cos θ", "P = W / t"],
    assumptions: ["Constant force; θ between the force and the motion"],
    inputs: [inp("F", "Force", "force", "N"), inp("d", "Distance", "length", "m"), inp("theta", "Angle", "angle", "deg", { default: 0 }), inp("t", "Time", "time", "s", { optional: true, ...pos })],
    outputs: [out("W", "Work", "energy", "J"), out("P", "Power", "power", "W", { optional: true })],
    compute: ({ F, d, theta, t }) => {
      const c = Math.cos(theta!);
      const W = F! * d! * (Math.abs(c) < 1e-15 ? 0 : c);
      return { values: { W, ...(t !== undefined ? { P: W / t } : {}) } };
    },
    refs: [
      { inputs: { F: 10, d: 5, theta: 60, t: 2 }, expect: { W: 25, P: 12.5 }, note: "cos 60° = ½" },
      { inputs: { F: 10, d: 5, theta: 90 }, expect: { W: 0 }, note: "Perpendicular force does no work" },
    ],
  }),
  def({
    id: "uniform-acceleration",
    name: "Uniform acceleration (SUVAT)",
    category: "physics",
    description: "Final speed and distance under constant acceleration.",
    formula: ["v = u + a·t", "s = u·t + ½·a·t²"],
    assumptions: ["Constant acceleration in a straight line"],
    inputs: [inp("u", "Initial speed", "speed", "m/s"), inp("a", "Acceleration", "acceleration", "m/s2"), inp("t", "Time", "time", "s", { ...nonneg })],
    outputs: [out("v", "Final speed", "speed", "m/s"), out("s", "Distance", "length", "m")],
    compute: ({ u, a, t }) => ({ values: { v: u! + a! * t!, s: u! * t! + 0.5 * a! * t! * t! } }),
    refs: [{ inputs: { u: 0, a: 2, t: 5 }, expect: { v: 10, s: 25 }, note: "From rest" }],
  }),
  def({
    id: "free-fall",
    name: "Free fall",
    category: "physics",
    description: "Time to fall and impact speed from a height.",
    formula: ["t = √(2h/g)", "v = √(2gh)"],
    assumptions: ["No air resistance", "Starts from rest"],
    inputs: [inp("h", "Height", "length", "m", { ...nonneg }), inp("g", "Gravity", "acceleration", "m/s2", { ...pos, default: 9.80665 })],
    outputs: [out("t", "Fall time", "time", "s"), out("v", "Impact speed", "speed", "m/s")],
    compute: ({ h, g }) => ({ values: { t: Math.sqrt((2 * h!) / g!), v: Math.sqrt(2 * g! * h!) } }),
    refs: [{ inputs: { h: 20, g: 9.80665 }, expect: { t: 2.019619977103, v: 19.80570624845 }, note: "√(40/9.81)" }],
  }),
  def({
    id: "projectile",
    name: "Projectile motion",
    category: "physics",
    description: "Range, maximum height and flight time of a projectile launched from level ground.",
    formula: ["R = v²·sin 2θ / g", "H = (v·sin θ)² / (2g)", "T = 2v·sin θ / g"],
    assumptions: ["No air resistance", "Lands at the launch height", "Flat Earth, constant g"],
    inputs: [inp("v", "Launch speed", "speed", "m/s", { ...pos }), inp("theta", "Launch angle", "angle", "deg", { min: 0, max: Math.PI / 2 }), inp("g", "Gravity", "acceleration", "m/s2", { ...pos, default: 9.80665 })],
    outputs: [out("R", "Range", "length", "m"), out("H", "Maximum height", "length", "m"), out("T", "Flight time", "time", "s")],
    compute: ({ v, theta, g }) => ({ values: { R: (v! * v! * Math.sin(2 * theta!)) / g!, H: (v! * Math.sin(theta!)) ** 2 / (2 * g!), T: (2 * v! * Math.sin(theta!)) / g! } }),
    refs: [{ inputs: { v: 20, theta: 45, g: 9.80665 }, expect: { R: 40.78864851912, H: 10.19716212978, T: 2.884192996330 }, note: "45° gives the longest range" }],
  }),
  def({
    id: "centripetal",
    name: "Centripetal force",
    category: "physics",
    description: "Centripetal acceleration and force for circular motion.",
    formula: ["a = v² / r", "F = m·v² / r"],
    assumptions: ["Uniform circular motion"],
    inputs: [inp("m", "Mass", "mass", "kg", { ...pos }), inp("v", "Speed", "speed", "m/s", { ...nonneg }), inp("r", "Radius", "length", "m", { ...pos })],
    outputs: [out("a", "Acceleration", "acceleration", "m/s2"), out("F", "Force", "force", "N")],
    compute: ({ m, v, r }) => ({ values: { a: (v! * v!) / r!, F: (m! * v! * v!) / r! } }),
    refs: [{ inputs: { m: 2, v: 4, r: 2 }, expect: { a: 8, F: 16 }, note: "16/2" }],
  }),
  def({
    id: "angular-velocity",
    name: "Angular velocity",
    category: "physics",
    description: "Angular velocity and rim speed from rotational frequency.",
    formula: ["ω = 2π·f", "v = ω·r"],
    assumptions: ["Rigid body rotation"],
    inputs: [inp("n", "Speed", "angularSpeed", "rpm", { ...nonneg }), inp("r", "Radius", "length", "m", { ...nonneg })],
    outputs: [out("w", "Angular velocity", "angularSpeed", "rad/s"), out("f", "Frequency", "frequency", "Hz"), out("v", "Rim speed", "speed", "m/s")],
    compute: ({ n, r }) => ({ values: { w: n!, f: n! / (2 * Math.PI), v: n! * r! } }),
    refs: [{ inputs: { n: 60, r: 0.5 }, expect: { w: 6.283185307180, f: 1, v: 3.141592653590 }, note: "1 rev/s" }],
  }),
  def({
    id: "pendulum",
    name: "Simple pendulum",
    category: "physics",
    description: "Period and frequency of a simple pendulum.",
    formula: ["T = 2π·√(L/g)"],
    assumptions: ["Small swings (under about 15°)", "Point mass on a massless string"],
    inputs: [inp("L", "Length", "length", "m", { ...pos }), inp("g", "Gravity", "acceleration", "m/s2", { ...pos, default: 9.80665 })],
    outputs: [out("T", "Period", "time", "s"), out("f", "Frequency", "frequency", "Hz")],
    compute: ({ L, g }) => {
      const T = 2 * Math.PI * Math.sqrt(L! / g!);
      return { values: { T, f: 1 / T } };
    },
    refs: [{ inputs: { L: 1, g: 9.80665 }, expect: { T: 2.006409292589 }, note: "A 1 m pendulum: about 2 s" }],
  }),
  def({
    id: "friction",
    name: "Friction force",
    category: "physics",
    description: "Friction force from the coefficient and the normal force.",
    formula: ["F_f = μ·N"],
    assumptions: ["Coulomb friction: independent of area and speed"],
    inputs: [inp("mu", "Coefficient of friction", "dimensionless", undefined, { ...nonneg }), inp("N", "Normal force", "force", "N", { ...nonneg })],
    outputs: [out("F", "Friction force", "force", "N")],
    compute: ({ mu, N }) => ({ values: { F: mu! * N! } }),
    refs: [{ inputs: { mu: 0.3, N: 100 }, expect: { F: 30 }, note: "0.3·100" }],
  }),
  def({
    id: "drag-force",
    name: "Drag force",
    category: "physics",
    description: "Aerodynamic or hydrodynamic drag on a body.",
    formula: ["F_d = ½·ρ·v²·C_d·A"],
    assumptions: ["C_d for the body's shape and Reynolds number (sphere ≈ 0.47, car 0.25–0.35)"],
    inputs: [inp("rho", "Fluid density", "density", "kg/m3", { ...pos, default: 1.225 }), inp("v", "Speed", "speed", "m/s", { ...nonneg }), inp("Cd", "Drag coefficient", "dimensionless", undefined, { ...pos }), inp("A", "Frontal area", "area", "m2", { ...pos })],
    outputs: [out("F", "Drag force", "force", "N"), out("P", "Power to overcome it", "power", "kW")],
    compute: ({ rho, v, Cd, A }) => {
      const F = 0.5 * rho! * v! * v! * Cd! * A!;
      return { values: { F, P: F * v! } };
    },
    refs: [{ inputs: { rho: 1.225, v: [100, "km/h"], Cd: 0.3, A: 2.2 }, expect: { F: 311.9212962963 }, note: "Car at 100 km/h" }],
  }),
  def({
    id: "coulombs-law",
    name: "Coulomb's law",
    category: "physics",
    description: "Electrostatic force between two point charges.",
    formula: ["F = k·q₁·q₂ / r²", "k = 8.9875517923e9 N·m²/C²"],
    assumptions: ["Point charges in vacuum (divide by εᵣ in a medium)"],
    inputs: [inp("q1", "Charge 1 (µC)", "dimensionless"), inp("q2", "Charge 2 (µC)", "dimensionless"), inp("r", "Distance", "length", "cm", { ...pos })],
    outputs: [out("F", "Force (+ repels)", "force", "N")],
    compute: ({ q1, q2, r }) => ({ values: { F: (K_E * q1! * 1e-6 * q2! * 1e-6) / (r! * r!) } }),
    refs: [{ inputs: { q1: 1, q2: 1, r: 10 }, expect: { F: 0.89875517923 }, note: "Two 1 µC charges 10 cm apart" }],
  }),
  def({
    id: "gravitational-force",
    name: "Gravitational force",
    category: "physics",
    description: "Newton's law of gravitation between two masses.",
    formula: ["F = G·m₁·m₂ / r²"],
    assumptions: ["Point masses or spheres (r between centres)", "G = 6.6743e-11 m³/(kg·s²)"],
    inputs: [inp("m1", "Mass 1", "mass", "kg", { ...pos }), inp("m2", "Mass 2", "mass", "kg", { ...pos }), inp("r", "Distance between centres", "length", "km", { ...pos })],
    outputs: [out("F", "Force", "force", "N")],
    compute: ({ m1, m2, r }) => ({ values: { F: (G_N * m1! * m2!) / (r! * r!) } }),
    refs: [{ inputs: { m1: 5.972e24, m2: 70, r: 6371 }, expect: { F: 687.3981398357 }, note: "A 70 kg person on Earth" }],
  }),
  def({
    id: "wave-speed",
    name: "Wave speed",
    category: "physics",
    description: "Wave speed, frequency and wavelength.",
    formula: ["v = f·λ"],
    assumptions: ["A single frequency in a non-dispersive medium"],
    inputs: [inp("f", "Frequency", "frequency", "Hz", { optional: true, ...pos }), inp("lambda", "Wavelength", "length", "m", { optional: true, ...pos }), inp("v", "Speed", "speed", "m/s", { optional: true, ...pos })],
    outputs: [out("f", "Frequency", "frequency", "Hz"), out("lambda", "Wavelength", "length", "m"), out("v", "Speed", "speed", "m/s")],
    pick: { count: 2, keys: ["f", "lambda", "v"] },
    compute: ({ f, lambda, v }) => {
      if (v === undefined) return { values: { f: f!, lambda: lambda!, v: f! * lambda! } };
      if (f === undefined) return { values: { v, lambda: lambda!, f: v / lambda! } };
      return { values: { v, f, lambda: v / f } };
    },
    refs: [{ inputs: { f: 440, v: 343 }, expect: { lambda: 0.7795454545455 }, note: "Concert A in air" }],
  }),
  def({
    id: "photon-energy",
    name: "Photon energy",
    category: "physics",
    description: "Energy of a photon from its wavelength.",
    formula: ["E = h·c / λ"],
    assumptions: ["In vacuum; h = 6.62607015e-34 J·s"],
    inputs: [inp("lambda", "Wavelength", "length", "nm", { ...pos })],
    outputs: [out("E", "Energy", "energy", "eV"), out("f", "Frequency", "frequency", "THz")],
    compute: ({ lambda }) => ({ values: { E: (H_P * C0) / lambda!, f: C0 / lambda! } }),
    refs: [{ inputs: { lambda: 500 }, expect: { E: 2.479683968664 }, note: "Green light ≈ 2.48 eV" }],
  }),
  def({
    id: "density",
    name: "Density",
    category: "physics",
    description: "Any two of density, mass and volume give the third.",
    formula: ["ρ = m / V"],
    assumptions: ["Uniform material"],
    inputs: [inp("rho", "Density", "density", "kg/m3", { optional: true, ...pos }), inp("m", "Mass", "mass", "kg", { optional: true, ...pos }), inp("V", "Volume", "volume", "L", { optional: true, ...pos })],
    outputs: [out("rho", "Density", "density", "kg/m3"), out("m", "Mass", "mass", "kg"), out("V", "Volume", "volume", "L")],
    pick: { count: 2, keys: ["rho", "m", "V"] },
    compute: ({ rho, m, V }) => {
      if (rho === undefined) return { values: { m: m!, V: V!, rho: m! / V! } };
      if (m === undefined) return { values: { rho, V: V!, m: rho * V! } };
      return { values: { rho, m, V: m / rho } };
    },
    refs: [{ inputs: { m: 7.85, V: 1 }, expect: { rho: 7850 }, note: "Steel" }],
  }),
  def({
    id: "pressure-force-area",
    name: "Pressure",
    category: "physics",
    description: "Pressure from a force spread over an area.",
    formula: ["p = F / A"],
    assumptions: ["Force perpendicular to the area, evenly spread"],
    inputs: [inp("F", "Force", "force", "N"), inp("A", "Area", "area", "m2", { ...pos })],
    outputs: [out("p", "Pressure", "pressure", "kPa")],
    compute: ({ F, A }) => ({ values: { p: F! / A! } }),
    refs: [{ inputs: { F: 1000, A: 0.5 }, expect: { p: 2 }, note: "2000 Pa" }],
  }),
  def({
    id: "impulse",
    name: "Impulse and momentum change",
    category: "physics",
    description: "Impulse of a force over a time and the speed change it gives a mass.",
    formula: ["J = F·Δt", "Δv = J / m"],
    assumptions: ["Average force over the interval"],
    inputs: [inp("F", "Average force", "force", "N"), inp("dt", "Duration", "time", "ms", { ...pos }), inp("m", "Mass", "mass", "kg", { ...pos })],
    outputs: [out("J", "Impulse", "momentum", "N·s"), out("dv", "Speed change", "speed", "m/s")],
    compute: ({ F, dt, m }) => ({ values: { J: F! * dt!, dv: (F! * dt!) / m! } }),
    refs: [{ inputs: { F: 500, dt: 10, m: 0.5 }, expect: { J: 5, dv: 10 }, note: "500 N for 10 ms" }],
  }),

  /* ── Chemistry and chemical engineering ── */
  def({
    id: "moles-from-mass",
    name: "Moles and molar mass",
    category: "chemistry",
    description: "Amount of substance and number of particles from mass and molar mass.",
    formula: ["n = m / M", "N = n·N_A"],
    assumptions: ["Pure substance; N_A = 6.02214076e23 /mol"],
    inputs: [inp("m", "Mass", "mass", "g", { ...pos }), inp("M", "Molar mass", "molarMass", "g/mol", { ...pos })],
    outputs: [out("n", "Amount", "amount", "mol"), out("N", "Particles", "dimensionless")],
    compute: ({ m, M }) => ({ values: { n: m! / M!, N: (m! / M!) * NA } }),
    refs: [{ inputs: { m: 18.015, M: 18.015 }, expect: { n: 1, N: 6.02214076e23 }, note: "One mole of water" }],
  }),
  def({
    id: "molarity",
    name: "Molarity",
    category: "chemistry",
    description: "Concentration of a solution from the mass dissolved and the volume.",
    formula: ["c = (m / M) / V"],
    assumptions: ["V is the final solution volume"],
    inputs: [inp("m", "Mass of solute", "mass", "g", { ...pos }), inp("M", "Molar mass", "molarMass", "g/mol", { ...pos }), inp("V", "Solution volume", "volume", "L", { ...pos })],
    outputs: [out("c", "Concentration", "concentration", "mol/L")],
    compute: ({ m, M, V }) => ({ values: { c: m! / M! / V! } }),
    refs: [{ inputs: { m: 58.44, M: 58.44, V: 1 }, expect: { c: 1 }, note: "1 M NaCl" }],
  }),
  def({
    id: "dilution",
    name: "Dilution (C₁V₁ = C₂V₂)",
    category: "chemistry",
    description: "Any three of the starting and final concentration and volume give the fourth.",
    formula: ["C₁·V₁ = C₂·V₂"],
    assumptions: ["Amount of solute stays the same; volumes additive"],
    inputs: [inp("C1", "Stock concentration", "concentration", "mol/L", { optional: true, ...pos }), inp("V1", "Stock volume", "volume", "mL", { optional: true, ...pos }), inp("C2", "Final concentration", "concentration", "mol/L", { optional: true, ...pos }), inp("V2", "Final volume", "volume", "mL", { optional: true, ...pos })],
    outputs: [out("C1", "Stock concentration", "concentration", "mol/L"), out("V1", "Stock volume", "volume", "mL"), out("C2", "Final concentration", "concentration", "mol/L"), out("V2", "Final volume", "volume", "mL")],
    pick: { count: 3, keys: ["C1", "V1", "C2", "V2"] },
    compute: ({ C1, V1, C2, V2 }) => {
      if (C1 === undefined) return { values: { V1: V1!, C2: C2!, V2: V2!, C1: (C2! * V2!) / V1! } };
      if (V1 === undefined) return { values: { C1, C2: C2!, V2: V2!, V1: (C2! * V2!) / C1 } };
      if (C2 === undefined) return { values: { C1, V1, V2: V2!, C2: (C1 * V1) / V2! } };
      return { values: { C1, V1, C2, V2: (C1 * V1) / C2! } };
    },
    refs: [{ inputs: { C1: 2, C2: 0.5, V2: 100 }, expect: { V1: 25 }, note: "0.5·100/2" }],
  }),
  def({
    id: "ph",
    name: "pH and pOH",
    category: "chemistry",
    description: "pH, pOH and hydroxide concentration from the hydrogen-ion concentration.",
    formula: ["pH = -log₁₀[H⁺]", "pOH = 14 - pH (at 25 °C)"],
    assumptions: ["Dilute aqueous solution at 25 °C (activity ≈ concentration)"],
    inputs: [inp("H", "[H⁺]", "concentration", "mol/L", { ...pos })],
    outputs: [out("pH", "pH", "dimensionless"), out("pOH", "pOH", "dimensionless"), out("OH", "[OH⁻]", "concentration", "mol/L")],
    compute: ({ H }) => {
      const pH = -Math.log10(H! / 1000);
      return { values: { pH, pOH: 14 - pH, OH: 10 ** -(14 - pH) * 1000 } };
    },
    refs: [{ inputs: { H: 1e-3 }, expect: { pH: 3, pOH: 11, OH: 1e-11 }, note: "0.001 M strong acid" }],
  }),
  def({
    id: "atom-particles",
    name: "Protons, neutrons and electrons",
    category: "chemistry",
    description: "Particle counts of an atom or ion from its atomic number, mass number and charge.",
    formula: ["protons = Z", "neutrons = A - Z", "electrons = Z - charge"],
    assumptions: ["A is the isotope's mass number (a whole number)"],
    inputs: [inp("Z", "Atomic number", "count", undefined, { min: 1, max: 118, integer: true }), inp("A", "Mass number", "count", undefined, { min: 1, integer: true }), inp("q", "Charge", "dimensionless", undefined, { default: 0, integer: true })],
    outputs: [out("p", "Protons", "count"), out("n", "Neutrons", "count"), out("e", "Electrons", "count")],
    compute: ({ Z, A, q }) => {
      if (A! < Z!) fail("The mass number can't be smaller than the atomic number.", "A");
      if (Z! - q! < 0) fail("An ion can't have fewer than zero electrons.", "q");
      return { values: { p: Z!, n: A! - Z!, e: Z! - q! } };
    },
    refs: [{ inputs: { Z: 26, A: 56, q: 3 }, expect: { p: 26, n: 30, e: 23 }, note: "Fe³⁺" }],
  }),
  def({
    id: "arrhenius",
    name: "Arrhenius rate constant",
    category: "chemical",
    description: "Reaction rate constant at a temperature from the activation energy.",
    formula: ["k = A·e^(-Eₐ / (R·T))"],
    assumptions: ["Single-step kinetics with a constant pre-exponential factor"],
    inputs: [inp("A", "Pre-exponential factor (1/s)", "dimensionless", undefined, { ...pos }), inp("Ea", "Activation energy (kJ/mol)", "dimensionless", undefined, { ...nonneg }), inp("T", "Temperature", "temperature", "C", { min: 0, exclusiveMin: true })],
    outputs: [out("k", "Rate constant (1/s)", "dimensionless")],
    compute: ({ A, Ea, T }) => ({ values: { k: A! * Math.exp((-Ea! * 1000) / (R_GAS * T!)) } }),
    refs: [{ inputs: { A: 1e13, Ea: 50, T: 25 }, expect: { k: 17393.17968090 }, note: "50 kJ/mol at 298.15 K" }],
  }),
  def({
    id: "antoine",
    name: "Vapour pressure (Antoine)",
    category: "chemical",
    description: "Vapour pressure of a liquid by the Antoine equation (mmHg and °C constants).",
    formula: ["log₁₀ P[mmHg] = A - B / (C + T[°C])"],
    assumptions: ["Constants valid only in their fitted range; defaults are water, 1–100 °C (A 8.07131, B 1730.63, C 233.426)"],
    inputs: [inp("A", "A", "dimensionless", undefined, { default: 8.07131 }), inp("B", "B", "dimensionless", undefined, { default: 1730.63 }), inp("C", "C", "dimensionless", undefined, { default: 233.426 }), inp("T", "Temperature (°C)", "dimensionless")],
    outputs: [out("P", "Vapour pressure", "pressure", "mmHg")],
    compute: ({ A, B, C, T }) => {
      if (C! + T! === 0) fail("C + T can't be zero.");
      return { values: { P: 10 ** (A! - B! / (C! + T!)) * 133.322387415 } };
    },
    refs: [{ inputs: { A: 8.07131, B: 1730.63, C: 233.426, T: 100 }, expect: { P: 760.0863691649 }, note: "Water boils at 760 mmHg" }],
  }),
  def({
    id: "cstr-pfr-volume",
    name: "Reactor volume (first order)",
    category: "chemical",
    description: "CSTR and PFR volumes for a first-order reaction at a target conversion.",
    formula: ["CSTR: V = F·X / (k·(1 - X))", "PFR: V = -(F / k)·ln(1 - X)"],
    assumptions: ["Isothermal, constant density, liquid phase", "First-order irreversible reaction"],
    inputs: [inp("F", "Volumetric flow", "flow", "L/s", { ...pos }), inp("k", "Rate constant (1/s)", "dimensionless", undefined, { ...pos }), inp("X", "Conversion", "ratio", "percent", { min: 0, max: 1, exclusiveMax: true })],
    outputs: [out("Vcstr", "CSTR volume", "volume", "m3"), out("Vpfr", "PFR volume", "volume", "m3")],
    compute: ({ F, k, X }) => ({ values: { Vcstr: (F! * X!) / (k! * (1 - X!)), Vpfr: -(F! / k!) * Math.log(1 - X!) } }),
    refs: [{ inputs: { F: 1, k: 0.01, X: 90 }, expect: { Vcstr: 0.9, Vpfr: 0.2302585092994 }, note: "The PFR needs about a quarter" }],
  }),
  def({
    id: "heat-exchanger-duty",
    name: "Heat exchanger duty",
    category: "chemical",
    description: "Heat duty from one stream's flow and temperature change.",
    formula: ["Q = ṁ·c_p·ΔT"],
    assumptions: ["No phase change, constant c_p", "No heat lost to the surroundings"],
    inputs: [inp("m", "Mass flow", "massFlow", "kg/s", { ...pos }), inp("cp", "Specific heat", "specificHeat", "kJ/kgK", { ...pos, default: 4.186 }), inp("dT", "Temperature change", "temperatureDelta", "dK")],
    outputs: [out("Q", "Duty", "power", "kW")],
    compute: ({ m, cp, dT }) => ({ values: { Q: m! * cp! * dT! } }),
    refs: [{ inputs: { m: 2, cp: 4.186, dT: 10 }, expect: { Q: 83.72 }, note: "2 kg/s of water heated 10 K" }],
  }),

  /* ── Aerospace ── */
  def({
    id: "rocket-equation",
    name: "Rocket equation (Tsiolkovsky)",
    category: "aerospace",
    description: "Ideal velocity change from specific impulse and mass ratio.",
    formula: ["Δv = I_sp·g₀·ln(m₀ / m_f)"],
    assumptions: ["No gravity or drag losses", "Constant exhaust velocity"],
    inputs: [inp("Isp", "Specific impulse", "time", "s", { ...pos }), inp("m0", "Initial mass", "mass", "t", { ...pos }), inp("mf", "Final mass", "mass", "t", { ...pos })],
    outputs: [out("dv", "Δv", "speed", "m/s"), out("ve", "Exhaust velocity", "speed", "m/s")],
    compute: ({ Isp, m0, mf }) => {
      if (mf! > m0!) fail("The final mass can't exceed the initial mass.", "mf");
      return { values: { dv: Isp! * G0 * Math.log(m0! / mf!), ve: Isp! * G0 } };
    },
    refs: [{ inputs: { Isp: 300, m0: 100, mf: 40 }, expect: { dv: 2695.722751720 }, note: "300 s, mass ratio 2.5" }],
  }),
  def({
    id: "circular-orbit",
    name: "Circular orbit",
    category: "aerospace",
    description: "Speed and period of a circular orbit around the Earth (or another body).",
    formula: ["v = √(μ / r)", "T = 2π·√(r³ / μ)", "r = R + h"],
    assumptions: ["Circular orbit, two-body problem", "Earth: μ = 3.986004418e14 m³/s², R = 6371 km"],
    inputs: [inp("h", "Altitude", "length", "km", { ...nonneg }), inp("R", "Body radius", "length", "km", { ...pos, default: 6371 }), inp("mu", "Gravitational parameter (m³/s²)", "dimensionless", undefined, { ...pos, default: 3.986004418e14 })],
    outputs: [out("v", "Orbital speed", "speed", "km/h"), out("T", "Period", "time", "min")],
    compute: ({ h, R, mu }) => {
      const r = R! + h!;
      return { values: { v: Math.sqrt(mu! / r), T: 2 * Math.PI * Math.sqrt(r ** 3 / mu!) } };
    },
    refs: [{ inputs: { h: 400, R: 6371, mu: 3.986004418e14 }, expect: { v: [7672.598648385, "m/s"], T: 92.41425159968 }, note: "ISS-like orbit" }],
  }),
  def({
    id: "lift-drag",
    name: "Lift and drag",
    category: "aerospace",
    description: "Lift and drag of a wing from its coefficients.",
    formula: ["L = ½·ρ·V²·S·C_L", "D = ½·ρ·V²·S·C_D", "L/D = C_L / C_D"],
    assumptions: ["Coefficients for the flight Reynolds and Mach number", "Steady flight"],
    inputs: [inp("rho", "Air density", "density", "kg/m3", { ...pos, default: 1.225 }), inp("V", "Airspeed", "speed", "m/s", { ...nonneg }), inp("S", "Wing area", "area", "m2", { ...pos }), inp("CL", "Lift coefficient", "dimensionless"), inp("CD", "Drag coefficient", "dimensionless", undefined, { ...pos })],
    outputs: [out("L", "Lift", "force", "kN"), out("D", "Drag", "force", "kN"), out("LD", "Lift-to-drag ratio", "dimensionless")],
    compute: ({ rho, V, S, CL, CD }) => {
      const q = 0.5 * rho! * V! * V! * S!;
      return { values: { L: q * CL!, D: q * CD!, LD: CL! / CD! } };
    },
    refs: [{ inputs: { rho: 1.225, V: 50, S: 16, CL: 0.5, CD: 0.03 }, expect: { L: 12.25, D: 0.735, LD: 16.66666666667 }, note: "Light aircraft" }],
  }),
  def({
    id: "mach-number",
    name: "Mach number",
    category: "aerospace",
    description: "Speed of sound in air and the Mach number of a speed.",
    formula: ["a = √(γ·R·T)", "M = V / a"],
    assumptions: ["Dry air as an ideal gas: γ = 1.4, R = 287.05 J/(kg·K)"],
    inputs: [inp("V", "Speed", "speed", "m/s", { ...nonneg }), inp("T", "Air temperature", "temperature", "C", { min: 0, exclusiveMin: true, default: 15 })],
    outputs: [out("a", "Speed of sound", "speed", "m/s"), out("M", "Mach number", "dimensionless")],
    compute: ({ V, T }) => {
      const a = Math.sqrt(1.4 * 287.05 * T!);
      return { values: { a, M: V! / a } };
    },
    refs: [{ inputs: { V: 300, T: 15 }, expect: { a: 340.2922868653, M: 0.8815950627725 }, note: "Sea-level standard" }],
  }),
  def({
    id: "isa-atmosphere",
    name: "Standard atmosphere (troposphere)",
    category: "aerospace",
    description: "ISA temperature, pressure and density at an altitude up to 11 km.",
    formula: ["T = 288.15 K - 0.0065·h", "p = 101 325·(T / 288.15)^5.2559", "ρ = p / (R·T)"],
    assumptions: ["International Standard Atmosphere, troposphere only (0–11 km)", "Geopotential altitude"],
    inputs: [inp("h", "Altitude", "length", "m", { min: 0, max: 11000 })],
    outputs: [out("T", "Temperature", "temperature", "C"), out("p", "Pressure", "pressure", "kPa"), out("rho", "Density", "density", "kg/m3")],
    compute: ({ h }) => {
      const T = 288.15 - 0.0065 * h!;
      const p = 101325 * (T / 288.15) ** (G0 / (0.0065 * 287.05));
      return { values: { T, p, rho: p / (287.05 * T) } };
    },
    refs: [
      { inputs: { h: 5000 }, expect: { T: -17.5, p: 54.01954847362, rho: 0.7361182780210 }, note: "ISA at 5 km" },
      { inputs: { h: 0 }, expect: { T: 15, p: 101.325, rho: 1.225 }, tol: 1e-3, note: "Sea level" },
    ],
  }),
  def({
    id: "thrust-mass-flow",
    name: "Thrust from mass flow",
    category: "aerospace",
    description: "Momentum thrust of a jet or rocket, and its specific impulse.",
    formula: ["F = ṁ·v_e", "I_sp = v_e / g₀"],
    assumptions: ["Pressure thrust ignored (nozzle exit at ambient pressure)"],
    inputs: [inp("m", "Mass flow", "massFlow", "kg/s", { ...pos }), inp("ve", "Exhaust velocity", "speed", "m/s", { ...pos })],
    outputs: [out("F", "Thrust", "force", "kN"), out("Isp", "Specific impulse", "time", "s")],
    compute: ({ m, ve }) => ({ values: { F: m! * ve!, Isp: ve! / G0 } }),
    refs: [{ inputs: { m: 100, ve: 3000 }, expect: { F: 300, Isp: 305.9148639 }, note: "300 kN" }],
  }),

  /* ── Environmental ── */
  def({
    id: "sound-level-sum",
    name: "Adding sound levels",
    category: "environmental",
    description: "Combined sound pressure level of several incoherent sources.",
    formula: ["L = 10·log₁₀(Σ 10^(Lᵢ/10))"],
    assumptions: ["Incoherent sources (no interference)"],
    inputs: [inp("L", "Levels (dB)", "dimensionless", undefined, { list: true })],
    outputs: [out("total", "Total level (dB)", "dimensionless")],
    compute: ({ lists }) => ({ values: { total: 10 * Math.log10(lists.L!.reduce((s, l) => s + 10 ** (l / 10), 0)) } }),
    refs: [
      { inputs: { L: [85, 85] }, expect: { total: 88.01029995664 }, note: "Two equal sources: +3 dB" },
      { inputs: { L: [90, 85, 80] }, expect: { total: 91.51133104745 }, note: "Three sources" },
    ],
  }),
  def({
    id: "sound-distance",
    name: "Sound level with distance",
    category: "environmental",
    description: "Sound level from a point source at a new distance.",
    formula: ["L₂ = L₁ - 20·log₁₀(r₂ / r₁)"],
    assumptions: ["Point source, free field (−6 dB per doubling)", "No absorption by air or ground"],
    inputs: [inp("L1", "Level at r₁ (dB)", "dimensionless"), inp("r1", "Distance r₁", "length", "m", { ...pos }), inp("r2", "Distance r₂", "length", "m", { ...pos })],
    outputs: [out("L2", "Level at r₂ (dB)", "dimensionless")],
    compute: ({ L1, r1, r2 }) => ({ values: { L2: L1! - 20 * Math.log10(r2! / r1!) } }),
    refs: [{ inputs: { L1: 90, r1: 1, r2: 10 }, expect: { L2: 70 }, note: "Ten times further: −20 dB" }],
  }),
  def({
    id: "chemical-dosing",
    name: "Chemical dosing",
    category: "environmental",
    description: "Daily chemical needed to dose a flow at a concentration.",
    formula: ["Feed [kg/day] = dose [mg/L]·Q [m³/day] / 1000 / purity"],
    assumptions: ["Dose as the active chemical; purity is its fraction in the product"],
    inputs: [inp("dose", "Dose (mg/L)", "dimensionless", undefined, { ...nonneg }), inp("Q", "Flow", "flow", "m3/h", { ...pos }), inp("purity", "Product strength", "ratio", "percent", { min: 0, max: 1, exclusiveMin: true, default: 100 })],
    outputs: [out("feed", "Feed (kg/day)", "dimensionless")],
    compute: ({ dose, Q, purity }) => ({ values: { feed: (dose! * Q! * 86400) / 1000 / purity! } }),
    refs: [{ inputs: { dose: 2, Q: 100, purity: 100 }, expect: { feed: 4.8 }, note: "2 mg/L × 2400 m³/day" }],
  }),
  def({
    id: "electricity-emissions",
    name: "Emissions from electricity",
    category: "environmental",
    description: "CO₂ emitted for an amount of electricity at a grid emission factor.",
    formula: ["CO₂ = E·EF"],
    assumptions: ["EF in kg CO₂ per kWh (India's grid ≈ 0.71–0.82, EU average ≈ 0.25; check the current national figure)"],
    inputs: [inp("E", "Energy", "energy", "kWh", { ...nonneg }), inp("EF", "Emission factor (kg/kWh)", "dimensionless", undefined, { ...nonneg })],
    outputs: [out("co2", "CO₂", "mass", "t")],
    compute: ({ E, EF }) => ({ values: { co2: (E! / 3.6e6) * EF! } }),
    refs: [{ inputs: { E: 10000, EF: 0.8 }, expect: { co2: 8 }, note: "10 MWh at 0.8 kg/kWh" }],
  }),

  /* ── Materials ── */
  def({
    id: "lever-rule",
    name: "Lever rule (two-phase region)",
    category: "materials",
    description: "Fractions of two phases from the overall and phase compositions.",
    formula: ["W_L = (C₀ - C_α) / (C_L - C_α)", "W_α = 1 - W_L"],
    assumptions: ["Equilibrium, binary alloy, on a tie line"],
    inputs: [inp("C0", "Overall composition", "ratio", "percent"), inp("Ca", "Solid (α) composition", "ratio", "percent"), inp("CL", "Liquid composition", "ratio", "percent")],
    outputs: [out("WL", "Liquid fraction", "ratio", "percent"), out("Wa", "Solid fraction", "ratio", "percent")],
    compute: ({ C0, Ca, CL }) => {
      if (CL === Ca) fail("The two phase compositions must differ.");
      const WL = (C0! - Ca!) / (CL! - Ca!);
      if (WL < 0 || WL > 1) fail("The overall composition must lie between the two phase compositions.", "C0");
      return { values: { WL, Wa: 1 - WL } };
    },
    refs: [{ inputs: { C0: 35, Ca: 43, CL: 31.5 }, expect: { WL: 69.56521739130, Wa: 30.43478260870 }, note: "Cu–Ni textbook example (Callister)" }],
  }),
  def({
    id: "corrosion-rate",
    name: "Corrosion rate (mass loss)",
    category: "materials",
    description: "Corrosion penetration rate from a coupon's mass loss.",
    formula: ["CR [mm/y] = 87.6·W / (ρ·A·t)", "W in mg, ρ in g/cm³, A in cm², t in h"],
    assumptions: ["Uniform corrosion (ASTM G1 / G31 coupon method)"],
    inputs: [inp("W", "Mass loss (mg)", "dimensionless", undefined, { ...nonneg }), inp("rho", "Density", "density", "g/cm3", { ...pos, default: 7.87 }), inp("A", "Exposed area", "area", "cm2", { ...pos }), inp("t", "Exposure time", "time", "h", { ...pos })],
    outputs: [out("CR", "Rate (mm/year)", "dimensionless")],
    compute: ({ W, rho, A, t }) => ({ values: { CR: (87.6 * W!) / ((rho! / 1000) * (A! * 1e4) * (t! / 3600)) } }),
    refs: [{ inputs: { W: 100, rho: 7.87, A: 10, t: 1000 }, expect: { CR: 0.1113087674714 }, note: "87.6·100/(7.87·10·1000)" }],
  }),
  def({
    id: "crystal-density",
    name: "Density from crystal structure",
    category: "materials",
    description: "Theoretical density of a crystal from its unit cell.",
    formula: ["ρ = n·A / (V_c·N_A), V_c = a³ (cubic)"],
    assumptions: ["Cubic cell; n atoms per cell: 1 simple cubic, 2 BCC, 4 FCC"],
    inputs: [inp("n", "Atoms per cell", "count", undefined, { min: 1, integer: true }), inp("A", "Atomic mass", "molarMass", "g/mol", { ...pos }), inp("a", "Lattice parameter", "length", "nm", { ...pos })],
    outputs: [out("rho", "Density", "density", "g/cm3")],
    compute: ({ n, A, a }) => ({ values: { rho: (n! * A!) / (a! ** 3 * NA) } }),
    refs: [{ inputs: { n: 2, A: 55.845, a: 0.2866 }, expect: { rho: 7.878342012670 }, note: "BCC iron (7.87 g/cm³ measured)" }],
  }),

  /* ── Instrumentation ── */
  def({
    id: "loop-4-20ma",
    name: "4–20 mA scaling",
    category: "instrumentation",
    description: "Process value from a 4–20 mA signal, for a transmitter range.",
    formula: ["PV = LRV + (I - 4)/16·(URV - LRV)", "% of span = (I - 4)/16"],
    assumptions: ["Linear transmitter", "Below 3.8 mA or above 20.5 mA usually signals a fault (NAMUR NE 43)"],
    inputs: [inp("I", "Signal", "current", "mA", { min: 0, max: 0.024 }), inp("lrv", "Range low (LRV)", "dimensionless"), inp("urv", "Range high (URV)", "dimensionless")],
    outputs: [out("pv", "Process value", "dimensionless"), out("pct", "Percent of span", "ratio", "percent")],
    compute: ({ I, lrv, urv }) => {
      const frac = (I! * 1000 - 4) / 16;
      const warnings = I! < 0.0038 || I! > 0.0205 ? ["Outside 3.8–20.5 mA: per NAMUR NE 43 this is a fault signal."] : [];
      return { values: { pv: lrv! + frac * (urv! - lrv!), pct: frac }, warnings };
    },
    refs: [
      { inputs: { I: 12, lrv: 0, urv: 10 }, expect: { pv: 5, pct: 50 }, note: "Mid-scale" },
      { inputs: { I: 8, lrv: -50, urv: 150 }, expect: { pv: 0, pct: 25 }, note: "Offset range" },
    ],
  }),
  def({
    id: "loop-value-to-ma",
    name: "Process value to 4–20 mA",
    category: "instrumentation",
    description: "Expected loop current for a process value and transmitter range.",
    formula: ["I = 4 + 16·(PV - LRV) / (URV - LRV)"],
    assumptions: ["Linear transmitter"],
    inputs: [inp("pv", "Process value", "dimensionless"), inp("lrv", "Range low (LRV)", "dimensionless"), inp("urv", "Range high (URV)", "dimensionless")],
    outputs: [out("I", "Signal", "current", "mA")],
    compute: ({ pv, lrv, urv }) => {
      if (urv === lrv) fail("The range can't be zero.", "urv");
      return { values: { I: (4 + (16 * (pv! - lrv!)) / (urv! - lrv!)) / 1000 } };
    },
    refs: [{ inputs: { pv: 75, lrv: 0, urv: 100 }, expect: { I: 16 }, note: "75 %" }],
  }),
  def({
    id: "rtd-pt100",
    name: "Pt100 RTD resistance",
    category: "instrumentation",
    description: "Resistance of a platinum RTD at a temperature, and temperature from resistance (0–850 °C).",
    formula: ["R = R₀·(1 + A·T + B·T²)", "A = 3.9083e-3, B = -5.775e-7 (IEC 60751)"],
    assumptions: ["T from 0 to 850 °C (below 0 °C the C term applies)"],
    inputs: [inp("R0", "R₀", "resistance", "ohm", { ...pos, default: 100 }), inp("T", "Temperature (°C)", "dimensionless", undefined, { optional: true, min: 0, max: 850 }), inp("R", "Resistance", "resistance", "ohm", { optional: true, ...pos })],
    outputs: [out("R", "Resistance", "resistance", "ohm"), out("T", "Temperature (°C)", "dimensionless")],
    pick: { count: 1, keys: ["T", "R"] },
    compute: ({ R0, T, R }) => {
      const A = 3.9083e-3;
      const B = -5.775e-7;
      if (T !== undefined) return { values: { T, R: R0! * (1 + A * T + B * T * T) } };
      if (R! < R0!) fail("Below R₀ the temperature is under 0 °C, outside this formula.", "R");
      const t = (-A + Math.sqrt(A * A - 4 * B * (1 - R! / R0!))) / (2 * B);
      return { values: { R: R!, T: t } };
    },
    refs: [
      { inputs: { R0: 100, T: 100 }, expect: { R: 138.5055 }, note: "IEC 60751 table: 138.51 Ω at 100 °C" },
      { inputs: { R0: 100, R: 119.4 }, expect: { T: 50.00746647419 }, note: "119.40 Ω ≈ 50 °C" },
    ],
  }),
  def({
    id: "thermistor-beta",
    name: "NTC thermistor (β model)",
    category: "instrumentation",
    description: "Resistance at a temperature, or temperature from resistance, using the β parameter.",
    formula: ["R = R₀·e^(β(1/T - 1/T₀))", "T = 1 / (1/T₀ + ln(R/R₀)/β)"],
    assumptions: ["β model: accurate near T₀ (±1 °C over about 50 K); use Steinhart–Hart beyond"],
    inputs: [
      inp("R0", "R₀ at T₀", "resistance", "kohm", { ...pos, default: 10 }),
      inp("T0", "T₀", "temperature", "C", { default: 25 }),
      inp("beta", "β (K)", "dimensionless", undefined, { ...pos, default: 3950 }),
      inp("T", "Temperature", "temperature", "C", { optional: true }),
      inp("R", "Resistance", "resistance", "kohm", { optional: true, ...pos }),
    ],
    outputs: [out("R", "Resistance", "resistance", "kohm"), out("T", "Temperature", "temperature", "C")],
    pick: { count: 1, keys: ["T", "R"] },
    compute: ({ R0, T0, beta, T, R }) => {
      if (T !== undefined) return { values: { T, R: R0! * Math.exp(beta! * (1 / T - 1 / T0!)) } };
      return { values: { R: R!, T: 1 / (1 / T0! + Math.log(R! / R0!) / beta!) } };
    },
    refs: [
      { inputs: { R0: 10, T0: 25, beta: 3950, T: 50 }, expect: { R: 3.588182581929 }, note: "10k NTC at 50 °C" },
      { inputs: { R0: 10, T0: 25, beta: 3950, R: 5 }, expect: { T: 41.46023479819 }, note: "5 kΩ" },
    ],
  }),
  def({
    id: "strain-gauge",
    name: "Strain gauge (quarter bridge)",
    category: "instrumentation",
    description: "Strain from a gauge's resistance change, and the quarter-bridge output.",
    formula: ["ε = (ΔR / R) / GF", "V_out ≈ V_ex·GF·ε / 4"],
    assumptions: ["Small strains (linear approximation of the quarter bridge)", "Temperature effects compensated"],
    inputs: [inp("R", "Gauge resistance", "resistance", "ohm", { ...pos, default: 350 }), inp("dR", "Resistance change", "resistance", "ohm"), inp("GF", "Gauge factor", "dimensionless", undefined, { ...pos, default: 2 }), inp("Vex", "Excitation", "voltage", "V", { ...pos, default: 5 })],
    outputs: [out("strain", "Strain", "ratio", "ppm"), out("Vout", "Bridge output", "voltage", "mV")],
    compute: ({ R, dR, GF, Vex }) => {
      const e = dR! / R! / GF!;
      return { values: { strain: e, Vout: (Vex! * GF! * e) / 4 } };
    },
    refs: [{ inputs: { R: 350, dR: 0.7, GF: 2, Vex: 5 }, expect: { strain: 1000, Vout: 2.5 }, note: "1000 µε" }],
  }),
  def({
    id: "snr",
    name: "Signal-to-noise ratio",
    category: "instrumentation",
    description: "SNR in dB from signal and noise powers or RMS amplitudes.",
    formula: ["SNR = 10·log₁₀(P_s / P_n) = 20·log₁₀(V_s / V_n)"],
    assumptions: ["Signal and noise measured in the same bandwidth and impedance"],
    inputs: [inp("Vs", "Signal (RMS)", "voltage", "V", { ...pos }), inp("Vn", "Noise (RMS)", "voltage", "mV", { ...pos })],
    outputs: [out("snr", "SNR (dB)", "dimensionless"), out("enob", "Effective bits", "dimensionless")],
    compute: ({ Vs, Vn }) => {
      const snr = 20 * Math.log10(Vs! / Vn!);
      return { values: { snr, enob: (snr - 1.76) / 6.02 } };
    },
    refs: [{ inputs: { Vs: 1, Vn: 1 }, expect: { snr: 60 }, note: "1 V over 1 mV" }],
  }),
  def({
    id: "nyquist",
    name: "Sampling rate (Nyquist)",
    category: "instrumentation",
    description: "Minimum sampling rate for a signal bandwidth, and the alias of a frequency.",
    formula: ["f_s ≥ 2·f_max", "Alias of f: |f - k·f_s| for the nearest whole k"],
    assumptions: ["Ideal sampling; in practice sample 2.5–10× with an anti-alias filter"],
    inputs: [inp("fmax", "Highest signal frequency", "frequency", "kHz", { ...pos }), inp("fs", "Your sampling rate", "frequency", "kHz", { optional: true, ...pos })],
    outputs: [out("fmin", "Minimum sampling rate", "frequency", "kHz"), out("alias", "Where f_max appears", "frequency", "kHz", { optional: true })],
    compute: ({ fmax, fs }) => {
      const values: Record<string, number> = { fmin: 2 * fmax! };
      const warnings: string[] = [];
      if (fs !== undefined) {
        values.alias = Math.abs(fmax! - Math.round(fmax! / fs) * fs);
        if (fs < 2 * fmax!) warnings.push("Your sampling rate is below 2·f_max: this frequency aliases.");
      }
      return { values, warnings };
    },
    refs: [
      { inputs: { fmax: 20 }, expect: { fmin: 40 }, note: "Audio band" },
      { inputs: { fmax: 7, fs: 10 }, expect: { alias: 3 }, note: "7 kHz sampled at 10 kHz shows at 3 kHz" },
    ],
  }),
  def({
    id: "ziegler-nichols",
    name: "PID tuning (Ziegler–Nichols)",
    category: "instrumentation",
    description: "PID settings from the ultimate gain and oscillation period (closed-loop method).",
    formula: ["P: K_p = 0.5·K_u", "PI: K_p = 0.45·K_u, T_i = T_u/1.2", "PID: K_p = 0.6·K_u, T_i = T_u/2, T_d = T_u/8"],
    assumptions: ["Classic Ziegler–Nichols: aggressive (about ¼ decay), a starting point to refine", "Ideal (ISA) PID form"],
    inputs: [inp("Ku", "Ultimate gain K_u", "dimensionless", undefined, { ...pos }), inp("Tu", "Ultimate period T_u", "time", "s", { ...pos })],
    outputs: [out("Kp", "K_p (PID)", "dimensionless"), out("Ti", "T_i (PID)", "time", "s"), out("Td", "T_d (PID)", "time", "s"), out("Ki", "K_i = K_p/T_i (1/s)", "dimensionless"), out("Kd", "K_d = K_p·T_d (s)", "dimensionless")],
    compute: ({ Ku, Tu }) => {
      const Kp = 0.6 * Ku!;
      const Ti = Tu! / 2;
      const Td = Tu! / 8;
      return { values: { Kp, Ti, Td, Ki: Kp / Ti, Kd: Kp * Td } };
    },
    refs: [{ inputs: { Ku: 10, Tu: 4 }, expect: { Kp: 6, Ti: 2, Td: 0.5, Ki: 3, Kd: 3 }, note: "0.6·10; 4/2; 4/8" }],
  }),
  def({
    id: "first-order-response",
    name: "First-order step response",
    category: "instrumentation",
    description: "Time for a first-order system to reach a fraction of its final value.",
    formula: ["y(t)/y_∞ = 1 - e^(-t/τ)", "t = -τ·ln(1 - p)"],
    assumptions: ["Pure first-order lag (sensors, RC, thermal masses), no dead time"],
    inputs: [inp("tau", "Time constant", "time", "s", { ...pos }), inp("p", "Fraction reached", "ratio", "percent", { min: 0, max: 1, exclusiveMax: true })],
    outputs: [out("t", "Time", "time", "s")],
    compute: ({ tau, p }) => ({ values: { t: -tau! * Math.log(1 - p!) } }),
    refs: [{ inputs: { tau: 10, p: 63.212055882856 }, expect: { t: 10 }, note: "63.2 % at one τ" }],
  }),
  def({
    id: "horizontal-tank",
    name: "Horizontal cylindrical tank volume",
    category: "instrumentation",
    description: "Liquid volume in a horizontal cylinder from the level.",
    formula: ["V = L·(r²·acos((r - h)/r) - (r - h)·√(2rh - h²))"],
    assumptions: ["Flat ends (no dished heads)", "0 ≤ h ≤ 2r"],
    inputs: [inp("D", "Diameter", "length", "m", { ...pos }), inp("L", "Length", "length", "m", { ...pos }), inp("h", "Liquid level", "length", "m", { ...nonneg })],
    outputs: [out("V", "Liquid volume", "volume", "m3"), out("pct", "Fill", "ratio", "percent"), out("Vfull", "Full volume", "volume", "m3")],
    compute: ({ D, L, h }) => {
      const r = D! / 2;
      if (h! > D!) fail("The level can't be above the diameter.", "h");
      const V = L! * (r * r * Math.acos((r - h!) / r) - (r - h!) * Math.sqrt(2 * r * h! - h! * h!));
      const Vfull = Math.PI * r * r * L!;
      return { values: { V, pct: V / Vfull, Vfull } };
    },
    refs: [
      { inputs: { D: 2, L: 2, h: 0.5 }, expect: { V: 1.228369698609 }, note: "Quarter-depth level" },
      { inputs: { D: 2, L: 1, h: 1 }, expect: { pct: 50 }, note: "Half full" },
    ],
  }),

  /* ── Computer engineering ── */
  def({
    id: "transfer-time",
    name: "Download / transfer time",
    category: "computer",
    description: "Time to transfer a file at a link speed.",
    formula: ["t = size / (rate·efficiency)"],
    assumptions: ["Steady rate; efficiency covers protocol overhead (TCP/IP ≈ 90–95 %)"],
    inputs: [inp("size", "Size", "data", "GB", { ...pos }), inp("rate", "Link speed", "dataRate", "Mbit/s", { ...pos }), inp("eff", "Efficiency", "ratio", "percent", { min: 0, max: 1, exclusiveMin: true, default: 100 })],
    outputs: [out("t", "Time", "time", "min")],
    compute: ({ size, rate, eff }) => ({ values: { t: size! / (rate! * eff!) } }),
    refs: [{ inputs: { size: 1, rate: 100, eff: 100 }, expect: { t: 1.333333333333 }, note: "8 Gbit / 100 Mbit/s = 80 s" }],
  }),
  def({
    id: "cpu-time",
    name: "CPU execution time",
    category: "computer",
    description: "Execution time and MIPS from instruction count, CPI and clock.",
    formula: ["t = N·CPI / f", "MIPS = f / (CPI·10⁶)"],
    assumptions: ["Average CPI over the program"],
    inputs: [inp("N", "Instructions", "dimensionless", undefined, { ...pos }), inp("CPI", "Cycles per instruction", "dimensionless", undefined, { ...pos }), inp("f", "Clock", "frequency", "GHz", { ...pos })],
    outputs: [out("t", "Time", "time", "ms"), out("mips", "MIPS", "dimensionless"), out("period", "Clock period", "time", "ns")],
    compute: ({ N, CPI, f }) => ({ values: { t: (N! * CPI!) / f!, mips: f! / (CPI! * 1e6), period: 1 / f! } }),
    refs: [{ inputs: { N: 1e9, CPI: 2, f: 2 }, expect: { t: 1000, mips: 1000, period: 0.5 }, note: "1e9·2/2e9 = 1 s" }],
  }),
  def({
    id: "cache-amat",
    name: "Average memory access time",
    category: "computer",
    description: "Average memory access time of a cache.",
    formula: ["AMAT = hit time + miss rate·miss penalty"],
    assumptions: ["Single cache level (nest the formula for more)"],
    inputs: [inp("hit", "Hit time", "time", "ns", { ...nonneg }), inp("miss", "Miss rate", "ratio", "percent", { min: 0, max: 1 }), inp("penalty", "Miss penalty", "time", "ns", { ...nonneg })],
    outputs: [out("amat", "AMAT", "time", "ns")],
    compute: ({ hit, miss, penalty }) => ({ values: { amat: hit! + miss! * penalty! } }),
    refs: [{ inputs: { hit: 1, miss: 5, penalty: 100 }, expect: { amat: 6 }, note: "1 + 0.05·100" }],
  }),
  def({
    id: "amdahl",
    name: "Amdahl's law",
    category: "computer",
    description: "Overall speed-up when part of a job is sped up.",
    formula: ["S = 1 / ((1 - p) + p/s)"],
    assumptions: ["p: fraction of the time that benefits; s: its speed-up (e.g. cores)"],
    inputs: [inp("p", "Parallel fraction", "ratio", "percent", { min: 0, max: 1 }), inp("s", "Speed-up of that part", "dimensionless", undefined, { ...pos })],
    outputs: [out("S", "Overall speed-up", "dimensionless"), out("limit", "Limit as s → ∞", "dimensionless", undefined, { optional: true })],
    compute: ({ p, s }) => ({ values: { S: 1 / (1 - p! + p! / s!), ...(p! < 1 ? { limit: 1 / (1 - p!) } : {}) } }),
    refs: [{ inputs: { p: 90, s: 8 }, expect: { S: 4.705882352941, limit: 10 }, note: "90 % on 8 cores" }],
  }),
  def({
    id: "bandwidth-delay",
    name: "Bandwidth-delay product",
    category: "computer",
    description: "Data in flight on a link: the TCP window needed to fill it.",
    formula: ["BDP = rate·RTT"],
    assumptions: ["Round-trip time at the rate"],
    inputs: [inp("rate", "Link speed", "dataRate", "Mbit/s", { ...pos }), inp("rtt", "Round-trip time", "time", "ms", { ...pos })],
    outputs: [out("bdp", "Bandwidth-delay product", "data", "kB")],
    compute: ({ rate, rtt }) => ({ values: { bdp: rate! * rtt! } }),
    refs: [{ inputs: { rate: 100, rtt: 50 }, expect: { bdp: 625 }, note: "5 Mbit = 625 kB" }],
  }),
];

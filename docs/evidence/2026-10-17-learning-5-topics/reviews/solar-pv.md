# Review: Off-grid Solar PV System Sizing (basic)

Source: `solar-pv.json` (outline: 5 modules / 26 lessons; lessons reviewed: first 3). All worked-example numbers were recomputed with python3. I rated the videos from their title, channel and duration only. I did not watch them.

## Outline

The order makes sense for a basic course: resource, then PV module, then load, then battery, then controller, then a full worked design. There are some overlaps and gaps:
- **Overlaps.** "Adding design margins: days of autonomy" (M2) comes back in "Calculating required battery bank Ah from load and autonomy" (M3). MPPT appears three times: M1 L3, M4 L1 and M4 L4.
- **Gaps.** No lesson teaches PV array sizing before the capstone (M5 L3). Nothing covers system-voltage choice (12/24/48 V), wiring and voltage drop, fusing/overcurrent protection, inverter sizing (even though M2 L2 says loads drive "inverter selection"), or worst-month/design-month sizing.
- **Order.** "Reading panel datasheets: STC, NOCT" (M1 L4) comes after "MPPT and temperature effects" (M1 L3), but L3 lists it as a prerequisite. Swap the two.

## Lesson 1 — Solar Irradiance Fundamentals: GHI, POA, and Peak Sun Hours

- **a. Equations**
  - `PSH = E_POA / (1 kWh/m^2)`: the number comes out right but the units don't. kWh/m²/day ÷ kWh/m² gives 1/day, not the stated "h/day". The divisor should be the reference irradiance **1 kW/m² (1000 W/m²)**, which is what the validity text itself says. The same slip appears in worked-example step 2.
  - `E_POA = E_GHI × f_tilt`: correct as an approximation. The validity statement (needs a site/software-derived factor, does not replace geometry or shading analysis) is good. It could add that f_tilt is seasonal and can be < 1.
- **b. Worked example.** 4.8 × 1.10 = **5.28 kWh/m²/day**, so PSH = **5.28 h/day**. The answer is correct. Only the unit in step 2 needs fixing.
- **c. Theory/explanation.** Nothing is factually wrong. One omission: "tilt changes how much direct beam and diffuse radiation strike the array" leaves out the ground-reflected (albedo) part of POA. A bigger gap for an off-grid course: it never says that off-grid arrays are normally sized on the **worst-month** POA PSH, not the annual average. DNI/DHI are not defined, and no data sources are named (PVGIS, NASA POWER, NSRDB). The prerequisite "Basic understanding of solar geometry" is not part of the course prerequisites and is not taught.
- **d. Diagrams.** None. A GHI vs POA (beam/diffuse/reflected) sketch and a daily irradiance curve with the equivalent PSH rectangle are needed.
- **e. References.** All three are real. Duffie & Beckman, *Solar Engineering of Thermal Processes* (Wiley). Dunlop, *Photovoltaic Systems* (ATP). NREL *Solar Radiation Data Manual for Flat-Plate and Concentrating Collectors* (Marion & Wilcox, 1994). That last one is labelled "application note" but is actually a technical report/data manual.
- **f. Depth.** Thin (≈170 + 95 words), but the core definitions are right and can be used. Add worst-month sizing and where to get the data.
- **g. Videos**

| Video | Rating | Why |
|---|---|---|
| Solar Radiance and Irradiance (Justice and Mercy Energy Services, 3:00) | Loosely related | General intro to irradiance; title suggests no GHI/POA/PSH |
| Solar Tutorial PART-6: What is GHI, DNI, DHI, Zenith Angle (EXOCON, 9:31) | Relevant | Directly covers GHI and its components |
| Average Irradiance (Penn State Solar Center, 1:14) | Loosely related | Very short clip on averaging; probably only touches PSH |
| Sizing Solar: The Math of Peak Sun Hours (Taqa TV, 5:12) | Relevant | PSH used for sizing, which is the lesson's goal |

- **h. Score: 4/5.** Fixes:
  - change the PSH divisor to 1 kW/m² in the equation and in step 2;
  - mention the ground-reflected component;
  - add design-month (worst-month) PSH guidance and data sources;
  - add one diagram;
  - relabel the NREL reference.

## Lesson 2 — PV cell operation and the I-V curve

- **a. Equations**
  - Single-diode model `I = Iph − I0(exp(qV/nkT) − 1) − V/Rsh`: correct for a **cell**. Symbols and units are right (q in C, k in J/K, T in K). The validity statement (uniform illumination, steady state, Rs added by V → V + IRs) is correct. Worth adding: for a module the exponent becomes qV/(N_s·n·k·T). This matters because the diagram and the worked example are both at module level.
  - Fill factor `FF = VmpImp/(VocIsc)`: correct. The validity is fine.
  - Efficiency `η = Pmax/(G·A)`: correct. Two caveats. The validity "Defined under STC… unless stated otherwise" mixes up the rated value with the formula, which holds at any stated G and T. The "Active cell/module area" symbol is ambiguous, because module efficiency uses total module area and active area overstates it.
- **b. Worked example.** Pmax = 37.0 × 8.00 = **296 W**. Voc·Isc = **374 W**. FF = 296/374 = **0.7914**. The answer (296 W, 0.791) is correct. The values are realistic for a 72-cell module (Vmp/Voc = 0.84, Imp/Isc = 0.94).
- **c. Theory/explanation**
  - Error: "*V_oc decreases with temperature (about -0.3 to -0.5 %/°C for crystalline silicon)*". This range is too high. Typical c-Si Voc coefficients are about **−0.25 to −0.35 %/°C** (−1.7 to −2.2 mV/K per cell gives −0.24 to −0.36 %/K by calculation). −0.5 %/°C is a Pmax-type value. It also contradicts Lesson 3's "−0.3 to −0.4 %/°C".
  - Everything else is sound. That includes the current source in parallel with a diode, Isc rising slightly with temperature, irradiance mainly scaling current, and "first quadrant" (consistent with the sign convention of the equation used).
- **d. Diagrams.** One I-V/P-V figure, cited to Duffie & Beckman, 4th ed., Ch. 23. That is plausible: Ch. 23 is "Design of Photovoltaic Systems" and contains I-V curves. The chapter title is paraphrased and no figure number is given. A temperature/irradiance family of curves would help.
- **e. References**
  - Duffie & Beckman: real.
  - IEC 60904-1: real, and the title is correct.
  - Messenger & Ventre: real authors, but the book is ***Photovoltaic Systems Engineering*** (CRC Press), not "Photovoltaic Systems". The title is wrong and appears mixed up with Dunlop's book.
- **f. Depth.** Adequate for basic (≈190 + 80 words, 3 equations). The single-diode model is a bit beyond "basic" but is presented clearly. Missing: cells in series make a module, and bypass diodes.
- **g. Videos**

| Video | Rating | Why |
|---|---|---|
| Physics of Solar Cells Lesson 2 – The Current-Voltage (IV) Curve (Mark Mrohs, 3:59) | Relevant | Exactly the I-V curve topic |
| I-V Curves Explained (Fluke Corporation, 2:46) | Relevant | Isc/Voc/MPP basics from a test-equipment angle |
| I-V and P-V Characteristics of Solar PV Module (DTE EEE, 12:23) | Relevant | I-V and P-V curves, MPP, FF |
| How P-N Junctions ACTUALLY Work (The Photovoltaic Effect Explained) (Zema Academy, 5:46) | Relevant | Covers the photovoltaic-effect objective |

- **h. Score: 4/5.** Fixes:
  - correct the Voc temperature-coefficient range to about −0.25 to −0.35 %/°C, and make it match Lesson 3;
  - fix the Messenger & Ventre title;
  - note the N_s factor for modules;
  - clarify the area used for module efficiency.

## Lesson 3 — Maximum Power Point Tracking and Temperature Effects

- **a. Equations**
  - `Voc(T) = Voc,STC[1 + (γ_Voc/100)(Tcell − 25)]`: correct form, symbols and units.
    - The validity "*valid … (-20 to +80 °C)*" is misleading. The main design use of this formula, cold-weather Voc for string and controller limits, routinely uses record lows below −20 °C (e.g., NEC 690.7 uses the lowest expected ambient).
    - It should also state that irradiance is assumed constant (≈1000 W/m²).
  - `Pmax(T) = Pmax,STC[1 + (γ_Pmax/100)(Tcell − 25)]`: correct. The validity note about irradiance and low-light effects is appropriate.
- **b. Worked example.** ΔT = **40 °C**. Voc = 40.0 × (1 − 0.14) = **34.4 V**. Pmax = 300 × 0.84 = **252 W**. Loss = **48 W (16.0 %)**. The answer is correct.
  - Teaching gap: the example only covers the hot case. The lesson stresses designing for cold Voc, so a second step would help. For example, at −10 °C, Voc = **44.9 V** (my calculation).
  - The theory's "300 W → ~240–260 W in a hot climate" holds up. With ambient 30–40 °C, cell rise 20–30 °C and γ −0.4 to −0.5, I get 232–270 W from temperature alone.
- **c. Theory/explanation**
  - Error: "*you must size wiring, fuses, and the controller for the cold Voc*". Conductor ampacity and fuse current ratings are sized from **Isc** (with the usual 125 % factors). Cold Voc sets only the **voltage** rating of the controller, fuses, disconnects and conductor insulation.
  - "Pmax … roughly −0.4 to −0.5 %/°C" is on the pessimistic side for current modules (mono PERC about −0.35, TOPCon/HJT −0.25 to −0.32). It is acceptable for older modules.
  - "MPPT is a DC-DC converter algorithm" mixes up the algorithm with the converter it controls. This is a minor wording issue.
  - The rest is correct: the MPP moves with temperature and irradiance, PWM holds the array near battery voltage, P&O/IncCond/fractional-Voc are the common methods, and a 10–30 % MPPT gain is a commonly quoted range.
  - Prerequisite problem: it lists "Reading panel datasheets: STC, NOCT…", which is the **next** lesson (M1 L4).
  - Cell temperature from ambient is never given as a formula (e.g., NOCT: Tcell ≈ Tamb + (NOCT − 20)/800 · G), even though it is the mistake the lesson warns about.
  - Objective 4 ("Estimate the energy gain of MPPT…") has no method or example behind it.
- **d. Diagrams.** None. Needed: I-V/P-V curves at several temperatures showing the MPP moving, and a PWM operating point vs the MPP.
- **e. References.** Dunlop, *Photovoltaic Systems*, and Duffie & Beckman are real and suitable. There is no MPPT source; Esram & Chapman, "Comparison of PV array MPPT techniques", IEEE Trans. Energy Conversion (2007), is a standard one to add.
- **f. Depth.** Reasonable on temperature effects (≈240 + 70 words). Thin on MPPT: no explanation of how P&O works and no estimate of the gain. Usable after the fixes.
- **g. Videos**

| Video | Rating | Why |
|---|---|---|
| MPPT explained (AKIO TV, 5:12) | Relevant | MPPT principle |
| Solar MPPT Explained: Maximum Power Point Tracking (Australian Control Engineering, 3:58) | Relevant | MPPT principle, short |
| MPPT concept ("Design of photovoltaic systems", 17:59) | Relevant | Lecture-style MPPT concept; likely more advanced than basic |
| Do Solar Panels Go OVER Voltage Limits In Freezing Temps? (Jasonoid, 7:08) | Relevant | Cold-weather Voc rise against controller limits, the lesson's key design point |

- **h. Score: 3/5.** Fixes:
  - correct the "size wiring, fuses… for cold Voc" sentence (current sizing uses Isc; cold Voc sets voltage ratings);
  - widen or reword the Voc validity range and state the irradiance assumption;
  - fix the forward-referencing prerequisite, or reorder M1 L3/L4;
  - add the NOCT cell-temperature formula;
  - add a cold-Voc step to the example;
  - add a simple MPPT-vs-PWM gain estimate, or drop objective 4;
  - add diagrams.

## Verdict

The course structure is sound for beginners. The three lessons reviewed get the core physics right, and all three worked examples are arithmetically correct. The errors are small but real:
- a PSH unit slip (Lesson 1);
- an inflated, inconsistent Voc temperature coefficient (Lesson 2);
- a misleading "size wiring and fuses for cold Voc" statement (Lesson 3);
- an overly narrow validity range (Lesson 3);
- a prerequisite that points to a later lesson (Lesson 3);
- one wrong book title (Lesson 2).

Each lesson can be used after short edits. Adding the missing diagrams and worst-month (design-month) sizing guidance would make the biggest difference, along with the outline gaps (array sizing, system voltage, wiring/fusing, inverter).

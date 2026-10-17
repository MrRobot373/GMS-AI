# Review: Three-Phase Induction Motors: Torque-Speed Characteristics and Starting Methods (intermediate)

## Outline

The structure is sensible for an intermediate course: 6 modules and 19 lessons, running from the equivalent circuit to the torque-slip derivation, operating regions, conventional starters, electronic starters, and a design example. Three things to fix:

- **Order.** "Rotating magnetic field and slip" comes after the equivalent-circuit lesson, but that lesson already depends on slip (R_r'/s). Swap lessons 1.1 and 1.2.
- **Duplication.** Lessons 2.1 ("Air-gap power and electromagnetic torque expression … derive torque in terms of slip") and 2.2 ("Deriving torque as a function of slip") largely repeat each other, and both repeat T = P_ag/ω_s from lesson 1.3. Merge 2.1 into 2.2, or make 2.1 the Thevenin-equivalent lesson.
- **Gaps.** For a course about curve shape and starting, the outline leaves out:
  - NEMA/IEC design classes (A/B/C/D, N/H) and deep-bar or double-cage rotors;
  - rotor-resistance starting of wound-rotor motors as a starting method (it appears only as "effect of rotor resistance");
  - primary resistor/reactor starting;
  - acceleration time from load inertia and accelerating torque.

## Lesson 1 — Per-Phase Equivalent Circuit and Parameter Definitions

**a. Equations**
- Slip s = (n_s − n)/n_s: correct. It is a definition, so "steady-state balanced operation" is not really needed as a validity condition.
- n_s = 120 f_1/P: correct, and the validity statement is fine.
- **Referred rotor resistance R_r' = R_r/a² with a = N_s/N_r: wrong.** Referring a rotor impedance to the stator *multiplies* it by a², so R_r' = a²·R_r and X_lr' = a²·X_lr (Chapman: R_2 = a_eff²·R_R). The validity statement ("Linear magnetic circuit; constant a (no saturation)") doesn't mean much, because the turns ratio does not depend on saturation. For cage rotors the referred values are simply measured.
- DC test R_s = V_dc/(2 I_dc) for a wye connection: correct. It could also say that the delta case is R = 1.5·V_dc/I_dc, and that this is a DC value (no skin effect).
- R_c = V_0²/(P_0 − I_0²R_s) and X_m = V_0/√(I_0² − (V_0/R_c)²): correct only for the *approximate* circuit, with the shunt branch moved to the terminals. The validity statement leaves out two assumptions:
  - The voltage drop across R_s + jX_ls is neglected. This contradicts the "standard" circuit described in the theory, where the magnetizing branch sits behind the stator impedance.
  - P_0 − I_0²R_s still contains friction and windage, so R_c absorbs the rotational losses.
- X_m equation: its symbol table defines only X_m.
- Locked-rotor Z/R/X: the formulas are correct, and R_lr = R_s + R_r' is right (magnetizing branch neglected).
  - The symbol **X_lr** is used both for the total locked-rotor reactance and, in the theory, for the rotor leakage reactance.
  - The validity statement "at rated frequency" is incomplete. A rated-frequency test gives *starting* parameters. IEEE 112 and Chapman recommend testing at ≤25 % of rated frequency for running-condition parameters, then scaling X back to rated frequency, because skin effect inflates R_r' at s = 1.

**b. Worked example** (recomputed with python3)
- R_s = 1.000 Ω; I_0²R_s = 16.0 W; P_0 − 16 = 104 W; R_c = 138.46 Ω; I_c = 0.8667 A; I_m = 3.905 A; X_m = 30.73 Ω.
- Z_lr = 3.000 Ω; R_lr = 2.000 Ω; R_r' = 1.000 Ω; X_lr(total) = 2.2361 Ω; X_ls = X_lr' = 1.118 Ω.
- **The arithmetic is all correct.** The data are plausible: no-load pf 0.25, and a rated-voltage starting current of about 40 A per phase.
- Two problems with the method:
  1. **The step "Core loss = P0 − 16 = 104 W" mislabels the quantity.** 104 W is core loss plus friction and windage. The lesson's own explanation says the no-load input includes friction/windage.
  2. X_m is computed without subtracting the X_ls drop. Standard textbook methods give X_m ≈ 27.9 Ω (Fitzgerald: X_nl − X_ls, with X_nl = 29.05 Ω) or 28.9 Ω (Chapman: Z_nl − X_ls). With the shunt branch placed behind R_s + jX_ls, the result is R_c ∥ X_m = 126.5 Ω ∥ 29.4 Ω. The quoted 30.7 Ω is therefore 4–10 % high. That is acceptable only if the lesson labels it as an approximation.

**c. Theory / explanation**
- **Error:** "R_r' = R_r/a^2 and X_lr' = X_lr/a^2". The ratio is inverted; it should be a²·R_r and a²·X_lr.
- Inconsistency: the theory describes the exact circuit, with the magnetizing branch after the stator impedance, while the test formulas assume the approximate circuit. The lesson should say which one it uses.
- Minor: the takeaway "R_r'/s varies from ∞ (no load)" is only true at synchronous speed. At no load, s is small but not zero.
- The rest is correct: slip frequency, the "rotating transformer" analogy, the reason for testing at reduced voltage, and the leakage-split note. The 0.5/0.5 and 0.4/0.6 splits match the IEEE 112 / NEMA design-class tables; it would help to name the classes.

**d. Diagrams**
- "Chapman, Electric Machinery Fundamentals, 5th ed., Chapter 7": the book and the figure are real. However, in the 5th edition Induction Motors is **Chapter 6**; it was Chapter 7 in the 4th edition. The chapter number needs correcting.

**e. References**
- Chapman, *Electric Machinery Fundamentals*: real.
- Fitzgerald/Kingsley/Umans, *Electric Machinery*: real.
- IEEE Std 112-2017: real.
- NEMA MG 1: real.
- No invented references.

**f. Depth**
- About 400 words of prose, 7 equations and a full parameter-extraction example. That is adequate and usable for intermediate level.
- Missing:
  - how to separate friction and windage from core loss (plot of no-load input against V²);
  - a delta-connection DC test;
  - temperature correction values.

**g. Videos**

| Video | Rating | Why |
|---|---|---|
| Equivalent Circuit of The Three Phase Induction Motor (Sanath Alahakoon, 13:49) | Relevant | Exactly this lesson's circuit |
| #10 Determining Equivalent Circuit parameters - Synchronous Gen (Linear Method) (ELECTRICAL IS EASY, 20:23) | Off-topic | Synchronous generator OC/SC tests, a different machine; would confuse students |
| Equivalent Circuit Parameters - Single Phase Induction Motor (Ekeeda, 15:06) | Loosely related | Single-phase double-revolving-field circuit, not three-phase |
| Induction Motor No Load Test (Lee Thian Pau, 9:44) | Relevant | Covers the no-load test used in the lesson |

**h. Score: 3/5.** Usable after these fixes:
- invert the referral formula (theory and equation);
- relabel 104 W as "core + friction and windage" (or give F&W and subtract it);
- state the approximate-circuit assumption for R_c and X_m, or compute X_m = X_nl − X_ls;
- rename the total locked-rotor reactance (e.g. X_eq);
- add the locked-rotor test-frequency note;
- correct the Chapman chapter number;
- replace the synchronous-generator video.

## Lesson 2 — Rotating Magnetic Field and Slip Concept

**a. Equations**
- n_s = 120 f_s/P: correct. The validity statement should say "even" rather than "integer" pole number; the next equation does say even.
- ω_s = 4π f_s/P: correct as a mechanical speed in rad/s. It is worth saying that this is mechanical, not electrical (2πf).
- Slip in both rpm and rad/s forms: correct. The validity statement and sign convention are fine.
- f_r = s·f_s: correct, and the validity statement (fundamental field, space harmonics neglected) is meaningful.

**b. Worked example** (recomputed with python3)
- n_s = 1500 rpm; s = 60/1500 = 0.0400; f_r = 2.00 Hz. The bonus values ω_s = 157.08 rad/s and ω_r = 150.80 rad/s are consistent.
- **Correct.** It is very easy for intermediate level, though. It could add the speed of the field relative to the rotor (60 rpm), ω values, or a generating case (s < 0).

**c. Theory / explanation**
- No factual errors. "At synchronous speed, slip is zero and no torque is produced" is correct, and so is the statement about negative slip meaning generating.
- Minor overgeneralization: the takeaway "Positive slip corresponds to motoring". Motoring is 0 < s < 1; s > 1 (plugging/braking) also has positive slip. Lesson 3.1 covers plugging, so this is worth tightening.
- "Rotor reactance is small at normal operating slip": correct (sX_r).

**d. Diagrams**
- Fitzgerald/Kingsley/Umans, *Electric Machinery*, 7th ed., Chapter 4: plausible and real. Chapter 4, "Introduction to Rotating Machines", covers rotating MMF waves. The 7th edition is published as *Fitzgerald & Kingsley's Electric Machinery* (Umans).

**e. References**
- Fitzgerald et al. and Chapman: both real.

**f. Depth**
- Thin: about 220 words of prose. For a lesson titled "Rotating magnetic field", it never shows *how* the field arises. Missing:
  - the sum of three pulsating MMFs giving a constant-amplitude wave of 3/2·F_max;
  - direction reversal by swapping two phases;
  - mechanical vs electrical degrees.
- Usable as a refresher, since the outline lists slip as a prerequisite, but not as a full lesson.

**g. Videos**

| Video | Rating | Why |
|---|---|---|
| Induction Motor animation I: The Rotating Magnetic Field RMF (learnchannel, 2:19) | Relevant | Animates the RMF, filling the lesson's gap |
| How to Generate a Rotating Magnetic Field in AC Motors: A Vector approach (Power Eng. By Afshin, 3:54) | Relevant | Vector sum of the three phase MMFs |
| How Three Phase Induction Motors Work? Principle of RMF Explained (Simplegyan Engineering, 6:33) | Relevant | RMF and induction principle |
| Slip Speed and Slip in a Motor (Zack Hartle, 6:33) | Relevant | Directly covers slip |

**h. Score: 4/5.** Fixes:
- add a short derivation or description of the RMF (3/2 amplitude, phase-sequence reversal);
- restrict "positive slip = motoring" to 0 < s < 1;
- change "integer" to "even" in the n_s validity statement;
- optionally make the example harder.

## Lesson 3 — Power Flow and Loss Components in a Three-Phase Induction Motor

**a. Equations**
- P_in = 3·V_1·I_1·cos φ with phase quantities: correct, and so is the validity statement.
- P_ag = P_in − P_scl − P_core: correct under Chapman's convention (core loss on the stator side).
- P_rcl = s·P_ag: correct, and exact within the equivalent circuit.
  - "(referred to stator)" in the symbol meaning is unnecessary, because power does not change when it is referred.
  - The validity clause "assumes rotor resistance is the dominant rotor loss" is vague.
- P_dev = (1 − s)·P_ag: correct. The validity "0 < s < 1" is narrower than necessary; the relation holds for all s, with sign.
- P_out = P_dev − P_mech: this **omits stray-load (miscellaneous) loss**. IEEE 112 treats it as a separate loss, and Chapman subtracts P_misc.
- T_em = P_ag/ω_s with "ω_s = 2π f_s/p": correct, but it uses lowercase p for pole pairs while the rest of the course, including this example, uses P for poles. This notation clash will cause 2× mistakes.
- η = P_out/P_in: correct.

**b. Worked example** (recomputed with python3)
- P_ag = 9300 W; P_rcl = 279.0 W; P_dev = 9021.0 W; P_out = 8821.0 W.
- ω_s = 157.080 rad/s; T_em = 59.21 N·m; η = 0.8821 (88.2 %).
- Check: P_dev/ω_r = 9021/152.37 = 59.21 N·m = T_em ✓.
- **All values correct.**
- The 400 V and 0.85 pf data in the problem are never used. They give I_L = 16.98 A and R_1 ≈ 0.462 Ω/phase for a wye connection, which is consistent with 400 W stator copper loss. Either use them, for example to compute I_L and T_out = 57.9 N·m at 1455 rpm, or remove them.

**c. Theory / explanation**
- **Error:** "Core loss is roughly constant with voltage and frequency". Core loss depends strongly on voltage (roughly ∝ V², since B ∝ V/f) and on frequency. The correct statement is that core loss is roughly constant *from no load to full load at fixed voltage and frequency*.
- Incomplete claim in the takeaway: "Total losses are stator copper, core, rotor copper, and mechanical". It leaves out stray-load loss, typically about 0.5–2 % of output.
- Overgeneralization in the takeaway: "low slip means high efficiency". Low slip bounds rotor efficiency (1 − s), but a lightly loaded motor has low slip and poor efficiency.
- Minor: the explanation gives per-phase losses ("I_1^2 R_1", "I_2'^2 R_2'") while the equations use 3·I²R.
- Correct: "rotor copper loss is small (a few percent of P_ag)" and "core loss … in the stator (and a small part in the rotor)".

**d. Diagrams**
- Fitzgerald/Kingsley/Umans, 6th ed., Chapter 6: plausible. In the 6th edition, Chapter 6 is "Polyphase Induction Machines".
- The block-style power-flow diagram described is the one Chapman is known for. Fitzgerald presents the same split through the equivalent circuit. The figure description may not match Fitzgerald exactly; Chapman's power-flow figure would be a safer citation.

**e. References**
- Fitzgerald et al.: real.
- Jim (Jimmie J.) Cathey, *Electric Machines: Analysis and Design Applying MATLAB* (McGraw-Hill): real.
- No invented references.

**f. Depth**
- About 320 words of prose, 7 equations and a complete power-balance example. Adequate for intermediate level.
- Missing:
  - P_conv = 3·I_2'²·R_2'(1 − s)/s from the equivalent circuit, which links back to lesson 1;
  - stray-load loss;
  - how each loss scales with load.

**g. Videos**

| Video | Rating | Why |
|---|---|---|
| GATE 2027 DAILY QUESTION: POWER FLOW / EFFICIENCY OF INDUCTION MOTOR (ENGINEERS CAREER GROUP, 11:46) | Relevant | Worked power-flow and efficiency problem (exam-prep style) |
| Induction Motors: Power Flow and Power Conversion (Power Eng. By Afshin, 2:04) | Relevant | Exactly the power-flow topic, short |
| Induction Motors, Part XVI: Air Gap Power, Converted Power and Rotor Copper Losses (Lutfi Al-Sharif, 4:01) | Relevant | P_ag / P_rcl / P_conv split |
| Simulating Speed-Torque Characteristics of a 3 Phase Induction Motor using Matlab Simulink (Professor Pahadi, 8:06) | Loosely related | Torque-speed simulation; belongs in Module 2, not power flow |

**h. Score: 4/5.** Fixes:
- correct the core-loss sentence;
- add stray-load loss, or qualify "total losses";
- unify the pole notation (P poles; ω_s = 4πf/P);
- qualify "low slip means high efficiency";
- use or remove the 400 V / 0.85 pf data;
- replace the Simulink video.

## Verdict

I recomputed all three worked examples with python3 and the arithmetic is correct. The course outline is sound, apart from the lesson 1.1/1.2 order and the 2.1/2.2 overlap. There are three substantive technical errors, plus one citation chapter error:

1. Lesson 1: the rotor-referral formula is inverted (R_r' = R_r/a²; it should be a²·R_r).
2. Lesson 1: the worked example calls 104 W of core-plus-friction/windage loss "core loss".
3. Lesson 3: it says core loss is "roughly constant with voltage and frequency".
4. Lesson 1: the Chapman 5th-edition chapter is wrong (Chapter 7 cited; it is Chapter 6).

Several smaller imprecisions also need attention: the unstated approximate-circuit assumption behind X_m, the notation clashes, and the missing stray-load loss. With those fixes the lessons are ready for students. Lesson 2 should also be expanded on how the rotating field is produced.

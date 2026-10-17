# Review: Shell-and-Tube Heat Exchanger Design (LMTD and ε-NTU), intermediate

Every worked-example number was recomputed with python3. Key results are shown under each lesson.

## Outline

The order is sensible for an intermediate course: fundamentals (U, energy balances, geometry), then LMTD with F, then ε-NTU, then design trade-offs, a full worked design, and advanced topics. There are two real gaps. No lesson covers the film-coefficient correlations (tube-side Dittus-Boelter/Sieder-Tate, shell-side Kern or Bell-Delaware) or tube-side pressure drop, yet "iterate U" and the Δp checks in Module 5 depend on them. The link between F and ε is never stated explicitly. There is also overlap to tidy up. "LMTD limitations with phase change…" (M2) overlaps "Phase change and desuperheating" (M6) and "When to choose ε-NTU over LMTD" (M3). Lesson 1.3 already covers fluid allocation, pitch and baffle spacing, which M4 ("Tube-side vs. shell-side allocation", "Tube layout, pitch, and bundle geometry", "Baffle design") repeats.

## Lesson 1 — Overall Heat Transfer Coefficient and Fouling Resistances

- **a. Equations**
  - 1/U_o: correct. All terms, the diameter ratios and the wall term d_o ln(d_o/d_i)/(2k_w) are right, and so are the units.
  - 1/U_i: correct. U_i = U_o(d_o/d_i) is also correct (the direct formula gives 1038.5 W/m²K, the same as the conversion).
  - U_oA_o = U_iA_i: correct.
  - Validity of eq. 1: "clean cylindrical tube wall" contradicts an equation that contains fouling terms. It should say "plain (unfinned) tube, thin fouling layers". The rest of the validity statement is fine.
  - The symbol table for eq. 2 lists A_i, which does not appear in the equation. This is cosmetic.
- **b. Worked example** (python): d_o/d_i = 1.17593, ln = 0.16206 (the lesson writes 0.1625, a small slip). The terms are 0.0003333, 0.0002, 0.0002352, 0.0002352 and wall 0.0001286. Sum 0.0011323, so **U_o = 883 W/m²K: correct**.
  - **Clean U is wrong.** The clean sum is 0.0006972, so U_c = **1434 W/m²K, not "≈ 1540"**. The fouling reduction is therefore **38%, not "about 43%"**, and U_d/U_c = 0.62.
- **c. Theory errors**
  - "The ratio U_d/U_c is the fouling factor" is wrong terminology. "Fouling factor" means the resistance R_f (as in TEMA's fouling-factor tables). The ratio U_d/U_c is usually called the *cleanliness factor*. Students will confuse the two.
  - "Wall resistance is usually small for metals (copper, stainless steel)" is misleading for stainless. In the lesson's own example the stainless wall is 11% of 1/U, about the same as each fouling term.
  - The fouling values are fine. Cooling-tower water 0.0002, river water 0.00034 and fuel oil 0.00088 m²K/W match the TEMA values of 0.001, 0.002 and 0.005 h·ft²·°F/Btu (0.000176, 0.000352 and 0.000881).
- **d. Diagrams:** Incropera 7th ed., Ch. 3 (conduction and resistance networks) and Ch. 11 (heat exchangers). These are real and correct chapters. No figure number is given, which is acceptable.
- **e. References:** Incropera/DeWitt/Bergman/Lavine, Shah & Sekulić *Fundamentals of Heat Exchanger Design* and the TEMA Standards are all real.
- **f. Depth:** About 410 words of theory plus explanation. This is adequate for the level and the strongest of the three lessons. The outline promises "typical values and uncertainty", but there is no table of typical U ranges, and fouling uncertainty gets only one sentence.
- **g. Videos**

| Video | Rating | Why |
|---|---|---|
| Chapter 4.2 Overall Heat Transfer Coefficient and Fouling Factor (skyscrapper) | relevant | Exactly the lesson topic |
| Overall Heat Transfer Coefficient and Fouling Factor, HMT KTU (Mohith Dadu) | relevant | U plus fouling in heat exchangers, university-course level |
| Overall heat transfer coefficient, fouling factor (Wisdom Jobs & Tutorials) | relevant | On-topic, but a 48-min exam-prep channel, so quality is uncertain |
| Heat Transfer Ch. 3, Cylindrical Systems, Thermal Resistance, U-Value (Kody Powell) | loosely related | Covers the cylindrical wall and resistance network (a prerequisite), but no fouling or exchanger focus |

- **h. Score: 4/5.** Fixes:
  - Correct U_c to about 1434 W/m²K and the reduction to about 38%.
  - Rename the U_d/U_c ratio to "cleanliness factor".
  - Fix the "clean wall" validity wording.
  - Qualify the remark that the stainless wall resistance is "small".
  - Optionally fix ln = 0.1621 and add a table of typical U values.

## Lesson 2 — Energy Balances and Terminal Temperature Constraints

- **a. Equations**
  - Stream energy balance: correct.
  - Capacity-rate form: correct.
  - Validity of the energy balance: it should add "sensible heat only (no phase change)", because Q = ṁc_pΔT fails for condensing or boiling streams.
  - Terminal constraints: what is stated is correct (parallel flow T_h,o > T_c,o; counterflow T_h,o ≥ T_c,i, with a cross allowed). It is incomplete: it omits T_c,o ≤ T_h,i and gives no multipass constraint, although the objectives promise one. Its validity line ("no phase change") is needlessly restrictive, since these second-law limits hold with phase change too.
- **b. Worked example** (python): Q = 5 × 60 = 300 kW and T_c,o = 67.5 °C. The terminal ΔTs are 82.5 K and 60 K, and the counterflow LMTD is 70.65 K. **Answer correct.**
  - The wording of step 4 is confused ("Counterflow allows T_c,o (67.5) < T_h,o (90)?").
  - The example is trivial for the level. It never exercises a cross or a multipass case. Parallel flow would also be feasible here (outlet ΔT 22.5 K).
- **c. Theory errors**
  - "[temperature cross]… requires C_c<C_h in the limiting case" is **false**. Counterexample: C_h = 1, C_c = 1.57 (C_c > C_h), hot 150→40 °C, cold 30→100 °C. Both end ΔTs are positive (50 and 10 K), T_c,o > T_h,o, and the required NTU is a finite 4.43.
  - Takeaway "Counterflow uniquely allows a temperature cross" is **false**, and it contradicts the lesson's own theory text. At C_r = 1 a 1-2 shell-and-tube unit reaches ε = 0.58 and single-pass crossflow (one fluid mixed) reaches ε = 0.61. Both exceed 0.5, which means T_c,o > T_h,o. Crosses in 1-2 units matter for this course, because they are what drives F down.
  - Common mistake "Using °C differences as if they were K…" contradicts itself (the two are equal for differences).
  - Common mistake "Specifying T_h,o below T_c,i for a parallel-flow unit" is impossible in every arrangement, so tying it to parallel flow is misleading.
- **d. Diagrams:** The Incropera Ch. 11 parallel/counterflow profiles are real. The figure number "Fig. 11.4" is likely wrong. In the 6th and 7th editions those profiles are Figs. 11.7 and 11.8 (§11.3), while Fig. 11.4 shows shell-and-tube pass arrangements. This should be checked against the edition being cited.
- **e. References**
  - Incropera: real.
  - Kern, *Process Heat Transfer*: real, but the chapter pointer looks off. Ch. 5 "Temperature" covers LMTD and terminal ΔT. Ch. 6 is double-pipe exchangers.
  - **"Compact Heat Exchangers" by Shah & Sekulić is misattributed.** That title is Kays & London's. Shah & Sekulić wrote *Fundamentals of Heat Exchanger Design*, whose Ch. 3 does cover ε-NTU.
- **f. Depth:** Thin, at about 260 words. There is no multipass or 1-2 cross discussion, which is the objective most relevant to shell-and-tube design. Minimum approach temperature and C_min/C_max limits are not covered. The example is not intermediate-level.
- **g. Videos**

| Video | Rating | Why |
|---|---|---|
| Calculating Rate of Heat Transfer Between Two Working Fluids of a Heat Exchanger (Engineers Academy) | relevant | Stream energy balance, which is the core of the lesson |
| Open System Energy Balance Explained, Lecture 15 (ChemEngPro) | loosely related | General first-law open-system balance, a prerequisite |
| Heat Exchanger 2of2 Sum19 (Randall Manteufel) | loosely related | Generic 79-min heat exchanger lecture, not focused on terminal constraints |
| LMTD, Parallel flow vs Counter flow (Power Plant Discussion) | loosely related | Shows the temperature profiles, but its focus is LMTD (Module 2) |

- **h. Score: 3/5.** Fixes:
  - Delete the C_c<C_h claim.
  - Fix the "uniquely" takeaway: multipass and crossflow units can also cross, with limits.
  - Fix the Kays & London attribution and the Kern chapter.
  - Check the Incropera figure number.
  - Add a multipass/1-2 cross paragraph and a worked case that has a cross.
  - Clean up the two common mistakes and step 4.

## Lesson 3 — Shell-and-Tube Geometry and TEMA Nomenclature

- **a. Equations**
  - c = P_t − d_o (ligament/clearance): correct. Describing it as "radial/linear clearance" is odd, because it is the gap between tubes, not a radial quantity.
  - P_R = P_t/d_o: correct. It could note the TEMA minimum of 1.25.
  - B = kD_s, 0.2 ≤ k ≤ 1.0: the usual preliminary range (Kern). The validity caveats are good. It could add TEMA's minimum of max(D_s/5, 2 in), with the maximum set by the unsupported span.
- **b. Worked example** (python): c = 6.35 mm and P_R = 1.3333. **Answer correct** (¾ in on 1 in triangular is a standard layout).
  - The interpretation "6.35 mm… large enough for many cleaning… considerations" is misleading for a *triangular* layout. Triangular pitch is generally not mechanically cleanable on the shell side, as the lesson itself says. 6.35 mm (¼ in) is TEMA's minimum cleaning lane for square pitch. Clearance is also not the vibration criterion.
  - The example is trivial and does not exercise tube count or shell diameter.
- **c. Theory errors**
  - "TEMA nomenclature commonly labels a unit by shell passes and tube passes, for example a 1-2 exchanger" is **wrong**. TEMA nomenclature is the three-letter front-head/shell/rear-head code (e.g., AES, BEM, AEU). "1-2" is the textbook pass notation from Kern, not TEMA. The objective repeats this conflation ("TEMA-style configuration codes such as 1-2, 2-4").
  - The lesson never explains the three-letter designation or the head types, even though that is its title topic and the diagram description refers to it.
  - The rest is correct: shell types E, F, G, H, J, K, X; fluid-allocation rules; triangular vs square pitch; the baffle-spacing trade-off.
- **d. Diagrams:** The TEMA Standards 9th ed. nomenclature chart (Section 1, Fig. N-1.2) is a real, standard figure. The 10th ed. (2019) is current.
- **e. References**
  - TEMA, Incropera, and Kakaç/Liu/Pramuanjaroenkij *Heat Exchangers: Selection, Rating, and Thermal Design* are real.
  - **"Compact Heat Exchangers and Enhancement Technology" by Shah and Sekulić looks garbled.** The real item is a conference-proceedings series, *Compact Heat Exchangers and Enhancement Technology for the Process Industries*, edited by R.K. Shah et al. (Begell House). It is not a Shah & Sekulić textbook, and it is off-topic for shell-and-tube geometry.
- **f. Depth:** Thin, at about 270 words. Missing: the TEMA three-letter code and head types (fixed tubesheet, U-tube, floating head), standard tube sizes/BWG and lengths, baffle cut, and any tube-count or bundle-diameter relation (e.g., 0.866P_t² vs P_t² per tube, or the Coulson & Richardson D_b correlation). The objective "relate… bundle diameter to tube count and shell diameter" is not delivered.
- **g. Videos**

| Video | Rating | Why |
|---|---|---|
| Choosing the Optimum Shell and Tube Exchanger TEMA type (Boostrand ChemE) | relevant | TEMA type selection, which fills the lesson's main gap |
| TEMA Section-1 Nomenclature Explained, Front Head Types (Mechanical Training world) | relevant | TEMA nomenclature, though front heads only |
| Webinar TEMA, Design of Shell & Tube Heat Exchangers (Arveng) | relevant | TEMA and shell-and-tube design. Long (47 min) |
| Heat Exchanger_8: Tube layout & Tube Pitch (Chem Eng Knowledge) | relevant | Tube layout and pitch, directly on-topic |

- **h. Score: 2/5.** It misstates and omits its title topic. Fixes:
  - Replace the "1-2 = TEMA" sentence.
  - Add the AES/BEM-style three-letter code with head types.
  - Add tube count, bundle and shell diameter, and standard tube sizes.
  - Fix the triangular-pitch cleaning remark.
  - Replace the garbled Shah & Sekulić reference.
  - Use a worked example that estimates tube count or shell diameter.

## Verdict

The course structure is sound, and the equations themselves are all correct. The errors sit in the surrounding claims: a wrong clean-U value, a "fouling factor" misnomer, a false temperature-cross condition and "uniquely" claim, a misstatement of what TEMA nomenclature is, two misattributed or garbled references, and a likely wrong figure number. Lesson 1 is close to ready. Lessons 2 and 3 are thin for an intermediate course, have trivial worked examples, and need content added (multipass/cross constraints, the TEMA three-letter code, tube count) before they are shown to students.

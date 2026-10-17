# Review: Reinforced Concrete Beam Design for Bending by the Limit State Method (advanced)

Reviewed: `course.outline` (7 modules, 27 lessons) and the first 3 lessons. All three lessons work in Eurocode notation (EN 1990 / EN 1992-1-1), so I checked them against those codes, with notes where IS 456 or ACI 318 differ.

## Outline

The order makes sense: framework, then materials and compatibility, ULS capacity, cracking and time-dependent effects, code limits, detailing, and a capstone example. The coverage suits an advanced flexure course. There is a lot of duplication, though:
- Lessons 1.1–1.3 overlap heavily. All three repeat f_cd, f_yd, F_d = γF_k and a w_dL²/8 example.
- "Bond stress, development length, and anchorage" (M4) overlaps "Anchorage lengths and lap splices in flexural zones" (M6).
- "Shear-flexure interaction" (M4) overlaps "Stirrup and shear reinforcement coordination" (M6).

Some lessons are in the wrong place:
- "Tension stiffening" sits in the materials module, long before the crack and deflection lessons that use it.
- "Neutral axis depth limits for ductility" (x_u,max / K′) comes after the singly and doubly reinforced lessons, which need it to decide when compression steel is required.

Gaps and other issues:
- No lesson covers cracked elastic section analysis with SLS stress limits (EC2 7.2), or deflection control by span/depth ratio (EC2 7.4.2).
- The course never commits to one design code. "Limit state method" is IS 456 wording, but the lessons use Eurocode.
- Module names such as "Hardware Realities" and "Non-Idealities" are template wording that doesn't fit civil engineering.

## Lesson 1 — Ultimate and Serviceability Limit States for Flexure

**a. Equations**
- `f_cd = f_ck / gamma_c` is incomplete. EN 1992-1-1 Eq. (3.15) is f_cd = α_cc·f_ck/γ_C. The lesson's form holds only with the recommended α_cc = 1.0 (the UK NA uses 0.85), yet the validity line says "per EN 1992-1-1" and never mentions α_cc. The value γ_c = 1.5 for persistent/transient situations is correct (1.2 for accidental).
- `f_yd = f_yk / gamma_s` with γ_s = 1.15 is correct (EC2 Table 2.1N).
- `M_Rd >= M_Ed` is correct. Its validity, "valid for sections designed with the rectangular stress block", is a false restriction: the check is general, and EC2 3.1.7 equally allows the parabola-rectangle and bilinear diagrams.
- `F_d = gamma_f * F_k` is correct, and the units are fine.
- The fundamental combination in the theory matches EN 1990 Eq. 6.10 (it drops the prestress term, which is fine for RC). It doesn't mention the 6.10a/6.10b alternative.

**b. Worked example** (recomputed in python3)
- g_d = 16.20, q_d = 12.00, w_d = 28.20 kN/m, M_Ed = 28.2 × 36 / 8 = **126.90 kN·m**, which is correct.
- Context worth adding:
  - The lesson uses 6.10, the conservative single-expression option. With EN 1990 6.10a/6.10b (ξ = 0.85), 6.10b governs: w = 25.77 kN/m, M_Ed = 115.97 kN·m, about 9% lower.
  - IS 456, with 1.5(DL+LL), would give 135.0 kN·m.
- The lesson covers both ULS and SLS but has no SLS step. For example, the quasi-permanent load g_k + 0.3q_k = 14.4 kN/m gives M = 64.8 kN·m.

**c. Theory/explanation**
- "materials are used at their characteristic (or quasi-permanent) values" is wrong. Quasi-permanent is a combination of *actions*, not a material value. At SLS, γ_M = 1.0, and cracking and deflection use mean properties (E_cm, f_ctm).
- "M_Ed is the maximum moment over the beam" is oversimplified. Design moments are needed at each critical section, both sagging and hogging.
- No SLS limits are given: w_max = 0.3 mm under the quasi-permanent combination (EC2 Table 7.1N), and span/250 or span/500 for deflection (EC2 7.4.1).
- The common mistake "Applying the same partial factor to permanent and variable actions" depends on the code. IS 456 Table 18 uses 1.5 for both.
- The objective about "nominal values" is never covered.

**d. Diagrams**
- None are supplied (empty array), so nothing is invented. A strain/stress block figure or a ULS/SLS check flowchart would be expected.

**e. References**
- All three are real: EN 1992-1-1:2004; Mosley, Bungey & Hulse, *Reinforced Concrete Design to Eurocode 2*; and MacGregor & Wight, *Reinforced Concrete: Mechanics and Design*. The last is ACI-based, so its notation doesn't match the lesson.
- The note on EN 1992-1-1 says it defines "load combinations". Those are defined in EN 1990, which is missing from the list.

**f. Depth**
- The theory is about 325 words at introductory level. It has no reliability basis (β = 3.8 over 50 years), no SLS combinations (characteristic, frequent, quasi-permanent) and no limit values. It works as a refresher but is thin for an advanced course.

**g. Videos**

| Video | Rating | Why |
|---|---|---|
| Design of Singly Reinforced Beam \| Limit State Method (All About Structural Analysis and Design, 51 min) | Loosely related | Covers capacity design of a singly reinforced beam (Module 3 material), probably to IS 456; not the ULS/SLS framework |
| How To Design A Reinforced Concrete Beam For Beginners (BEng Hielscher, 13 min) | Loosely related | A whole beam design at beginner level, not limit-state concepts |
| Singly v/s Doubly Reinforced Beams (Civil Tutor, 2.5 min) | Off-topic | Definitions of section types; nothing on limit states |
| 04 ultimate limit state rev 1 (Concrete Engineering, 22 min) | Relevant | A ULS lecture matching half the lesson; SLS not covered |

**h. Score: 3/5.** Fixes:
- Add α_cc.
- Correct the SLS "quasi-permanent" sentence.
- Remove the rectangular-block restriction from the M_Rd check.
- Add the SLS combinations with w_max and deflection limits, plus an SLS step in the example.
- Mention 6.10a/6.10b.
- Add EN 1990 to the references and fix the EN 1992-1-1 note.

## Lesson 2 — Partial Safety Factors and Characteristic Material Strengths

**a. Equations**
- `f_cd = f_ck / gamma_c` has the same α_cc omission as Lesson 1. It matters more here, because this lesson is specifically about design strengths.
- `f_yd = f_yk / gamma_s`: the expression is right but the validity, "assumes steel has a well-defined yield plateau", is wrong. f_yk is the yield strength *or* the 0.2% proof stress for steels without a clear yield point (EC2 3.2.2(3); IS 456 cl. 38.1 / Fig. 23). The formula applies either way.
- `F_d = gamma_F * F_k` is correct. Giving "kNm" as a unit is for action effects, which is a minor point.
- The M_Ed sum in the theory is acceptable under linear analysis. However:
  - It doesn't mark which variable action is leading.
  - It leaves out the favourable values γ_G,inf = 1.0 and γ_Q = 0.

**b. Worked example** (recomputed)
- f_cd = 30/1.5 = **20.0 MPa**, f_yd = 500/1.15 = **434.78 MPa**, M_Ed = 108 + 90 = **198 kNm**. All correct.
- The example silently assumes α_cc = 1.0. With the UK NA value of 0.85, f_cd = 17.0 MPa, and the lesson should say so.
- With 6.10b, M_Ed would be 181.8 kNm.

**c. Theory/explanation**
- "Other codes (ACI 318, IS 456) use a strength-reduction factor φ on capacity" is **wrong for IS 456**. IS 456 uses material partial factors γ_m = 1.5 and 1.15 (cl. 36.4.2) and load factors (Table 18), the same approach as EC2. The lesson's own IS 456 reference note ("Partial safety factors for materials and loads") contradicts it. Only ACI 318 uses φ.
- "Typical values (Eurocode 2 …) γ_G = 1.35, γ_Q = 1.5": the action factors come from EN 1990 Table A1.2(B), not from EC2.
- An important point is missing for a lesson that names two codes: f_ck is a cylinder strength in EC2 but a 150 mm cube strength in IS 456. IS 456 then uses 0.67f_ck/γ_m = 0.446 f_ck in its stress block.
- The common mistake "Treating the characteristic strength as a mean value and adding an extra safety margin" is muddled. The real distinction is f_cm = f_ck + 8 MPa.

**d. Diagrams**
- None are supplied (empty array). The natural figure would be a strength distribution showing the 5% fractile.

**e. References**
- EN 1992-1-1 (CEN), ACI 318 (ACI) and IS 456 (BIS) are all real standards, but no editions are given.
- There is no textbook.
- EN 1990, the source of γ_G and γ_Q, is missing.

**f. Depth**
- The theory is about 260 words and largely repeats Lesson 1 (the same three equations). Missing:
  - the 5% fractile formula f_k = f_m − 1.645s
  - the makeup of γ_M (γ_m × γ_Rd)
  - the accidental values (1.2 / 1.0)
  - the reduced factors for quality control in EC2 Annex A
- Thin for an advanced course.

**g. Videos**

| Video | Rating | Why |
|---|---|---|
| Characteristic Loads, strength and Partial Safety Factor (Ekeeda, 7 min) | Relevant | Exactly the lesson topic (probably IS 456 basis) |
| Partial Safety Factor for Concrete and Steel (Civil Engineering, 4.4 min) | Relevant | Material factors 1.5 / 1.15 on topic; short |
| Lec 30: Partial Safety Factors (NPTEL IIT Guwahati, 46 min) | Relevant | Probably from the NPTEL Structural Reliability course, so it gives the statistical basis of the factors; a good fit for advanced learners (parent course not confirmed) |
| Reprise de Béton : Comment Réussir un Joint de Reprise Parfait ? (TCE, French) | Off-topic | About construction joints and a waterstop product, in French |

**h. Score: 3/5.** Fixes:
- Correct the IS 456/φ statement.
- Fix the yield-plateau validity.
- Add α_cc.
- Attribute γ_G and γ_Q to EN 1990.
- Add the cube vs cylinder distinction, the fractile formula and the accidental factors.
- Cut the overlap with Lesson 1.

## Lesson 3 — Load Combinations and Design Bending Moments

**a. Equations**
- `G_d = gamma_G * G_k` is correct, and the validity ("values such as 1.35 are not universal") is fine. It should also give γ_G,inf = 1.0 for favourable permanent actions.
- `Q_d = gamma_Q * Q_k` is correct, and the validity ("leading action") is right. It should add γ_Q = 0 when the action is favourable.
- Combination `… + sum_i gamma_Q psi_0,i Q_k,i`: the sum should run over i > 1. As written it counts the leading action twice (Lesson 1 had it right). The symbol list also omits G_k, γ_G, γ_Q and Q_k,i.
- `M_Ed = w_d L^2 / 8` is correct, and so is the validity ("only simply supported … continuous beams require … envelope").

**b. Worked example** (recomputed)
- g_d = 13.5, q_d = 22.5, w_d = 36.0 kN/m, M_Ed = 36 × 36 / 8 = **162.0 kN·m**, which is correct. With 6.10b it would be 152.9 kN·m.
- The problem text leaves out the numbers; they appear only in "given".
- The example is essentially Lesson 1's again. There is no continuous-beam or envelope example, even though objective 3 promises one.

**c. Theory/explanation**
- "combination factors ψ0, ψ1, or ψ2 reduce the accompanying variable actions" is misleading. In the ULS fundamental combination only ψ_0 is used. ψ_1 and ψ_2 belong to the frequent and quasi-permanent SLS combinations and to the accidental and seismic combinations.
- "alternate spans are loaded to obtain hogging and sagging extremes" is **wrong for hogging**. Loading alternate spans gives the maximum sagging moment. The maximum hogging moment at a support needs the *two spans next to that support* loaded (EC2 5.1.3 / UK NA; IS 456 cl. 22.4.1).
- The explanation has the same problem: "critical moment at a support may occur when adjacent spans are loaded while the span under consideration is unloaded". That loading pattern gives the minimum span moment, not the maximum support moment.
- No SLS combination expressions (EN 1990 6.14–6.16) are given, although objective 1 promises them.

**d. Diagrams**
- None are supplied. A pattern-loading and moment-envelope figure is the most important missing visual in this lesson.

**e. References**
- EN 1990 and EN 1992 are real.
- *"Reinforced Concrete Design to Eurocode 2" — R. S. Narayanan and A. W. Beeby* is **misattributed**. That title is by Mosley, Bungey & Hulse. Narayanan & Beeby wrote *Designers' Guide to EN 1992-1-1 and EN 1992-1-2* (Thomas Telford, 2005).

**f. Depth**
- The theory is only about 134 words, the thinnest of the three. The lesson's main new content, the moment envelope for continuous beams, is missing. Not adequate for an advanced course.

**g. Videos**

| Video | Rating | Why |
|---|---|---|
| NSCP 2015 Load Provision and Load Combinations (Niorosky, 28 min) | Loosely related | Philippine general load provisions with LRFD factors (1.2D+1.6L), not the EC0 factors taught |
| Required Beam Reinforcements and Defining Combinations in Autodesk Robot (21 min) | Loosely related | A software workflow, not the theory of combinations |
| Design Load Combinations based on NSCP 2015 and ACI 318-14 (Lectures ni Sir Mars, 35 min) | Loosely related | The right concept, but the ACI/NSCP factors differ from the lesson's and could confuse students |
| Continuous Beam Design by Moment Redistribution Method (Dr. Saleema Panda, 16 min) | Loosely related | Touches continuous-beam moments, but redistribution belongs to Module 5 |

**h. Score: 2/5.** Fixes:
- Rewrite the pattern-loading guidance to EC2 5.1.3.
- Add a worked continuous-beam envelope (e.g. three spans, with the max sagging and max hogging patterns).
- Add the SLS combinations and the favourable factors.
- Fix the ψ sentence and the summation index.
- Correct the Narayanan & Beeby reference.
- Replace the duplicate simply supported example.

## Verdict

The arithmetic is sound: all three worked examples are right to EN 1990 Eq. 6.10. The core formulas are standard. The main problems:
- Twelve technical errors in all, four per lesson. The significant ones:
  - the claim that IS 456 uses φ
  - the yield-plateau validity
  - the SLS "quasi-permanent" material values
  - the pattern-loading rule for hogging moments
  - a misattributed textbook
- The lessons are thin for "advanced". No diagrams are supplied, there is no SLS content, and the continuous-beam envelope is missing.
- The three opening lessons largely repeat each other.

Lessons 1 and 2 can be shown after targeted fixes. Lesson 3 needs a substantial rewrite. Only 4 of the 12 videos are relevant.

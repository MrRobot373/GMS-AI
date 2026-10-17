# Review: PID Controller Tuning for Process Control Loops (basic)

## Outline

The six-module order (loop basics, then P/I/D intuition, tuning rules, loop types, a worked example and safety) suits a basic course. Module 1 is close to triplicated: lesson 1 already covers the four signals, e = SP − PV and the loop components, which are lessons 2 and 3. The main gap is process dynamics. FOPDT gain, time constant and dead time are first identified in Module 5, but Module 3's Ziegler-Nichols, Cohen-Coon and lambda rules already need them, so a "process dynamics / step-response model" lesson should come before Module 3. Also missing: controller action (direct/reverse), PID algorithm forms (ideal/series/parallel), gain vs. proportional band and Ti units (min vs. repeats/min), and the ZN open-loop (reaction-curve) method. Also, the flow-loop summary's "high gain" is questionable, because flow loops are usually tuned with low controller gain and fast integral.

## Lesson 1 — Open-loop vs Closed-loop Control

- **a. Equations**
  - `e = SP − PV`: correct. Symbols and units are OK (SP and PV in engineering units).
  - Validity "Definition used in most DCS/PID implementations; sign convention may be reversed in some vendors": acceptable but vague. In practice the direct/reverse action setting decides the sign, so "most DCS" is an overstatement. A more useful condition: SP and PV must be in the same units/scaling.
- **b. Worked example** (python3): e = 80 − 76 = **4 °C**. Correct. "Increase heating output" is also physically correct.
  - **Error in the reasoning:** "For a direct-acting (heating) loop, controller output must increase to add heat." Under the ISA definition, a direct-acting controller *raises* OP as PV *rises*. A heating loop (more OP → more heat) needs a **reverse-acting** controller.
- **c. Theory/explanation:** Otherwise accurate (car/speedometer analogy, reactor at 80 °C, disturbance rejection). Only the error above.
- **d. Diagrams:** "Seborg, Edgar, Mellichamp & Doyle, Process Dynamics and Control, 4th ed., Chapter 1, Figure 1.1": the book and chapter are real, and Ch. 1 does have feedback-loop figures. The figure number is unverified, and the three lessons cite different figure numbers for the same diagram (Fig. 1.1 here, Fig. 1.4 in L2/L3), so treat it as unreliable. Cite the chapter, or the generic closed-loop block diagram in the closed-loop chapter (Ch. 11 in 3rd/4th ed.).
- **e. References:** Seborg et al., *Process Dynamics and Control*: real. Nise, *Control Systems Engineering*: real, and Ch. 1 does cover open- vs closed-loop systems. Neither looks invented.
- **f. Depth:** Thin (~200 words of theory and explanation), but enough for a first intro lesson. It overlaps heavily with lessons 2 and 3. A short example of an open-loop disturbance (e.g., cooling-water temperature changes while the valve stays fixed) would help.
- **g. Videos**

| Video | Rating | Why |
|---|---|---|
| Open Loop and Closed Loop Control Systems - Differences, Examples (Instrumentation Tools) | relevant | Exactly the lesson topic, with process examples |
| Control Systems Lectures - Closed Loop Control (Brian Douglas) | relevant | Clear explanation of the closed-loop concept; general rather than process-plant |
| Open Loop Systems (Neso Academy) | relevant | Covers the open-loop half; academic framing |
| Process control loop Basics - Instrumentation technician Course - Lesson 1 (Instrumentation & Control) | relevant | Basic feedback loop in a plant context |

- **h. Score: 3/5.** Fixes: replace "direct-acting (heating) loop" with "heating loop (reverse-acting controller)" or just "heating loop"; fix or drop the figure number; reduce overlap with lessons 2 and 3.

## Lesson 2 — Key Terms: PV, SP, OP, and Error

- **a. Equations**
  - `e = SP − PV`: correct expression and units.
    - Validity "…using the direct-acting convention" is **wrong/misleading**. With e = SP − PV and a positive gain, OP rises when PV falls, which is *reverse* action.
  - `OP = Kp·e + OP0`: correct P-only position form, and its validity statement (no saturation, no I/D, linear scaling) is good.
    - **Unit inconsistency:** the symbol table gives e in "% of span" and Kp as dimensionless (%/%), but the worked example uses Kp = 2 %/°C with e in °C. Pick one convention. (In python3: with a 0–200 °C span, 2 %/°C = 4 %/%. With 0–100 °C it is 2 %/%.)
- **b. Worked example** (python3): e = 120 − 114 = **6 °C**, and OP = 2·6 + 40 = **52 %**. The arithmetic is correct, and so is the direction (increase OP).
  - The label "Direct-acting heating loop (more OP = more heat)" carries the same action-terminology error. A heating loop needs a reverse-acting controller.
- **c. Theory/explanation: substantive error.** Direct and reverse action are defined backwards:
  - "A direct-acting controller increases OP when PV is below SP." This is wrong: per ISA, direct action means OP increases as PV increases.
  - "A reverse-acting controller decreases OP when PV is below SP, which is correct for a cooling loop": that behaviour is *direct* action. The physics conclusion (a cooling loop needs it) is right, but the label is swapped.
  - The theory repeats the error: "controller should increase its output (for a direct-acting loop)".
  - Sign convention is a stated objective of this lesson, so the core concept is taught backwards.
  - Minor nuance: "controller output (OP), also called the manipulated variable". Many DCSs label OP as "MV", but strictly the MV is the process variable being manipulated (e.g. steam flow). Worth one clarifying clause.
  - The rest is correct: consistency of signs gives negative feedback, a sign mix-up gives a runaway loop, and the warnings on %-of-span vs engineering units and on OP not always being 0–100 % are good.
- **d. Diagrams:** "Seborg, D.E., Edgar, T.F., Mellichamp, D.A., Doyle, F.J., *Process Control: Designing Processes and Control Systems for Dynamic Performance*, 4th ed., Wiley, Ch. 1, Fig. 1.4". This is **misattributed**. That title is **Thomas E. Marlin's** book (McGraw-Hill, 2nd ed. 2000). Seborg et al.'s book is *Process Dynamics and Control*. The figure number cannot be checked.
- **e. References**
  - Ref 1: the same misattribution (Marlin's title under Seborg's authors). It must be corrected to one real book.
  - Stephanopoulos, *Chemical Process Control: An Introduction to Theory and Practice*: real (Prentice Hall, 1984). The chapter-2 note is plausible.
- **f. Depth:** Adequate for basic level (~340 words plus two equations). The car analogy and the units/scaling mistakes are useful.
- **g. Videos**

| Video | Rating | Why |
|---|---|---|
| What is Process Control Loop \| Controller \| Process \| MV \| PV \| SP (Electrical And automation) | relevant | Directly covers the lesson's terms |
| Process Control Training Course (Zoe Talent Solutions Learning, 87 s) | off-topic | Looks like a promo trailer for a commercial course; at 87 s it is unlikely to teach the terms |
| Process control loop Basics - Instrumentation technician Course - Lesson 1 (Instrumentation & Control) | relevant | Loop signals in a plant context (the same video is reused from lesson 1) |
| A-2 - Intro - Feedback Control Loop (Instrumentation and Control) | relevant | Feedback loop and its signals |

- **h. Score: 2/5.** Fixes needed:
  1. Swap direct/reverse throughout: theory, explanation, the validity of the e equation, and the worked-example label. A heating loop with more OP giving more heat needs reverse action; a cooling loop needs direct action.
  2. Fix the reference and diagram attribution (Seborg et al., *Process Dynamics and Control*, or Marlin, *Process Control…*).
  3. Make the Kp/e units consistent.
  4. Drop the duplicate video and the promo video.

## Lesson 3 — Typical Process Loop Components

- **a. Equations**
  - `e = SP − PV`: correct, with a reasonable validity statement. It repeats lessons 1 and 2.
  - `PV% = (I − 4)/16 × 100`: correct. Endpoints checked in python3: 4 mA → 0 %, 20 mA → 100 %, and 0 mA → −25 %, which a controller shows as a fault. Validity (linear 4–20 mA, live zero) is correct.
  - The engineering-unit form `PV = LRV + (I − 4)/16·(URV − LRV)` is used in the worked example but missing from the equation list. Add it.
- **b. Worked example** (python3): (12 − 4)/16 = **50 %**, and 0 + 0.5·200 = **100 °C**. Correct.
- **c. Theory/explanation:** Mostly accurate. The five blocks are right, the 4–20 mA live-zero / broken-wire point is correct, and so are "loop gain = product of block gains" and saturation causing nonlinear behaviour. Minor issues:
  - "A thermocouple has a small time constant" is misleading for tuning. A thermocouple in a thermowell often adds a lag of tens of seconds or more, which matters in temperature loops. Say "a bare thermocouple".
  - "The transmitter also provides isolation and linearisation" overgeneralises; many do, not all. Also worth adding that 4 mA powers 2-wire transmitters.
  - "PV → sensor → …" is loose wording. The sensor measures the physical variable, and PV is the transmitted measurement.
- **d. Diagrams:** "Seborg et al., *Process Dynamics and Control*, 3rd ed., Ch. 1, Figure 1.4". The book is real; the figure number is unverified, and the same figure number is used for a different book in L2. The description of five separate blocks probably doesn't match Seborg either, because Seborg's block diagrams normally combine the sensor and transmitter into one "sensor-transmitter" block (Gm).
- **e. References:** Seborg: real and appropriate. Nise, *Control Systems Engineering*: real, but the note "introduces … standard signal conventions" is inaccurate. Nise does not cover industrial 4–20 mA signalling. A better source would be ISA/IEC material or an instrumentation text (e.g. Lipták, *Instrument Engineers' Handbook*).
- **f. Depth:** The best of the three (~420 words). It has a good analogy, practical common mistakes (sensor vs transmitter, 0 mA = fault, FCE stiction/dead band), and a worked example that suits basic level.
- **g. Videos**

| Video | Rating | Why |
|---|---|---|
| Process Instrumentation (Transmitter & Control Valve) (Madam Azreen) | relevant | Covers two of the five blocks directly |
| What is a Control Valve? (RealPars) | relevant | Good primer on the final control element |
| Process Control Loop Basics (PLC Automation Academy) | relevant | Whole-loop components overview |
| Introduction to 4-20-mA current loop transmitters (Texas Instruments) | loosely related | Matches the 4–20 mA topic but is aimed at transmitter circuit design, which is too deep for this lesson |

- **h. Score: 4/5.** Fixes: qualify the thermocouple time-constant statement; correct the Nise note or replace that reference; drop or verify the figure number, and align the description with a sensor-transmitter block; add the engineering-unit scaling equation.

## Verdict

The course structure is sensible, and lessons 1 and 3 are accurate apart from small issues. All three worked examples are numerically correct. The serious problem is controller action: lessons 1 and 2 label direct and reverse action backwards, and lesson 2 makes it the centrepiece of its sign-convention objective. Lesson 2 also attributes Marlin's book title to Seborg et al. The direct/reverse wording must be fixed before showing students, and every figure number should be verified or dropped. After that, the first module is usable, though it is repetitive.

# Learning on five topics: live check, 17 Oct 2026

Five engineering courses written on the live models (Ollama Cloud, Auto routing), each with its first
three lessons and their YouTube videos found with yt-dlp 2026.08.19 and no API key. Every video ID was
checked with YouTube's oEmbed endpoint outside the app; every lesson was reviewed (by Claude, with each
worked example recomputed in Python; a human engineer should confirm); every lesson page was captured
in light and dark ([screenshots](../../screenshots/2026-10-17-learning-5-topics/)).

Evidence for P0 #2 (LRN-28, ACC-01) and P0 #3 (LRN-30, ACC-03) in [16-status-and-plan.md](../../16-status-and-plan.md).

## Result

| Check | Result | |
|---|---|---|
| Courses and lessons are written | Works | 5/5 outlines, 15/15 lessons ready, no failures or retries. Outlines 6–64 s, lessons 9–21 s. All schema-valid, every equation has its "applies when". |
| Videos are real | Works | 60/60 IDs answer oEmbed 200 with the channel the lesson shows; all thumbnails load; 4 per lesson, 59 different. YouTube never asked this server to sign in. |
| Videos fit the lesson | Mostly | 41 relevant, 15 loosely related, 4 off-topic (rated from title, channel and length). |
| Lesson content is correct | Needs fixes | Worked-example arithmetic right in all 15 (one side value wrong). Technical errors in every course: 9 would teach a concept wrongly; 6 references mis-cited. Average 3.2/5, none 5/5. Lessons are thin (200–500 words of theory and explanation). |

All 15 lessons were written by Beam (Standard tier): Auto finds no rule for "Write a detailed … lesson"
and falls back to medium.

## Scores

| Course | Level | L1 | L2 | L3 | Videos relevant |
|---|---|---|---|---|---|
| Three-phase induction motors | intermediate | 3 | 4 | 4 | 9/12 |
| PID controller tuning | basic | 3 | 2 | 4 | 10/12 |
| Shell-and-tube heat exchangers | intermediate | 4 | 3 | 2 | 8/12 |
| Off-grid solar PV sizing | basic | 4 | 4 | 3 | 10/12 |
| Reinforced concrete beams (limit state) | advanced | 3 | 3 | 2 | 4/12 |

5 = show to students as is, 3 = usable with fixes, 1 = wrong.

## To decide

1. **Write lessons with the Advanced models** (Nemotron 3 Super/Ultra) instead of Auto's medium
   default: deeper, more careful lessons, at more tokens and time. Rerun these five topics to compare.
2. **A check pass** before a lesson is saved: a second call checks equations, claims and references,
   and fixes or flags them. Roughly doubles the cost of a lesson.
3. **Let the model pick the videos**: the best 4 of about 10 search results by title and channel. A
   word-match rule tried on these 60 would have dropped 7 good videos and caught 1 bad one.

## 1. Three-Phase Induction Motors: Torque-Speed Characteristics and Starting Methods

intermediate; asked for "Three-phase induction motors: torque-speed characteristics and starting methods". 6 modules, 19 lessons in the outline. Sound outline and real references. One wrong formula in lesson 1 and one wrong statement about core loss need fixing first. [Full review](reviews/induction-motor.md).

| # | Lesson | Score | What's wrong | Worked example | Videos |
|---|---|---|---|---|---|
| 1 | Per-Phase Equivalent Circuit and Parameter Definitions (beam, 4628 tokens, 15 s) | 3/5 | Referred rotor resistance is written R_r′ = R_r/a²; it is a²·R_r.<br>The example calls 104 W “core loss”; that figure also includes friction and windage.<br>Cites Chapman 5th ed. Chapter 7; induction motors are Chapter 6. | Right: R_c 138.5 Ω, X_m 30.73 Ω, R_r′ 1.00 Ω | 2/4 relevant; [light](../../screenshots/2026-10-17-learning-5-topics/light/1-induction-motor-lesson-1.webp), [dark](../../screenshots/2026-10-17-learning-5-topics/dark/1-induction-motor-lesson-1.webp) |
| 2 | Rotating Magnetic Field and Slip Concept (beam, 2044 tokens, 9 s) | 4/5 | “Positive slip = motoring” holds only for 0 < s < 1.<br>Doesn’t explain how three phases produce the rotating field. | Right: s = 0.04, f_r = 2 Hz | 4/4 relevant; [light](../../screenshots/2026-10-17-learning-5-topics/light/1-induction-motor-lesson-2.webp), [dark](../../screenshots/2026-10-17-learning-5-topics/dark/1-induction-motor-lesson-2.webp) |
| 3 | Power Flow and Loss Components in a Three-Phase Induction Motor (beam, 2783 tokens, 15 s) | 4/5 | Says core loss is “roughly constant with voltage and frequency”; it rises with both.<br>Leaves out stray-load loss; mixes p (pole pairs) with P (poles). | Right: P_ag 9300 W, T 59.2 N·m, η 88.2 % | 3/4 relevant; [light](../../screenshots/2026-10-17-learning-5-topics/light/1-induction-motor-lesson-3.webp), [dark](../../screenshots/2026-10-17-learning-5-topics/dark/1-induction-motor-lesson-3.webp) |

## 2. PID Controller Tuning for Process Control Loops

basic; asked for "PID controller tuning for process control loops". 6 modules, 21 lessons in the outline. Usable once direct/reverse action is fixed. The course teaches it backwards in lesson 2, which is a lesson about exactly that. [Full review](reviews/pid-tuning.md).

| # | Lesson | Score | What's wrong | Worked example | Videos |
|---|---|---|---|---|---|
| 1 | Open-loop vs Closed-loop Control (beam, 1171 tokens, 9 s) | 3/5 | Calls a heating loop “direct-acting”; a heating loop needs a reverse-acting controller. | Right: e = 4 °C | 4/4 relevant; [light](../../screenshots/2026-10-17-learning-5-topics/light/2-pid-tuning-lesson-1.webp), [dark](../../screenshots/2026-10-17-learning-5-topics/dark/2-pid-tuning-lesson-1.webp) |
| 2 | Key Terms: PV, SP, OP, and Error (beam, 1928 tokens, 21 s) | 2/5 | Direct and reverse action are defined backwards, in the theory, the equation’s validity and the example.<br>Marlin’s book title is given under Seborg et al.’s names.<br>K_p units disagree: % of span in the table, %/°C in the example. | Right: e = 6 °C, OP = 52 % | 3/4 relevant; [light](../../screenshots/2026-10-17-learning-5-topics/light/2-pid-tuning-lesson-2.webp), [dark](../../screenshots/2026-10-17-learning-5-topics/dark/2-pid-tuning-lesson-2.webp) |
| 3 | Typical Process Loop Components (beam, 2125 tokens, 12 s) | 4/5 | “A thermocouple has a small time constant” ignores the thermowell’s lag.<br>The Nise reference doesn’t cover 4–20 mA conventions as claimed. | Right: 12 mA = 50 % = 100 °C | 3/4 relevant; [light](../../screenshots/2026-10-17-learning-5-topics/light/2-pid-tuning-lesson-3.webp), [dark](../../screenshots/2026-10-17-learning-5-topics/dark/2-pid-tuning-lesson-3.webp) |

## 3. Shell-and-Tube Heat Exchanger Design: LMTD and Effectiveness-NTU Methods

intermediate; asked for "Shell-and-tube heat exchanger design: LMTD and effectiveness-NTU methods". 6 modules, 22 lessons in the outline. Lesson 1 is nearly ready. Lessons 2 and 3 are thin and have concept errors; the course has no lesson on film-coefficient correlations. [Full review](reviews/heat-exchanger.md).

| # | Lesson | Score | What's wrong | Worked example | Videos |
|---|---|---|---|---|---|
| 1 | Overall Heat Transfer Coefficient and Fouling Resistances (beam, 3386 tokens, 18 s) | 4/5 | Clean U is 1434 W/m²K, not “≈1540”, so fouling cuts U by 38 %, not 43 %.<br>Calls U_d/U_c the “fouling factor”; it’s the cleanliness factor. | Main answer right (U_o = 883 W/m²K); the clean value beside it is wrong | 3/4 relevant; [light](../../screenshots/2026-10-17-learning-5-topics/light/3-heat-exchanger-lesson-1.webp), [dark](../../screenshots/2026-10-17-learning-5-topics/dark/3-heat-exchanger-lesson-1.webp) |
| 2 | Energy Balances and Terminal Temperature Constraints (beam, 2704 tokens, 12 s) | 3/5 | Says a temperature cross “requires C_c < C_h”: false.<br>“Counterflow uniquely allows a temperature cross”: 1-2 shells and crossflow can too.<br>“Compact Heat Exchangers” is Kays & London’s book, not Shah & Sekulić’s. | Right, but trivial for intermediate | 1/4 relevant; [light](../../screenshots/2026-10-17-learning-5-topics/light/3-heat-exchanger-lesson-2.webp), [dark](../../screenshots/2026-10-17-learning-5-topics/dark/3-heat-exchanger-lesson-2.webp) |
| 3 | Shell-and-Tube Geometry and TEMA Nomenclature (beam, 2497 tokens, 15 s) | 2/5 | Describes TEMA nomenclature as the “1-2” pass label; it’s the three-letter code (AES, BEM…), which the lesson never covers.<br>A garbled Shah & Sekulić reference. | Right, but trivial for intermediate | 4/4 relevant; [light](../../screenshots/2026-10-17-learning-5-topics/light/3-heat-exchanger-lesson-3.webp), [dark](../../screenshots/2026-10-17-learning-5-topics/dark/3-heat-exchanger-lesson-3.webp) |

## 4. Off-grid Solar PV System Sizing: Panels, Batteries, and Charge Controllers

basic; asked for "Off-grid solar PV system sizing: panels, batteries and charge controllers". 5 modules, 26 lessons in the outline. The most usable of the five. Minor fixes; the outline is missing array sizing before the capstone, wiring and fusing, and worst-month design. [Full review](reviews/solar-pv.md).

| # | Lesson | Score | What's wrong | Worked example | Videos |
|---|---|---|---|---|---|
| 1 | Solar Irradiance Fundamentals: GHI, POA, and Peak Sun Hours (beam, 1653 tokens, 12 s) | 4/5 | The peak-sun-hours formula divides by 1 kWh/m² instead of 1 kW/m², so its units come out wrong. | Right: 5.28 h/day | 2/4 relevant; [light](../../screenshots/2026-10-17-learning-5-topics/light/4-solar-pv-lesson-1.webp), [dark](../../screenshots/2026-10-17-learning-5-topics/dark/4-solar-pv-lesson-1.webp) |
| 2 | PV cell operation and the I-V curve (beam, 2313 tokens, 15 s) | 4/5 | V_oc temperature coefficient “−0.3 to −0.5 %/°C” is too high (typical −0.25 to −0.35) and disagrees with lesson 3.<br>Messenger & Ventre’s book is “Photovoltaic Systems Engineering”. | Right: 296 W, fill factor 0.791 | 4/4 relevant; [light](../../screenshots/2026-10-17-learning-5-topics/light/4-solar-pv-lesson-2.webp), [dark](../../screenshots/2026-10-17-learning-5-topics/dark/4-solar-pv-lesson-2.webp) |
| 3 | Maximum Power Point Tracking and Temperature Effects (beam, 2002 tokens, 12 s) | 3/5 | “Size wiring, fuses… for the cold V_oc” is misleading: currents come from I_sc; cold V_oc sets voltage ratings.<br>Its validity range (−20 to +80 °C) leaves out the usual cold-V_oc design case.<br>Lists the next lesson as a prerequisite. | Right: 34.4 V, 252 W (a 16 % loss) | 4/4 relevant; [light](../../screenshots/2026-10-17-learning-5-topics/light/4-solar-pv-lesson-3.webp), [dark](../../screenshots/2026-10-17-learning-5-topics/dark/4-solar-pv-lesson-3.webp) |

## 5. Reinforced Concrete Beam Design for Bending by the Limit State Method

advanced; asked for "Reinforced concrete beam design for bending by the limit state method". 7 modules, 27 lessons in the outline. Thin for “advanced”: no diagrams, little on serviceability, and the first three lessons repeat each other. Two concept errors in lessons 2 and 3. [Full review](reviews/rc-beam.md).

| # | Lesson | Score | What's wrong | Worked example | Videos |
|---|---|---|---|---|---|
| 1 | Ultimate and Serviceability Limit States for Flexure (beam, 2601 tokens, 9 s) | 3/5 | Says materials are taken at “quasi-permanent” values at serviceability; quasi-permanent is a load combination. | Right: 126.9 kN·m | 1/4 relevant; [light](../../screenshots/2026-10-17-learning-5-topics/light/5-rc-beam-lesson-1.webp), [dark](../../screenshots/2026-10-17-learning-5-topics/dark/5-rc-beam-lesson-1.webp) |
| 2 | Partial Safety Factors and Characteristic Material Strengths (beam, 2205 tokens, 12 s) | 3/5 | Says IS 456 uses a strength-reduction factor φ; it uses material factors 1.5 and 1.15.<br>“f_yd = f_yk/γ_s assumes a yield plateau”: wrong, f_yk can be the 0.2 % proof stress.<br>f_cd leaves out α_cc. | Right: f_cd 20.0 MPa, f_yd 434.78 MPa | 3/4 relevant; [light](../../screenshots/2026-10-17-learning-5-topics/light/5-rc-beam-lesson-2.webp), [dark](../../screenshots/2026-10-17-learning-5-topics/dark/5-rc-beam-lesson-2.webp) |
| 3 | Load Combinations and Design Bending Moments (beam, 2005 tokens, 12 s) | 2/5 | Says loading alternate spans gives the maximum hogging moment; it gives maximum sagging.<br>“Reinforced Concrete Design to Eurocode 2” is by Mosley, Bungey & Hulse, not Narayanan & Beeby.<br>Never delivers the moment envelope its objectives promise. | Right: 162.0 kN·m | 0/4 relevant; [light](../../screenshots/2026-10-17-learning-5-topics/light/5-rc-beam-lesson-3.webp), [dark](../../screenshots/2026-10-17-learning-5-topics/dark/5-rc-beam-lesson-3.webp) |

## All videos

| Course | L | Video | Channel | Min | oEmbed | Fit |
|---|---|---|---|---|---|---|
| Three-phase induction motors | 1 | [Equivalent Circuit of The Three Phase Induction Motor](https://www.youtube.com/watch?v=DwcK-JQCaNQ) | Sanath Alahakoon | 14 | 200 | Relevant |
| Three-phase induction motors | 1 | [#10 Determining Equivalent Circuit parameters - Synchronous Gen ( Linear Method )](https://www.youtube.com/watch?v=0mv6tzL5suU) | ELECTRICAL IS EASY | 20 | 200 | Off-topic |
| Three-phase induction motors | 1 | [Equivalent Circuit Parameters - Single Phase Induction Motor -  Electrical Machines 3](https://www.youtube.com/watch?v=IyXR3IRAS1I) | Ekeeda | 15 | 200 | Loosely related |
| Three-phase induction motors | 1 | [Induction Motor No Load Test](https://www.youtube.com/watch?v=pflGeYCvs80) | Lee Thian Pau | 10 | 200 | Relevant |
| Three-phase induction motors | 2 | [Induction Motor animation I: The Rotating Magnetic Field RMF](https://www.youtube.com/watch?v=vMu6DmfKHTs) | learnchannel | 2 | 200 | Relevant |
| Three-phase induction motors | 2 | [How to Generate a Rotating Magnetic Field in AC Motors: Step-by-Step Explanation : A Vector approach](https://www.youtube.com/watch?v=s0G7pVsLhSk) | Power Eng. By Afshin | 4 | 200 | Relevant |
| Three-phase induction motors | 2 | [How Three Phase Induction Motors Work? \| Principle of Rotating Magnetic Field (RMF) Explained](https://www.youtube.com/watch?v=sQExvOKNSng) | Simplegyan Engineering  | 7 | 200 | Relevant |
| Three-phase induction motors | 2 | [Slip Speed and Slip in a Motor](https://www.youtube.com/watch?v=xxvFTC-ybbk) | Zack Hartle | 7 | 200 | Relevant |
| Three-phase induction motors | 3 | [GATE 2027 DAILY QUESTION \| POWER FLOW \| EFFICIENCY OF INDUCTION MOTOR \| ELECTRICAL ENGINEERING \| ECG](https://www.youtube.com/watch?v=YmEVqLnB3e0) | ENGINEERS CAREER GROUP | 12 | 200 | Relevant |
| Three-phase induction motors | 3 | [Induction Motors : Power Flow and Power Conversion](https://www.youtube.com/watch?v=EpP3rdXvkRY) | Power Eng. By Afshin | 2 | 200 | Relevant |
| Three-phase induction motors | 3 | [Induction Motors, Part XVI:  Air Gap Power, Converted Power and Rotor Copper Losses, 31/12/2013](https://www.youtube.com/watch?v=LOIQkLezl_A) | Lutfi Al-Sharif | 4 | 200 | Relevant |
| Three-phase induction motors | 3 | [Simulating Speed - Torque Characteristics of a 3 Phase Induction Motor using Matlab Simulink.](https://www.youtube.com/watch?v=aicNiN4VzF4) | Professor Pahadi | 8 | 200 | Loosely related |
| PID controller tuning | 1 | [Open Loop and Closed Loop Control Systems - Differences, Examples](https://www.youtube.com/watch?v=DRrmHs7wKqs) | Instrumentation Tools | 5 | 200 | Relevant |
| PID controller tuning | 1 | [Control Systems Lectures - Closed Loop Control](https://www.youtube.com/watch?v=O-OqgFE9SD4) | Brian Douglas | 9 | 200 | Relevant |
| PID controller tuning | 1 | [Open Loop Systems](https://www.youtube.com/watch?v=DE0hWLdkckg) | Neso Academy | 4 | 200 | Relevant |
| PID controller tuning | 1 | [Process control loop Basics - Instrumentation technician Course - Lesson 1](https://www.youtube.com/watch?v=2EpFIhUHm28) | Instrumentation & Control | 5 | 200 | Relevant |
| PID controller tuning | 2 | [What is Process Control Loop \| Controller \| Process \| MV \| PV \|  SP \|Electrical & Automation](https://www.youtube.com/watch?v=XuD1xNI2CIg) | Electrical And automation | 6 | 200 | Relevant |
| PID controller tuning | 2 | [Process Control Training Course](https://www.youtube.com/watch?v=LcKAA9A3YR8) | Zoe Talent Solutions Learning | 1 | 200 | Off-topic |
| PID controller tuning | 2 | [Process control loop Basics - Instrumentation technician Course - Lesson 1](https://www.youtube.com/watch?v=2EpFIhUHm28) | Instrumentation & Control | 5 | 200 | Relevant |
| PID controller tuning | 2 | [A-2 - Intro - Feedback Control Loop](https://www.youtube.com/watch?v=hpbL9-xnffI) | Instrumentation and Control | 8 | 200 | Relevant |
| PID controller tuning | 3 | [Process Instrumentation (Transmitter & Control Valve)](https://www.youtube.com/watch?v=rYzjkZzpyZA) | Madam Azreen | 10 | 200 | Relevant |
| PID controller tuning | 3 | [What is a Control Valve?](https://www.youtube.com/watch?v=KtsiM1st0KA) | RealPars | 6 | 200 | Relevant |
| PID controller tuning | 3 | [Process Control Loop Basics](https://www.youtube.com/watch?v=VgrhA6MrJnI) | PLC Automation Academy | 21 | 200 | Relevant |
| PID controller tuning | 3 | [Introduction to 4-20-mA current loop transmitters](https://www.youtube.com/watch?v=o3oqwXKeu-I) | Texas Instruments | 16 | 200 | Loosely related |
| Shell-and-tube heat exchangers | 1 | [Chapter 4.2 Overall Heat Transfer Coefficient and Fouling Factor](https://www.youtube.com/watch?v=aXt9fdi7-4E) | skyscrapper | 30 | 200 | Relevant |
| Shell-and-tube heat exchangers | 1 | [Overall Heat Transfer Coefficient and Fouling Factor \| Heat Exchangers \| HMT \| KTU \| S6 MECHANICAL \|](https://www.youtube.com/watch?v=Bx8E21sm4D4) | Mohith Dadu | 16 | 200 | Relevant |
| Shell-and-tube heat exchangers | 1 | [Overall heat transfer coefficient \| fouling factor \| Heat Transfer @Wisdom jobs](https://www.youtube.com/watch?v=9Uv-8vhqmCE) | Wisdom Jobs & Tutorials (SSC , Banking , RRB etc) | 48 | 200 | Relevant |
| Shell-and-tube heat exchangers | 1 | [Heat Transfer - Chapter 3 - Cylindrical Systems - Temperature profile, Thermal Resistance, U-Value](https://www.youtube.com/watch?v=6x-jdCGWuHI) | Kody Powell | 22 | 200 | Loosely related |
| Shell-and-tube heat exchangers | 2 | [Calculating Rate of Heat Transfer Between Two Working Fluids of a Heat Exchanger](https://www.youtube.com/watch?v=laUYeIQwEL0) | Engineers Academy | 10 | 200 | Relevant |
| Shell-and-tube heat exchangers | 2 | [Open System Energy Balance Explained \| Lecture 15 - Practical Heat Transfer](https://www.youtube.com/watch?v=U3XWkExk1OE) | ChemEngPro | 19 | 200 | Loosely related |
| Shell-and-tube heat exchangers | 2 | [Heat Exchanger 2of2 Sum19](https://www.youtube.com/watch?v=xHyWTjGJBAg) | Randall Manteufel | 79 | 200 | Loosely related |
| Shell-and-tube heat exchangers | 2 | [LMTD \| Parallel flow Vs Counter flow Heat Exchanger \| Log mean temperature difference \|](https://www.youtube.com/watch?v=DVZX9gardv4) | Power Plant Discussion | 15 | 200 | Loosely related |
| Shell-and-tube heat exchangers | 3 | [Choosing the Optimum Shell and Tube Exchanger TEMA type](https://www.youtube.com/watch?v=zoPZhWgivYY) | Boostrand ChemE | 10 | 200 | Relevant |
| Shell-and-tube heat exchangers | 3 | [TEMA Section‑1 Nomenclature Explained \| Heat Exchanger Front Head Types Lecture-4](https://www.youtube.com/watch?v=PIcHI33WaFU) | Mechanical Training world | 5 | 200 | Relevant |
| Shell-and-tube heat exchangers | 3 | [Webinar  TEMA I Design of Shell & Tube Heat Exchangers](https://www.youtube.com/watch?v=O0pdtsS7BYk) | Arveng Training & Engineering | 47 | 200 | Relevant |
| Shell-and-tube heat exchangers | 3 | [Heat Exchanger_8 : Tube layout & Tube Pitch](https://www.youtube.com/watch?v=yOzdbht_llg) | Chem Eng Knowledge | 21 | 200 | Relevant |
| Off-grid solar PV sizing | 1 | [Solar Radiance and Irradiance](https://www.youtube.com/watch?v=Th-mNx5Z_Nw) | Justice and Mercy Energy Services | 3 | 200 | Loosely related |
| Off-grid solar PV sizing | 1 | [Solar Tutorial PART-6 \| Solar Irradiance (Video-2) \|What is GHI, DNI, DHI, Zenith Angle \|](https://www.youtube.com/watch?v=Moy5vWweEXA) | EXOCON | 10 | 200 | Relevant |
| Off-grid solar PV sizing | 1 | [Average Irradiance](https://www.youtube.com/watch?v=JdDbk7AAcYs) | Penn State Solar Center | 1 | 200 | Loosely related |
| Off-grid solar PV sizing | 1 | [Sizing Solar  The Math of Peak Sun Hours](https://www.youtube.com/watch?v=wXzlfToFkDw) |   Taqa TV طاقة تفي | 5 | 200 | Relevant |
| Off-grid solar PV sizing | 2 | [Physics of Solar Cells Lesson 2 - The Current-Voltage (IV) Curve](https://www.youtube.com/watch?v=y_jJCFldPe0) | Mark Mrohs | 4 | 200 | Relevant |
| Off-grid solar PV sizing | 2 | [I-V Curves Explained \| Basics of Current-Voltage Curves for Solar & DER Systems](https://www.youtube.com/watch?v=_Rsk40rdP8s) | Fluke Corporation | 3 | 200 | Relevant |
| Off-grid solar PV sizing | 2 | [I-V and P-V Characteristics of Solar PV Module](https://www.youtube.com/watch?v=FJug3m3scXI) | DTE EEE | 12 | 200 | Relevant |
| Off-grid solar PV sizing | 2 | [How P-N Junctions ACTUALLY Work (The Photovoltaic Effect Explained](https://www.youtube.com/watch?v=jKo8Qbow2co) | Zema Academy | 6 | 200 | Relevant |
| Off-grid solar PV sizing | 3 | [MPPT explained (AKIO TV)](https://www.youtube.com/watch?v=9dNukdwBfoQ) | AKIO TV | 5 | 200 | Relevant |
| Off-grid solar PV sizing | 3 | [Solar MPPT Explained: Maximum Power Point Tracking](https://www.youtube.com/watch?v=d9ZM4RA5kLk) | Australian Control Engineering \| Smart Utilities | 4 | 200 | Relevant |
| Off-grid solar PV sizing | 3 | [MPPT concept](https://www.youtube.com/watch?v=C_1bxQPtoT0) | Design of photovoltaic systems | 18 | 200 | Relevant |
| Off-grid solar PV sizing | 3 | [Do Solar Panels Go OVER Voltage Limits In Freezing Temps?](https://www.youtube.com/watch?v=0M0oD_07CtM) | Jasonoid - Solar Power, Batteries, and More! | 7 | 200 | Relevant |
| Reinforced concrete beams (limit state) | 1 | [Design of Singly Reinforced Beam \| Limit State Method \| Reinforced Concrete Beam Design](https://www.youtube.com/watch?v=XjlD-yBzAmo) | All About Structural Analysis and Design | 51 | 200 | Loosely related |
| Reinforced concrete beams (limit state) | 1 | [How To Design A Reinforced Concrete Beam For Beginners](https://www.youtube.com/watch?v=skunTj-gP1k) | BEng Hielscher | 13 | 200 | Loosely related |
| Reinforced concrete beams (limit state) | 1 | [Singly v/s Doubly Reinforced Beams \| What are singly & doubly reinforced beams? \| Civil Tutor](https://www.youtube.com/watch?v=8gnGUmdIdX0) | Civil Tutor | 3 | 200 | Off-topic |
| Reinforced concrete beams (limit state) | 1 | [04 ultimate limit state rev 1](https://www.youtube.com/watch?v=dSLfUeYrhCM) | Concrete Engineering | 22 | 200 | Relevant |
| Reinforced concrete beams (limit state) | 2 | [Characteristic Loads, strength and Partial Safety Factor - Theory of Reinforced Concrete Structures](https://www.youtube.com/watch?v=9_O-CJ_anW8) | Ekeeda | 7 | 200 | Relevant |
| Reinforced concrete beams (limit state) | 2 | [Partial Safety Factor for Concrete and Steel](https://www.youtube.com/watch?v=1r91HL6ea54) | Civil Engineering | 4 | 200 | Relevant |
| Reinforced concrete beams (limit state) | 2 | [Lec 30: Partial Safety Factors](https://www.youtube.com/watch?v=UyWdls9kNX8) | NPTEL IIT Guwahati | 46 | 200 | Relevant |
| Reinforced concrete beams (limit state) | 2 | [Reprise de Béton : Comment Réussir un Joint de Reprise Parfait ? (Eurocode 2 & Idrostop)](https://www.youtube.com/watch?v=py0pORu2IUg) | TCE Tuto Construction & Examens | 7 | 200 | Off-topic |
| Reinforced concrete beams (limit state) | 3 | [NSCP 2015 LOAD PROVISION AND LOAD COMBINATIONS](https://www.youtube.com/watch?v=7y0ScLOsS0w) | Niorosky Engineering Online | 28 | 200 | Loosely related |
| Reinforced concrete beams (limit state) | 3 | [Required Beam Reinforcements and Defining Combinations in Autodesk Robot Structural Analysis](https://www.youtube.com/watch?v=i4GJl8JR0YU) | Civil Engineering Essentials | 19 | 200 | Loosely related |
| Reinforced concrete beams (limit state) | 3 | [DESIGN LOAD COMBINATIONS BASED ON NSCP 2015 and ACI 318 -14 \| REINFORCED CONCRETE DESIGN](https://www.youtube.com/watch?v=WrGLTnBmpso) | Lectures ni Sir Mars | 35 | 200 | Loosely related |
| Reinforced concrete beams (limit state) | 3 | [Continuous Beam Design by Moment Redistribution Method](https://www.youtube.com/watch?v=zV-WSISSS4k) | Dr. Saleema Panda | 16 | 200 | Loosely related |

## How it was checked

1. Five courses created through the app's API as the organization owner, two at a time; Auto chose the models.
2. Lessons 1–3 of each written; each searched YouTube with yt-dlp, keeping only videos oEmbed confirmed.
3. Every saved video ID asked again at oEmbed outside the app, channel names compared.
4. Each course reviewed: outline, equations and their validity, worked examples recomputed with Python, theory, figures, references, depth, video fit.
5. Every lesson page, its videos, the admin setting and the library captured in light and dark at 1440 px.

[results.json](results.json) holds every lesson's structure counts, model, tokens, timings and videos with their oEmbed answer and rating.

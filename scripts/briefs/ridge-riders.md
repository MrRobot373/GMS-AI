# Ridge Riders — game brief

Build **Ridge Riders**, a 2D side-scrolling hill-climb driving game that runs in a desktop browser by opening `ridge-riders/index.html` directly from disk (no server, no build step). Use plain JavaScript (ES modules are NOT allowed because file:// blocks them — use classic <script> tags in order) and the HTML5 canvas. Do not download or use any external library or CDN. Everything lives in the folder `ridge-riders/`.

The person who asked for this will open index.html, pick a vehicle, and drive with the keyboard. It must be playable end to end: menu → garage → level → finish or crash → results → back to menu.

## 1. Required file tree

```
ridge-riders/
  index.html            the page: one <canvas id="game">, the scripts in order, minimal CSS
  css/style.css         page styling (dark background, centered canvas, HUD font)
  src/data/vehicles.js  window.RR_VEHICLES = [...]  (section 4)
  src/data/terrains.js  window.RR_TERRAINS = [...]  (section 5)
  src/data/upgrades.js  window.RR_UPGRADES = [...]  (section 6)
  src/data/levels.js    window.RR_LEVELS = [...]    (section 7)
  src/core/input.js     keyboard state (section 9)
  src/core/save.js      localStorage save/load (section 13)
  src/core/audio.js     WebAudio sound effects, no files (section 12)
  src/world/terrain.js  terrain generation and sampling (section 8)
  src/world/vehicle.js  vehicle physics (section 10)
  src/world/pickups.js  coins and fuel cans (section 11)
  src/scenes/menu.js    main menu
  src/scenes/garage.js  vehicle choice and upgrades
  src/scenes/level.js   driving
  src/scenes/results.js results screen
  src/main.js           game loop and scene switching (section 14)
  README.md             how to play, controls, file overview
  TESTING.md            the checklist from section 20 with each item marked PASS/FAIL and how it was checked
```
Each JS file attaches what it exports to `window` (for example `window.RR = window.RR || {}; RR.Terrain = ...`).

## 2. Look and feel

- Canvas 1280×720, scaled to fit the window while keeping the aspect ratio (letterbox).
- Flat, colourful style drawn with canvas paths: sky gradient per terrain, two parallax hill layers, the ground as a filled polygon with a darker 6 px top edge.
- Vehicles drawn from simple shapes: a body polygon, two wheels with spokes that rotate with the wheel angle, a driver head circle.
- HUD at the top: fuel bar (left), distance in metres (centre), coins (right), speed in km/h under the distance. Font: system-ui, bold, white with a dark outline.
- 60 fps target with requestAnimationFrame; physics at a fixed 120 Hz step (accumulator), rendering interpolated or at the latest state.

## 3. Units and constants

- 1 metre = 40 pixels. Gravity 9.81 m/s² downward (positive y is down in canvas space; convert carefully).
- Distance shown = horizontal distance of the vehicle's chassis centre from the start, in whole metres.
- Speed shown = chassis speed magnitude × 3.6, rounded, in km/h.
- Fuel: 100 units at start; consumption per second = base rate × throttle (0..1) + 0.15 idle.

## 4. Vehicles (src/data/vehicles.js)

Exactly five vehicles. Each entry has: `id`, `name`, `description`, `massKg`, `wheelRadiusM`, `topSpeedFactor`, `torqueFactor`, `fuelRateFactor`, `price` (coins; 0 = owned from the start), `colors` {body, wheel}, and geometry: `wheelbaseM`, `bodyWidthM`, `bodyHeightM`, `suspensionStiffness`, `suspensionDamping`.

| id | name | description | mass kg | wheel radius m | top speed × | torque × | fuel rate × | price |
|---|---|---|---|---|---|---|---|---|
| jeep | Jeep | Balanced all-rounder | 1200 | 0.55 | 1.0 | 1.0 | 0.9 | 0 |
| bike | Bike | Light, fast, flips easily | 350 | 0.35 | 1.25 | 0.8 | 1.3 | 500 |
| monster-truck | Monster Truck | Heavy, big wheels, climbs anything | 2400 | 0.85 | 0.85 | 1.4 | 0.7 | 1500 |
| rally-car | Rally Car | Fast on flat ground, low clearance | 1000 | 0.4 | 1.35 | 0.9 | 1.0 | 2500 |
| tractor | Tractor | Slow, unstoppable torque, frugal | 1800 | 0.75 | 0.6 | 1.8 | 0.6 | 4000 |

Choose sensible wheelbase/body sizes and suspension values per vehicle (document them in the file with a comment). The Bike must be visibly narrower and the Monster Truck visibly taller.

## 5. Terrains (src/data/terrains.js)

Three terrains. Fields: `id`, `name`, `sky` (two gradient colours), `ground` colour, `hilliness` (amplitude multiplier), `grip` (0..1 tyre friction multiplier), `description`, plus `layers` for the parallax hills (two colours).

- **Countryside** (`countryside`): sky #87CEEB → #E0F6FF, ground #4caf50, hilliness 0.8, grip 1.0 — gentle rolling hills.
- **Desert** (`desert`): sky #f6d365 → #fda085, ground #d2a24c, hilliness 1.2, grip 0.85 — long dunes, loose sand (less grip).
- **Arctic** (`arctic`): sky #a1c4fd → #c2e9fb, ground #e8f4ff, hilliness 1.0, grip 0.6 — icy slopes, very low grip, steep ramps.

## 6. Upgrades (src/data/upgrades.js)

Four upgrade tracks, bought per vehicle in the garage. Each has `id`, `name`, `effect` text, `maxLevel`, `costs` (array, one per level).

- **Engine** (`engine`): +12% torque per level, max level 5, costs [200, 450, 800, 1300, 2000].
- **Suspension** (`suspension`): +10% stiffness and damping per level, max level 5, costs [150, 350, 650, 1000, 1500].
- **Tires** (`tires`): +8% grip per level, max level 5, costs [150, 350, 650, 1000, 1500].
- **Fuel tank** (`fuel`): +15 fuel capacity per level, max level 5, costs [100, 250, 500, 800, 1200].

## 7. Levels (src/data/levels.js)

Nine levels, three per terrain, unlocked in order (level n+1 unlocks when level n is finished). Fields: `id`, `name`, `terrain`, `lengthM` (finish line distance), `seed` (terrain generator seed), `coinDensity`, `fuelCans` (count), `reward` (coins for finishing).

| # | name | terrain | length m | seed | coins/100 m | fuel cans | reward |
|---|---|---|---|---|---|---|---|
| 1 | Meadow Run | Countryside | 600 | 1000 | 6 | 4 | 100 |
| 2 | Farm Track | Countryside | 850 | 1037 | 5 | 4 | 175 |
| 3 | Windmill Ridge | Countryside | 1100 | 1074 | 4 | 4 | 250 |
| 4 | Dune Dash | Desert | 1350 | 1111 | 6 | 3 | 325 |
| 5 | Oasis Hop | Desert | 1600 | 1148 | 5 | 3 | 400 |
| 6 | Sandstorm Pass | Desert | 1850 | 1185 | 4 | 3 | 475 |
| 7 | Frozen Lake | Arctic | 2100 | 1222 | 6 | 2 | 550 |
| 8 | Glacier Climb | Arctic | 2350 | 1259 | 5 | 2 | 625 |
| 9 | Summit Fury | Arctic | 2600 | 1296 | 4 | 2 | 700 |

## 8. Terrain generation (src/world/terrain.js)

- Deterministic from the level seed: implement a small seeded PRNG (mulberry32) — never Math.random for terrain.
- Height function h(x) in metres built from the sum of three sine octaves with seeded phases, amplitude scaled by the terrain's hilliness, plus seeded "features": ramps (a linear rise of 2–4 m over 6 m followed by a drop), bumps (short 0.5 m humps) and one steep hill every ~150 m whose slope never exceeds 38°.
- The first 15 m are flat (start area) and the 10 m after the finish line are flat (finish area).
- Sample points every 0.5 m, generated lazily in chunks of 50 m ahead of the camera and dropped 100 m behind it.
- API: `RR.Terrain.create(level, terrainDef)` returns an object with `heightAt(xM)`, `slopeAt(xM)` (radians), `normalAt(xM)`, `draw(ctx, camera)`, `finishX`.

## 9. Controls (src/core/input.js)

| Key | Action |
|---|---|
| → or D | Gas (throttle 1) |
| ← or A | Brake / reverse (throttle −0.6 once stopped) |
| Space | Handbrake (wheels locked) |
| P or Esc | Pause / resume (pause overlay with Resume, Restart, Quit to menu) |
| R | Restart level |
| M | Mute / unmute |

In the air, gas tilts the vehicle backward (nose up) and brake tilts it forward (air control torque). Input state is read once per physics step. Releasing the window focus pauses the game.

## 10. Vehicle physics (src/world/vehicle.js)

Write your own small 2D rigid-body model (no physics library):
- The chassis is one rigid body (position, velocity, angle, angular velocity, mass from the vehicle, moment of inertia of a box).
- Two wheels attached by spring–damper suspensions along the chassis' local vertical axis; each wheel has its own radius, angular velocity and contact test against the terrain (sample the height under the wheel centre, and use the terrain normal).
- Wheel contact: penetration correction plus a normal force from the suspension; tyre friction force = min(drive force, grip × terrain grip × normal force), along the terrain tangent.
- Drive torque from throttle × torqueFactor × upgrades, limited by topSpeedFactor (torque fades linearly to zero at top speed: 90 km/h × topSpeedFactor).
- Rear-wheel drive for the Rally Car and the Bike, all-wheel drive for the others.
- Crash: the game ends when the driver's head touches the ground (head circle centre within its radius of the terrain) or the chassis angle stays beyond ±150° for more than 1.5 s.
- Out of fuel: when fuel reaches 0 the throttle stops working; the level ends 3 s after the vehicle's speed drops below 0.5 km/h.
- Use semi-implicit Euler at 120 Hz. Clamp extreme velocities so the simulation never explodes; NaN anywhere must be impossible (guard divisions).

## 11. Pickups (src/world/pickups.js)

- Coins: placed along the track by seeded positions, 1.2 m above the ground; collecting adds 5 coins (gold) or 25 (a rare blue coin, 1 in 20). Coins spin (scale x by cos(t)).
- Fuel cans: evenly spaced (lengthM / (fuelCans + 1)), refill fuel to full, show "+FUEL" floating text.
- Collection uses the distance between the chassis centre and the pickup (< 1.0 m).

## 12. Audio (src/core/audio.js)

Generate every sound with WebAudio oscillators and noise — no audio files:
- Engine: a sawtooth oscillator whose frequency follows wheel speed (60 Hz idle → 220 Hz at top speed) and whose gain follows throttle; low-pass filtered.
- Coin: a short two-note square-wave blip. Fuel: a rising sine sweep. Crash: a 0.4 s noise burst with a falling filter. Finish: a three-note arpeggio.
- The audio context starts on the first key press (browsers block autoplay). Mute state is saved.

## 13. Save data (src/core/save.js)

Save in localStorage under the key `ridge-riders-save-v1` as JSON:
`{ coins, ownedVehicles: [ids], selectedVehicle, upgrades: { [vehicleId]: { engine, suspension, tires, fuel } }, unlockedLevel, bestDistance: { [levelId]: metres }, muted }`.
Load at startup with defaults when missing or corrupt (catch JSON errors). Save after every purchase, level end, and mute toggle. A "Reset progress" button in the menu asks for confirmation (canvas dialog, not window.confirm) and clears the save.

## 14. Game loop and scenes (src/main.js)

- One scene object active at a time, each with `enter(params)`, `update(dt)`, `draw(ctx)`, `exit()`, and input handlers; `RR.switchScene(name, params)`.
- Menu: title "RIDGE RIDERS" with a drawn hill silhouette, buttons Play, Garage, Reset progress; total coins shown. Mouse and keyboard (arrow keys + Enter) both work for buttons.
- Garage: left/right to browse the five vehicles (drawn preview, stats as bars, price or "Owned"), Buy/Select; the four upgrade tracks for the selected vehicle with level pips and the next cost; Back.
- Level select (part of Play): the nine levels as cards in a 3×3 grid, locked ones greyed with a lock icon, best distance shown.
- Level: camera follows the chassis with smoothing, keeps it at 35% from the left; finish line drawn as a checkered pole. Reaching the finish ends the level as a win.
- Results: "FINISH!" or "CRASHED" or "OUT OF FUEL", distance, coins collected, reward (win only), new best marker, buttons Retry, Next level (win only), Garage, Menu.

## 15. Camera and rendering details

- Camera x follows chassis x − 0.35 × viewWidth with exponential smoothing (factor 1 − e^(−6 dt)); camera y follows chassis height softly and is clamped so the ground stays visible.
- Parallax layers move at 0.2 and 0.5 of the camera speed.
- Draw order: sky, far hills, near hills, terrain, pickups, finish pole, vehicle, floating texts, HUD, overlays.

## 16. Difficulty and balance

- With no upgrades, the Jeep must be able to finish levels 1–3; level 4 should need about two upgrades; level 9 should need most upgrades and a good vehicle.
- A full fuel tank should last about 500 m of hard driving on level 1 with the Jeep. Tune the fuel base rate to that and write the value you chose in README.md.

## 17. Performance

- No allocation in the inner physics loop (reuse vectors/objects).
- Terrain drawing only covers the visible range plus a margin. Must hold 60 fps on a laptop.

## 18. Code quality

- Every file starts with a comment saying what it does. Functions are short. No global variables other than the `RR` namespace and the `RR_*` data arrays.
- No console errors or warnings when the game runs.

## 19. Accessibility

- All buttons reachable by keyboard with a visible focus outline. Text has strong contrast. A "Reduce motion" option is not required.

## 20. Test checklist (put in TESTING.md, each marked PASS/FAIL with how you checked)

1. index.html opens from disk with no console errors
2. menu shows title, Play, Garage, Reset progress and total coins
3. garage lists exactly five vehicles with correct names
4. buying a vehicle deducts its price and marks it owned
5. selecting an owned vehicle persists after reload
6. each upgrade track can be bought up to level 5 and costs match section 6
7. upgrades change vehicle behaviour (engine: faster acceleration)
8. level select shows nine levels; only level 1 unlocked on a new save
9. terrain is identical on two runs of the same level (seeded)
10. first 15 m are flat
11. gas moves the vehicle forward; brake slows and reverses
12. air control tilts the vehicle
13. handbrake locks the wheels
14. fuel decreases with throttle and refills at a can
15. out of fuel ends the level after the vehicle stops
16. head touching the ground ends the level as CRASHED
17. finish line ends the level as FINISH and unlocks the next level
18. coins are collected and added to the total after the level
19. best distance is recorded per level
20. pause overlay works with P and Esc
21. R restarts the level
22. M mutes and the mute state persists
23. sounds play for engine, coin, fuel, crash and finish
24. HUD shows fuel, distance, coins and speed
25. canvas scales to the window and keeps its aspect ratio
26. no NaN in physics after 5 minutes of driving
27. Reset progress clears the save after confirmation
28. README.md and TESTING.md exist and are accurate

Check the parts you can check from code and with headless runs (for example a small Node script under scratch/ that loads the data files and the terrain module in a fake `window` and checks determinism, lengths and prices). Be honest: mark items you could not check as NOT CHECKED with the reason.

## 21. Delivery order

1. Data files. 2. Terrain. 3. Vehicle physics. 4. Level scene with HUD so the game is drivable. 5. index.html wiring — the game must open and drive at this point. 6. Pickups and fuel. 7. Menu, garage, level select, results. 8. Save. 9. Audio. 10. README.md and TESTING.md.

## 22. Final answer

Finish with a short summary: what works, the files, the fuel rate you chose, and anything from this brief that is not done.

## Appendix A — Level details

Each level must include the listed set-pieces. They are generated from the seed at fixed distances (written in levels.js as `features: [...]` with type and position) so the level plays the same every time.

### Level 1: Meadow Run
- Decoration: a wooden fence line in the near parallax layer.
- Challenge: two small ramps that teach air control.
- Special: a tutorial hint overlay for the first 5 seconds: 'Hold → for gas, ← to brake'.
- Par time (shown on the results screen as a target, no penalty): 60 s. Show a gold star when the level is finished under par.
- The finish reward is paid once per level; replays pay 25% of it.

### Level 2: Farm Track
- Decoration: hay bales drawn as decorations next to the track.
- Challenge: a muddy dip (grip × 0.8 between 300 m and 340 m).
- Special: a barn silhouette at the finish.
- Par time (shown on the results screen as a target, no penalty): 80 s. Show a gold star when the level is finished under par.
- The finish reward is paid once per level; replays pay 25% of it.

### Level 3: Windmill Ridge
- Decoration: windmills in the far layer whose blades rotate slowly.
- Challenge: three steep hills close together near 500 m.
- Special: a gust zone: a constant 1.5 m/s² push backward between 600 m and 650 m shown with drifting streaks.
- Par time (shown on the results screen as a target, no penalty): 100 s. Show a gold star when the level is finished under par.
- The finish reward is paid once per level; replays pay 25% of it.

### Level 4: Dune Dash
- Decoration: cacti decorations.
- Challenge: long dunes with crests every 40 m.
- Special: heat shimmer drawn as a faint sine distortion line near the horizon.
- Par time (shown on the results screen as a target, no penalty): 120 s. Show a gold star when the level is finished under par.
- The finish reward is paid once per level; replays pay 25% of it.

### Level 5: Oasis Hop
- Decoration: palm trees around an oasis pool at 400 m (decoration only).
- Challenge: a jump over the pool: the ramp is at 380 m, landing at 425 m.
- Special: bonus coins in an arc over the pool.
- Par time (shown on the results screen as a target, no penalty): 140 s. Show a gold star when the level is finished under par.
- The finish reward is paid once per level; replays pay 25% of it.

### Level 6: Sandstorm Pass
- Decoration: a sandstorm overlay (semi-transparent tan) that reduces visibility after 500 m.
- Challenge: dunes with a 35° maximum slope.
- Special: fuel cans spaced further apart.
- Par time (shown on the results screen as a target, no penalty): 160 s. Show a gold star when the level is finished under par.
- The finish reward is paid once per level; replays pay 25% of it.

### Level 7: Frozen Lake
- Decoration: a frozen lake section that is perfectly flat with grip × 0.3.
- Challenge: snowflakes falling in the foreground.
- Special: ice cracks drawn on the lake surface.
- Par time (shown on the results screen as a target, no penalty): 180 s. Show a gold star when the level is finished under par.
- The finish reward is paid once per level; replays pay 25% of it.

### Level 8: Glacier Climb
- Decoration: glacier walls with steep 38° climbs.
- Challenge: crevasse gaps of 3 m that must be jumped.
- Special: blue coins more common (1 in 8).
- Par time (shown on the results screen as a target, no penalty): 200 s. Show a gold star when the level is finished under par.
- The finish reward is paid once per level; replays pay 25% of it.

### Level 9: Summit Fury
- Decoration: the summit flag at the finish.
- Challenge: the longest track with mixed features from all earlier levels.
- Special: a dramatic dusk sky gradient.
- Par time (shown on the results screen as a target, no penalty): 220 s. Show a gold star when the level is finished under par.
- The finish reward is paid once per level; replays pay 25% of it.

## Appendix B — Vehicle feel notes

- **Jeep**: stable, forgiving suspension; should rarely flip on levels 1–3; air control strength 1.0.
- **Bike**: very responsive air control (1.6), flips if the player holds gas on a steep hill; the driver head is higher relative to the body, so crashes are easier.
- **Monster Truck**: soft, long-travel suspension (wheel travel 0.6 m), slow to turn in the air (0.6), climbs 38° hills without upgrades.
- **Rally Car**: stiff suspension, low body (crashes on big bumps if driven too fast), best top speed; air control 1.1.
- **Tractor**: rear wheels much larger than front (front radius 0.45 m, rear 0.9 m), top speed 45 km/h, uses half the fuel of the Jeep.

## Appendix C — Garage screen layout

- Left 60%: the vehicle preview on a turntable line, idling animation (wheels slowly turning, body bobbing 2 px). Under it the name, description and four stat bars (Speed, Torque, Grip, Fuel economy) computed from the data plus upgrades.
- Right 40%: the four upgrade rows. Each row: icon (drawn), name, effect text, five level pips (filled = bought), and a Buy button with the next cost, greyed when the player can't afford it or the track is maxed.
- Bottom: ← Prev, Buy/Select, Next →, Back. Keyboard: ←/→ browse, Enter buy/select, U/I/O/P buy upgrade 1–4, Esc back.
- Buying with too few coins shakes the button and plays a low buzz.

## Appendix D — Results screen rules

- Counts up the distance and coins over 1 s (skippable with Enter).
- 'NEW BEST!' banner when the distance beats the stored best for this level.
- Gold star when finished under par time.
- Coins collected during the run are added to the total even when the run ends in a crash or out of fuel; the finish reward only on a finish.
- Next level button only appears when the next level exists and is now unlocked.

## Appendix E — Edge cases to handle

- Window resize during a level: re-fit the canvas without restarting.
- Tab hidden: pause; the physics accumulator must not try to catch up seconds of time on return (cap dt at 0.1 s).
- A save from an older version or with unknown vehicle ids: drop unknown ids, keep the rest.
- Coins can't go negative; buying is refused when the price is more than the coins.
- The vehicle falling off the left edge of the generated terrain (driving backward past the start) is stopped by an invisible wall at x = −2 m.
- Very high speed on a ramp must not tunnel through the ground: sub-step the wheel contact or clamp the per-step movement to 0.25 m.

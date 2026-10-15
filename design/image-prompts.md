# Images: where they go, and the prompts

Aatmiq's screens are clean but use the same icon tile for every empty state. The 404 page is
Next.js's default, and the landing page is only text and boxes. That's what makes it feel generated.
This file lists every place an image helps, every place it would hurt (and why), one art direction
for all of them, and a ready prompt for each image.

- **Baseline for "before" screenshots:** commit `4e53856` (`tests/e2e/screens.mjs` captures every
  page, including the empty states a new member sees).
- **How the prompts are used:** `scripts/generate-images.mjs` (written once we have the image
  model's API key) reads the image blocks below, builds each prompt as
  **Subject + Style (dark or light) + Background (object or scene) + Avoid**, generates every
  variant, converts it to WebP at the sizes given and writes it to `apps/web/public/images/`.

---

## 1. Art direction: "Quiet stone"

The logo is a standing stone with a light inside it ("the self"; the repository is even called
Monolith). Every image is a variation on that one idea: **smooth, sculptural stone objects with a
small inner light, photographed like a museum still life.** It looks calm, expensive and unlike
the usual AI-product art (glowing brains, robots, purple gradients).

| | |
|---|---|
| Subject | One stone object or a small group of stones (slabs, pebbles, arches, plinths, cairns) that tells what the screen is for |
| Material | Dark theme: matte basalt and graphite. Light theme: pale limestone and travertine. Fine natural grain, no gloss |
| Light | One soft, diffused key light from the upper left, gentle long shadows, deep but not crushed blacks |
| The inner light | Marketing pages: a small cyan glow (`#22D3EE`, the brand accent) from inside one stone. **Inside the app: warm white (`#F3EFE6`) instead**, because every customer can change the accent color and a cyan glow would clash with theirs |
| Composition | Subject centered or on a third, **lots of empty space**, nothing touching the edges, eye level or slightly above, 50–85 mm lens look, shallow depth of field on large images |
| Background | Objects: seamless and plain, exactly the theme's page colour so the image melts into the page: **`#0F0F0F` (dark)**, **`#FBFBFB` (light)**; transparent if the model supports it. Scenes (the hero, the sign-in panel): an environment kept within those tones, fading towards that colour at the edges |
| Colour | Near-monochrome. The only colour is the inner light |
| Never | Text, letters, numbers, logos, watermarks, people, hands, faces, screens or UI, robots, brains, circuit boards, network lines, holograms, neon, lens flares, rainbow or purple gradients, glossy plastic, cartoon or clip-art style, busy textures |

**Why it fits a white-label product:** customers rename and re-colour Aatmiq. Stone and light carry
no brand, so the images suit any customer's name and logo; only the marketing images (Aatmiq's own
site) use the cyan.

**Dark and light:** every image that sits on a page background comes in two variants with the
same composition: basalt on `#0F0F0F` and limestone on `#FBFBFB`. The app shows the one for the
current theme.

**Keeping the set consistent:**
1. Generate **`landing-hero`** first and pick the best one. It's the style anchor.
2. If the model accepts a reference image (most current ones do), pass the anchor with every other
   prompt: "match the material, lighting and colour grading of the reference image".
3. Use the same seed for both variants of an image, where the model has seeds.
4. Generate 3–4 candidates for each image and keep one; reject any with text, extra objects or a
   background that isn't plain.

---

## 2. The shared prompt blocks

Each prompt is **Subject + Style + Background + Avoid**. The Subject, and whether the image is an
object or a scene, is in each image's block in section 4.

**Style · dark** (`style-dark`)

```text
Minimal fine-art photograph, museum quality. Stone of matte dark basalt and graphite with a fine natural grain, no gloss. One soft diffused key light from the upper left, gentle long shadows, rich deep tones, low-key exposure. Near-monochrome, cool neutral grey palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.
```

**Style · light** (`style-light`)

```text
Minimal fine-art photograph, museum quality. Stone of pale limestone and soft travertine with a fine natural grain, no gloss. One soft diffused daylight from the upper left, gentle long soft shadows, airy high-key exposure. Near-monochrome, warm neutral off-white palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.
```

**Background · object** (`bg-object`): the landing cards, empty states and system pages

```text
Studio still life on a seamless plain background of solid {BG} that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.
```

**Background · scene** (`bg-scene`): the hero, the call to action, the sign-in panels and the link preview

```text
The whole scene stays within tones close to {BG}, and every edge of the frame fades smoothly into solid {BG}, so the image blends into a page of that colour.
```

`{BG}` is `#0F0F0F` for the dark variant and `#FBFBFB` for the light one.

**Avoid** (`avoid`; also the negative prompt, where the model takes one)

```text
Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

**The inner light, by where the image is used:**
- marketing images: `a small soft glow of cyan light (#22D3EE) emanating from within the stone`
- app images: `a small soft glow of warm white light (#F3EFE6) emanating from within the stone`

---

## 3. Every page, and whether it gets an image

✅ an image (ID in section 4) · ➖ no image, and why

### Public website (Aatmiq's own; customers can turn it off with `SHOW_MARKETING=false`)

| Page / section | Decision |
|---|---|
| Landing: hero (headline, buttons, the live product replica) | ✅ `landing-hero` behind the headline, fading into the page; the live replica stays on top. It's the product, so it beats any picture of it |
| Landing: model names row | ➖ Text is right here |
| Landing: three products (Chat, Work AI, Code) | ✅ `landing-chat`, `landing-work`, `landing-code` as the top of each card |
| Landing: privacy ("Nothing leaves your building") | ➖ The network diagram already explains it; a picture would compete |
| Landing: admin features grid (9 items) | ➖ Icons suit a dense grid; nine images would be noise |
| Landing: how it works (3 steps) | ✅ `landing-steps` under the heading in the left column, which is empty space today |
| Landing: plans | ➖ Pricing should be easy to compare; no pictures |
| Landing: closing call to action | ✅ `landing-cta` as a dim background |
| Landing: footer | ➖ |
| Link previews (Slack, WhatsApp, LinkedIn, email) | ✅ `og-image`: the art is generated, then the logo and headline are added by code (image models can't spell) |
| Browser tab icon, app icons | ➖ The logo is vector already; never let a model redraw a logo |

### Sign-in and account pages (customers' own name and logo appear here)

| Page | Decision |
|---|---|
| Sign in | ✅ `auth-panel` on the right half of wide screens; the form stays on the left. Hidden on phones |
| Accept invitation, invalid invitation | ✅ `auth-panel` (same image: one calm place to sign in) |
| Forgot password, reset password (and its expired link) | ✅ `auth-panel` |
| Two-step sign-in setup | ✅ `auth-panel` |
| First-time setup (creating the organization) | ✅ `auth-setup`: a doorway, for the first time anyone opens it |

### The app

| Page / state | Decision |
|---|---|
| Chat: new chat (greeting and composer) | ➖ The greeting, the composer and suggestions are the focus; a picture here slows people down. (This is how the best chat products do it) |
| Chat: a conversation | ➖ Content-dense |
| Chat: print view | ➖ |
| Documents: none yet | ✅ `empty-documents` in the drop area |
| Documents: list | ➖ |
| Projects: none yet | ✅ `empty-projects` |
| Projects: list | ➖ Project cards already carry their colour |
| One project: no chats yet | ✅ `empty-project-chats` (small, in the dashed box) |
| One project: no sources, no tasks | ➖ Short one-line hints are enough beside the chats image |
| Work AI: no tasks yet | ✅ `empty-work` in the dashed "Tasks" box under the composer and its examples |
| Work AI: one task (timeline, files, preview) | ➖ Content-dense |
| Work AI: skills of your own, none | ✅ `empty-skills` |
| Work AI: connections, none | ✅ `empty-connections` |
| Work AI: connections, the app list | ➖ **Not AI**: show each app's real logo (Gmail, Slack, GitHub…) from its official brand kit, instead of the generic category icon used today. A model would draw them wrong, and they're trademarks |
| Work AI: schedules, none | ✅ `empty-schedules` |
| Code: no workspaces | ✅ `empty-code` |
| Code: one workspace (the IDE) | ➖ The editor fills the screen; its empty-editor watermark is the vector logo already |
| Settings (profile, appearance, your data, archived chats…) | ➖ Forms; the archived-chats hint stays text |
| Search (⌘K) with no results | ➖ Too small; text |
| Notifications, none | ✅ `empty-inbox` (shared with admin requests and invitations) |

### Admin console

| Page / state | Decision |
|---|---|
| Overview, users, workspaces, usage, audit log, authentication, settings, Work AI | ➖ Tables, charts and forms: images would get in the way of the work |
| Users: no pending invitations | ✅ `empty-inbox` |
| Requests: none pending | ✅ `empty-inbox` |
| Models: no providers yet, no models yet | ✅ `empty-models` |
| Groups: none yet | ✅ `empty-groups` |
| Health: everything working | ✅ `health-ok` small, next to "Everything is working" |
| License: no license yet | ✅ `license-none` |

### System pages

| Page | Decision |
|---|---|
| Page not found (404) | ✅ `not-found`, with a proper page in the product's style (today: Next.js's default black page) |
| Something went wrong (error page) | ✅ `error` (today there is none: a crash shows Next.js's default) |
| Desktop app: connect to your server | ✅ `auth-panel` as a narrow band above the card |
| Desktop app: can't reach the server | ✅ `offline` |
| Emails (invitations, password resets, alerts) | ➖ They carry the customer's logo; images in email hurt delivery and are blocked by many mail clients |
| License console (our internal Super Admin) | ➖ Internal tool; not worth it now |

**Total: 25 images**, each in a dark and a light variant except the link preview: 49 files.

---

## 4. The images

Sizes: **Generate** is what to ask the model for (all are sizes current models offer); **Shown**
is the largest it appears at, so we export 1× and 2× WebP from it. **Light** is `inner light`:
`cyan` (marketing) or `white` (app).

### Public website

#### `landing-hero`
- **Kind:** scene
- **Where:** Landing page, the top of the page, full width: the headline "Your own AI. Nowhere else."
  sits in its sky, the monolith stands below the buttons, and the product replica follows under it.
- **Generate:** 1536×1024 (3:2), or 16:9 · **Shown:** full width × 860 px · **Variants:** dark,
  light · **Light:** cyan
- **File:** `apps/web/public/images/landing/hero-{dark,light}.webp`

```text
A vast, perfectly calm, empty plain at nightfall under a deep, dark charcoal sky, seen from a low eye level. Far away and small in the frame, exactly in the horizontal centre, a single tall, slender monolith of smooth stone stands alone, its base at about 80% of the frame's height, a small soft glow of light emanating from within its lower third. A faint, low mist lies on the ground around it. Above it the sky is enormous, empty and smooth, filling the top 70% of the frame, so a headline can sit there, and fading seamlessly into the plain background colour at the top and side edges. The ground fades the same way at the bottom edge. Wide, cinematic, serene, a lot of empty space.
```

#### `landing-chat`
- **Kind:** object
- **Where:** Landing page, top of the "Chat" card ("Ask, write, understand.").
- **Generate:** 1536×1024 (3:2) · **Shown:** 380×253 · **Variants:** dark, light · **Light:** cyan
- **File:** `apps/web/public/images/landing/chat-{dark,light}.webp`

```text
Two smooth, rounded river stones of slightly different sizes resting on a low rectangular stone plinth, turned gently towards each other as if in quiet conversation. A thin, soft line of light glows in the narrow gap between them, as if passing from one to the other. Simple, balanced, intimate. Centered, viewed at eye level.
```

#### `landing-work`
- **Kind:** object
- **Where:** Landing page, top of the "Work AI" card ("Hand off a task. Get it done.").
- **Generate:** 1536×1024 (3:2) · **Shown:** 380×253 · **Variants:** dark, light · **Light:** cyan
- **File:** `apps/web/public/images/landing/work-{dark,light}.webp`

```text
A cairn of four flat, smooth stones stacked in perfect balance, decreasing in size towards the top, with a fifth small stone floating just above the stack about to settle into place. The top stone has a small soft glow of light within it. Precise, calm, a sense of steady progress. Centered, viewed slightly from below.
```

#### `landing-code`
- **Kind:** object
- **Where:** Landing page, top of the "Code" card ("A full IDE, with an agent inside.").
- **Generate:** 1536×1024 (3:2) · **Shown:** 380×253 · **Variants:** dark, light · **Light:** cyan
- **File:** `apps/web/public/images/landing/code-{dark,light}.webp`

```text
Two precisely machined stone blocks joined by a crisp interlocking dovetail joint, with razor-sharp edges and perfectly flat faces, sitting slightly apart as if just about to slide together. A small soft glow of light shines from inside the joint. Engineering precision, craftsmanship, exactness. Three-quarter view, centered.
```

#### `landing-steps`
- **Kind:** object
- **Where:** Landing page, "How it works", under the heading in the left column.
- **Generate:** 1024×1536 (2:3) · **Shown:** 420×560 · **Variants:** dark, light · **Light:** cyan
- **File:** `apps/web/public/images/landing/steps-{dark,light}.webp`

```text
Three wide, shallow stone steps rising gently from the bottom left towards the upper right, each a single smooth slab. On the top step rests one small rounded stone with a soft glow of light inside it. Long soft shadows fall across the steps. A feeling of an easy, short path. Tall portrait composition with the steps in the lower two thirds and calm empty space above.
```

#### `landing-cta`
- **Kind:** scene
- **Where:** Landing page, background of the closing block "Give your team AI they can trust."
  (shown at low opacity behind centered text).
- **Generate:** 1536×1024 (3:2), or 21:9 · **Shown:** 1150×430 · **Variants:** dark, light ·
  **Light:** cyan
- **File:** `apps/web/public/images/landing/cta-{dark,light}.webp`

```text
A close, low view of the base of a monumental smooth stone monolith rising out of frame, its surface softly lit from one side, with a small soft glow of light emanating from deep within the stone near the bottom centre. The centre and top of the frame are quiet and dark-toned so text can sit there, and the image fades smoothly into the plain background at every edge. Monumental, calm, trustworthy.
```

#### `og-image`
- **Kind:** scene
- **Where:** The preview when someone shares a link to the site. Code adds the logo and "Your own
  AI. Nowhere else." on the left half.
- **Generate:** 1536×1024 (3:2), cropped to 1200×630 · **Shown:** 1200×630
- **Variants:** dark only · **Light:** cyan
- **File:** `apps/web/public/images/og/og-art.webp` (the finished card: `apps/web/src/app/opengraph-image.tsx`)

```text
A single tall, slender monolith of smooth stone standing in the right third of the frame on a perfectly plain seamless ground, a small soft glow of light emanating from within its lower third, with a long soft shadow falling to the left. The entire left half of the frame is empty plain background for a headline. Minimal, iconic, poster-like.
```

### Sign-in and account pages

#### `auth-panel`
- **Kind:** scene
- **Where:** Right half of sign in, accept invitation, invalid invitation, forgot password, reset
  password and two-step setup on screens 1024 px and wider; a 160 px band above the card in the
  desktop app's connect screen. The form keeps the left half; the customer's logo stays on it.
- **Generate:** 1024×1536 (2:3) · **Shown:** 720×1080 · **Variants:** dark, light · **Light:** white
- **File:** `apps/web/public/images/auth/panel-{dark,light}.webp`

```text
A quiet, enclosed stone courtyard seen from inside: smooth plain stone walls, and in the middle a single tall standing stone, slender and smooth, with a small soft glow of light emanating from within it. Soft daylight falls from an opening above, drawing a gentle pool of light on the floor around the stone. Private, protected, peaceful. Tall portrait composition, the stone slightly below centre, lots of calm wall and space around it.
```

#### `auth-setup`
- **Kind:** scene
- **Where:** Right half of the first-time setup page (the owner creates the organization).
- **Generate:** 1024×1536 (2:3) · **Shown:** 720×1080 · **Variants:** dark, light · **Light:** white
- **File:** `apps/web/public/images/auth/setup-{dark,light}.webp`

```text
A tall, simple stone archway standing on its own, viewed straight on, with soft warm-white light pouring through the opening and spilling a long pool of light across the smooth stone floor towards the viewer. Nothing visible beyond the arch except soft light. A threshold, a beginning, an invitation to step in. Tall portrait composition, the arch centered in the lower two thirds.
```

### Empty states in the app

These are small spot illustrations (**Kind:** object), all built the same way so they read as one family: **one
object or one small group of stones, centered, filling about half the frame, on a plain
background, no environment.** Ask for a transparent background if the model supports it (then the
same file works in both themes); otherwise generate both variants.

- **Generate:** 1024×1024 (1:1) · **Shown:** 176×176 · **Variants:** dark, light (or one transparent)
  · **Light:** white
- **Files:** `apps/web/public/images/empty/<name>-{dark,light}.webp`

Add this to the Subject of each empty-state image:

```text
Isolated spot illustration: a single centered composition filling about half of the square frame, generous empty margin on every side, no floor line, no environment, only a soft contact shadow beneath the objects.
```

#### `empty-documents`
- **Where:** Documents page, in the drop area when the library is empty ("Drop files here or click
  to upload"); also the chat composer's library picker when empty.

```text
A neat stack of five thin, smooth slate tablets, slightly fanned so each edge is visible, the top tablet blank and perfectly smooth, waiting to be written on.
```

#### `empty-projects`
- **Where:** Projects page when there are no projects, above "New project".

```text
A shallow, rectangular stone tray holding three smooth pebbles of different sizes arranged neatly together, kept in one place.
```

#### `empty-project-chats`
- **Where:** Inside a project with no chats yet, in the dashed "Chats" box ("Chats you start here
  stay in this project…"). Shown at 120×120.

```text
Two smooth rounded pebbles resting side by side inside a shallow round stone dish, touching lightly.
```

#### `empty-work`
- **Where:** Work AI home when there are no tasks yet, in the dashed "Tasks" box ("Tasks you start
  appear here…"), under the composer and its example buttons.

```text
A smooth stone sphere resting at the start of a gentle, curving groove carved into a flat stone slab; the groove sweeps away in a graceful arc, showing the path the sphere will take. A small soft glow of light inside the sphere.
```

#### `empty-skills`
- **Where:** Work AI → Skills, "No skills of your own yet".

```text
A tidy row of four small carved stone tools of different simple shapes, a cube, a cylinder, a wedge and a small sphere, laid out evenly as a set.
```

#### `empty-connections`
- **Where:** Work AI → Connections, "No apps yet".

```text
Two smooth standing stones a short distance apart, joined at the top by a thin, elegant stone bridge forming a small arch between them.
```

#### `empty-schedules`
- **Where:** Work AI → Schedules, "Nothing scheduled".

```text
A minimal round stone sundial: a flat smooth disc with a single thin triangular stone gnomon, casting one crisp, clean shadow across its face. No markings on the dial.
```

#### `empty-code`
- **Where:** Code page, "No workspaces yet".

```text
A small stepped stone structure made of precisely cut rectangular blocks rising in three exact tiers, with crisp edges and perfectly flat faces, like a tiny ziggurat.
```

#### `empty-inbox`
- **Where:** Notifications with nothing new; Admin → Requests, "No pending requests"; Admin → Users,
  "No pending invitations".

```text
A single empty, shallow, round stone bowl with smooth thin walls, perfectly clean inside.
```

#### `empty-models`
- **Where:** Admin → Models, "No providers yet" and "No models yet".

```text
A single empty square stone pedestal with clean edges, its flat top bare and softly lit from above, waiting for something to be placed on it.
```

#### `empty-groups`
- **Where:** Admin → Groups when there are none.

```text
A small, tidy cluster of seven smooth river pebbles of different sizes, arranged closely together as one rounded group.
```

#### `health-ok`
- **Where:** Admin → Health, next to "Everything is working". Shown at 96×96.

```text
A small cairn of three smooth stones balanced perfectly on top of each other, still and steady, with a small soft glow of light inside the top stone.
```

#### `license-none`
- **Where:** Admin → License when there's no license key yet ("Enter a new license key").

```text
A smooth rectangular stone block with a single simple keyhole-shaped opening carved cleanly through its face, a small soft glow of light visible through the keyhole from inside.
```

### System pages

- **Generate:** 1536×1024 (3:2) · **Shown:** 560×373 · **Variants:** dark, light · **Light:** white
- **Files:** `apps/web/public/images/system/<name>-{dark,light}.webp`

#### `not-found`
- **Kind:** object
- **Where:** The 404 page ("This page doesn't exist"), above the message and a button home.

```text
A lone, simple stone archway standing in an empty, plain space with soft mist around its base; through the opening there is only more empty space, a doorway that leads nowhere. Quiet, slightly wistful, gentle. Centered, viewed straight on, small in the frame.
```

#### `error`
- **Kind:** object
- **Where:** The error page ("Something went wrong"), above the message and "Try again".

```text
A small cairn of smooth stones that has gently toppled: three stones resting calmly on the ground beside a low base stone, nothing broken, ready to be stacked again. Calm, not dramatic. Centered, viewed at eye level.
```

#### `offline`
- **Kind:** object
- **Where:** The desktop app's "Can't reach your server" screen.

```text
A tall smooth monolith standing in thick soft fog, its outline faint and partly hidden, the small inner light inside it dimmed to a faint glow. Hushed, patient, waiting. Centered.
```

---

## 5. How they're shown (the code)

- **Making them:** `scripts/generate-images.mjs generate` makes each image with FLUX.1-dev through
  NVIDIA's API (`NVIDIA_API_KEY`), or with `openai/gpt-image-2` through Pollinations
  (`POLLINATIONS_API_KEY`). FLUX can't take our image as input, so its light variant is made from the
  same words and seed; gpt-image-2 converts the dark image. FLUX draws whatever a prompt names, so it
  gets no "avoid" list, and empty-state objects are asked for from a high angle (no horizon).
  `--candidates n` makes several dark versions to choose from (`design/generated/candidates/`),
  `pick id=seed` keeps one. The originals stay in `design/generated/` (not committed).
- **Exporting:** `scripts/generate-images.mjs export` grades every image the same way (neutral grey,
  the dark variant a little deeper and the light one brighter, the glow in the brand cyan or white),
  centres each empty-state object in its square, and writes WebP files at 1× and 2× of the size each
  image is shown at into `apps/web/public/images/`, the list the app reads
  (`apps/web/src/components/art/manifest.json`), the link-preview art and the desktop app's copies.
- **Showing:** `<Art name="…">` (`apps/web/src/components/art/art.tsx`) shows the variant for the
  current theme, is decorative (`alt=""`, hidden from screen readers), loads lazily with fixed
  sizes so nothing jumps, and can fade its edges into whatever is behind it. `<EmptyState art="…">`
  and `<ArtOr>` keep today's icon when there's no picture.
- **Turning them off:** Admin → Settings → Organization & branding → Illustrations. The public
  landing page always shows its pictures.
- **Link preview:** `apps/web/src/app/(marketing)/opengraph-image.tsx` draws the logo and headline
  over the generated art; it's in its own route group so customers' app pages never show it.

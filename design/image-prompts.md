# Images: where they go, and the prompts

Aatmiq's screens are clean but use the same icon tile for every empty state. The 404 page was
Next.js's default, and the landing page was only text and boxes. That's what made it feel generated.
This file lists every place an image helps, every place it would hurt (and why), one art direction
for all of them, and a ready prompt for each image.

- **Baseline for "before" screenshots:** commit `4e53856` (`tests/e2e/screens.mjs` captures every
  page, including the empty states a new member sees).
- **How the prompts are used:** `scripts/generate-images.mjs` reads the image blocks below, builds each
  prompt as **Subject + Style (dark or light) + Background + Avoid**, generates every variant,
  exports it to WebP and writes it to `apps/web/public/images/`.
- **To make them by hand:** `design/image-prompts-by-hand.md` has every full prompt ready to paste.

---

## 1. Art direction: flat geometric

**Simple, flat illustrations of the thing each screen is about**: a stack of documents, a folder, a
calendar, two app tiles joined by a cable, an open door. Built from a few geometric shapes in three
shades of grey and **one accent**, with crisp edges and a fine paper grain. It reads at 120 px, looks
calm next to the interface, and feels designed rather than generated.

| | |
|---|---|
| Subject | One clear object or a small group of objects that says what the screen is for, drawn as simple geometric shapes |
| Shapes | Rounded rectangles, circles, arcs and clean straight edges; flat fills, no outlines, no 3D, no perspective tricks beyond a simple three-quarter view |
| Colour | Dark theme: three charcoal greys on near-black. Light theme: three soft greys on off-white. **One accent on one small part** (a folded corner, a dot, a tab), in the brand cyan |
| Texture | A very fine paper grain; at most one soft, flat shadow shape |
| Composition | Centred, about half the frame, lots of empty space; nothing touches the edges |
| Background | Plain and solid, the theme's page colour: **`#0F0F0F` (dark)**, **`#FBFBFB` (light)** |
| Never | Text, letters, numbers, logos, people or faces, hands, photographs, 3D renders, gradients, glows, neon, glass, clutter, extra objects |

**The accent follows the customer's colour.** The export splits every picture into a grey base and
an accent layer; the app paints the accent layer in the organization's accent colour (Admin →
Settings), so a customer who uses green gets green accents. Cyan is the default and the public site's
colour. The desktop app and the link preview keep the cyan.

**Dark and light:** every image comes in both, with the same subject and layout: charcoal on
near-black and soft grey on off-white.

**Keeping the set consistent:** generate 2 candidates of each and keep the clearest; reject any with
text, extra objects, gradients or shading that looks 3D.

---

## 2. The shared prompt blocks

Each prompt is **Subject + Style + Background + Avoid**.

**Style · dark** (`style-dark`)

```text
Modern editorial vector illustration made of simple geometric shapes filled with three shades of dark charcoal grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.
```

**Style · light** (`style-light`)

```text
Modern editorial vector illustration made of simple geometric shapes filled with three shades of soft light grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.
```

**Background · object** (`bg-object`): empty states, system pages, the product cards

```text
On a plain solid background of {BG} that fills the whole frame.
```

**Background · scene** (`bg-scene`): the hero, the call to action, the sign-in pictures, the link preview

```text
On a plain solid background of {BG} that fills the whole frame; the shapes stay calm and sparse so the picture can sit behind or beside text.
```

`{BG}` is dark charcoal `#0F0F0F` for the dark variant and soft off-white `#FBFBFB` for the light one.

**Avoid** (`avoid`)

```text
No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

---

## 3. Every page, and whether it gets an image

✅ an image (ID in section 4) · ➖ no image, and why

### Public website (Aatmiq's own; customers can turn it off with `SHOW_MARKETING=false`)

| Page / section | Decision |
|---|---|
| Landing: hero (headline, buttons, the live product replica) | ✅ `landing-hero` behind the headline, its shapes around the edges and the middle left free for the words; the live replica stays below it. It's the product, so it beats any picture of it |
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

Sizes: **Generate** is the shape to ask for; **Shown** is the largest size it appears at, so the
export makes 1× and 2× WebP from it. **Accent** is the colour the generator asks for; the app then
paints it in the organization's colour.

### Public website

#### `landing-hero`
- **Kind:** scene
- **Where:** Landing page, behind the headline "Your own AI. Nowhere else.", full width; the product
  replica follows below it.
- **Generate:** 1536×1024 (3:2) · **Shown:** full width × 760 px · **Variants:** dark, light · **Accent:** cyan
- **File:** `apps/web/public/images/landing/hero-{dark,light}.webp`

```text
A wide, calm composition of a few large geometric shapes placed only around the edges of the frame: a big quarter circle in the top left corner, a tall rounded rectangle on the right side, a thin arc low on the left, and a small cyan dot near the top right. The whole centre of the frame is empty, for a headline.
```

#### `landing-chat`
- **Kind:** object
- **Where:** Landing page, top of the "Chat" card ("Ask, write, understand.").
- **Generate:** 1536×1024 (3:2) · **Shown:** 380×253 · **Variants:** dark, light · **Accent:** cyan
- **File:** `apps/web/public/images/landing/chat-{dark,light}.webp`

```text
Two rounded speech bubbles overlapping slightly, one larger and one smaller, with three small dots inside the smaller bubble in cyan, centered.
```

#### `landing-work`
- **Kind:** object
- **Where:** Landing page, top of the "Work AI" card ("Hand off a task. Get it done.").
- **Generate:** 1536×1024 (3:2) · **Shown:** 380×253 · **Variants:** dark, light · **Accent:** cyan
- **File:** `apps/web/public/images/landing/work-{dark,light}.webp`

```text
A task card with three short horizontal bars like a checklist, the first two ticked with small round check marks, and a circular progress ring beside the card, three-quarters filled in cyan, centered.
```

#### `landing-code`
- **Kind:** object
- **Where:** Landing page, top of the "Code" card ("A full IDE, with an agent inside.").
- **Generate:** 1536×1024 (3:2) · **Shown:** 380×253 · **Variants:** dark, light · **Accent:** cyan
- **File:** `apps/web/public/images/landing/code-{dark,light}.webp`

```text
An editor window: a rounded rectangle with three small circles in its top bar and several short rounded bars of different lengths inside, indented like lines of code, one bar in cyan, centered.
```

#### `landing-steps`
- **Kind:** object
- **Where:** Landing page, "How it works", under the heading in the left column.
- **Generate:** 1024×1536 (2:3) · **Shown:** 420×560 · **Variants:** dark, light · **Accent:** cyan
- **File:** `apps/web/public/images/landing/steps-{dark,light}.webp`

```text
Three blocks stacked like rising steps from the bottom left to the upper right: a server box with two slots, a plug, and a small group of three circles; a cyan dot on the top block. Tall portrait composition, the steps in the lower two thirds, empty space above.
```

#### `landing-cta`
- **Kind:** scene
- **Where:** Landing page, background of the closing block "Give your team AI they can trust."
  (shown at low opacity behind centered text).
- **Generate:** 1536×1024 (3:2) · **Shown:** 1150×430 · **Variants:** dark, light · **Accent:** cyan
- **File:** `apps/web/public/images/landing/cta-{dark,light}.webp`

```text
A few large, soft geometric shapes along the bottom edge and the two sides of the frame: half circles, a long rounded bar and one small cyan circle. The centre and the top are empty, for text.
```

#### `og-image`
- **Kind:** scene
- **Where:** The preview when someone shares a link to the site. Code adds the logo and "Your own
  AI. Nowhere else." on the left half.
- **Generate:** 1536×1024 (3:2), cropped to 1200×630 · **Shown:** 1200×630
- **Variants:** dark only · **Accent:** cyan
- **File:** `apps/web/public/images/og/og-art.webp` (the finished card: `apps/web/src/app/(marketing)/opengraph-image.tsx`)

```text
On the right half of the frame only: a chat bubble, a document page and an editor window arranged around a central cyan circle, overlapping a little. The entire left half of the frame is empty, for a headline.
```

### Sign-in and account pages

#### `auth-panel`
- **Kind:** scene
- **Where:** Right half of sign in, accept invitation, invalid invitation, forgot password, reset
  password and two-step setup on screens 1024 px and wider; a 160 px band above the card in the
  desktop app's connect screen.
- **Generate:** 1024×1536 (2:3) · **Shown:** 720×1080 · **Variants:** dark, light · **Accent:** cyan
- **File:** `apps/web/public/images/auth/panel-{dark,light}.webp`

```text
A tall, calm composition: an open doorway with a pale shape of light falling through it onto the floor, a small cyan keyhole shape on the door, and two or three simple floating shapes around it (a circle, a small rounded square). Tall portrait composition, the doorway slightly below the centre.
```

#### `auth-setup`
- **Kind:** scene
- **Where:** Right half of the first-time setup page (the owner creates the organization).
- **Generate:** 1024×1536 (2:3) · **Shown:** 720×1080 · **Variants:** dark, light · **Accent:** cyan
- **File:** `apps/web/public/images/auth/setup-{dark,light}.webp`

```text
A tall composition: a small low wall made of three wide flat rectangular blocks seen from the front, with one cyan square block resting on top and a tiny four-point star beside it. Tall portrait composition, the blocks in the lower half.
```

### Empty states in the app

These are small spot illustrations (**Kind:** object), all built the same way so they read as one
family: **one object or one small group, centered, filling about half the frame, on a plain
background.**

- **Generate:** 1024×1024 (1:1) · **Shown:** 176×176 · **Variants:** dark, light · **Accent:** cyan
- **Files:** `apps/web/public/images/empty/<name>-{dark,light}.webp`

Add this to the Subject of each empty-state image:

```text
Spot illustration: one centered object filling about half of the square frame, the same empty margin on every side.
```

#### `empty-documents`
- **Where:** Documents page, in the drop area when the library is empty ("Drop files here or click
  to upload"); also the chat composer's library picker when empty.

```text
A neat stack of three blank document pages, the top page with a folded corner in cyan.
```

#### `empty-projects`
- **Where:** Projects page when there are no projects, above "New project".

```text
An open folder with three cards standing inside it, the front card with a small cyan tab.
```

#### `empty-project-chats`
- **Where:** Inside a project with no chats yet, in the dashed "Chats" box ("Chats you start here
  stay in this project…"). Shown at 120×120.

```text
A folder with two small rounded speech bubbles rising out of it, one bubble in cyan.
```

#### `empty-work`
- **Where:** Work AI home when there are no tasks yet, in the dashed "Tasks" box ("Tasks you start
  appear here…"), under the composer and its example buttons.

```text
A blank task card with three empty checkbox rows and a small cyan play-button circle at its corner.
```

#### `empty-skills`
- **Where:** Work AI → Skills, "No skills of your own yet".

```text
Four simple tool shapes laid out in a neat row: a wrench, a ruler, a pencil and a small gear, the gear in cyan.
```

#### `empty-connections`
- **Where:** Work AI → Connections, "No apps yet".

```text
Two rounded app tiles side by side, joined by a short curved cable with a plug, the plug in cyan.
```

#### `empty-schedules`
- **Where:** Work AI → Schedules, "Nothing scheduled".

```text
A calendar page with an empty grid of small squares and a round clock overlapping its lower corner, the clock hands in cyan.
```

#### `empty-code`
- **Where:** Code page, "No workspaces yet".

```text
A small editor window with three dots in its top bar and a few short rounded bars inside like lines of code, a blinking cursor bar in cyan.
```

#### `empty-inbox`
- **Where:** Notifications with nothing new; Admin → Requests, "No pending requests"; Admin → Users,
  "No pending invitations".

```text
An empty inbox tray, open at the front, with a small cyan dot floating just above it.
```

#### `empty-models`
- **Where:** Admin → Models, "No providers yet" and "No models yet".

```text
Two flat server boxes stacked, each with a row of small round lights, one light in cyan, and an empty slot on top of the stack.
```

#### `empty-groups`
- **Where:** Admin → Groups when there are none.

```text
Three plain circles of different sizes overlapping slightly in a cluster, the smallest circle in cyan.
```

#### `health-ok`
- **Where:** Admin → Health, next to "Everything is working". Shown at 96×96.

```text
A rounded shield with a simple check mark in cyan.
```

#### `license-none`
- **Where:** Admin → License when there's no license key yet ("Enter a new license key").

```text
A simple key lying beside a closed padlock, the key in cyan.
```

### System pages

- **Generate:** 1536×1024 (3:2) · **Shown:** 560×373 · **Variants:** dark, light · **Accent:** cyan
- **Files:** `apps/web/public/images/system/<name>-{dark,light}.webp`

#### `not-found`
- **Kind:** object
- **Where:** The 404 page ("This page doesn't exist"), above the message and a button home.

```text
A signpost with two blank arrow signs pointing in different directions, a small cyan dot at the top of the post, standing on a short flat ground line.
```

#### `error`
- **Kind:** object
- **Where:** The error page ("Something went wrong"), above the message and "Try again".

```text
Three puzzle-like blocks: two fitted together and one lying just beside them, slightly turned, its edge in cyan.
```

#### `offline`
- **Kind:** object
- **Where:** The desktop app's "Can't reach your server" screen.

```text
A plug and a socket a short distance apart, not connected, with a small cyan spark-shaped gap between them.
```

---

## 5. How they're shown (the code)

- **Making them:** `scripts/generate-images.mjs generate` makes each image with FLUX.1-dev through
  NVIDIA's API (`NVIDIA_API_KEY`), or with `openai/gpt-image-2` through Pollinations
  (`POLLINATIONS_API_KEY`). FLUX can't take our image as input, so its light variant is made from the
  same words and seed; gpt-image-2 converts the dark image.
  `--candidates n` makes several dark versions to choose from (`design/generated/candidates/`),
  `pick id=seed` keeps one; the chosen seeds are in `design/image-picks.json`, so `generate` makes the
  same set again. The originals stay in `design/generated/` (not committed).
- **Exporting:** `scripts/generate-images.mjs export` makes the greys neutral, splits each picture into
  a grey base and an accent layer (the saturated parts), centres each empty-state object in its
  square, and writes WebP files at 1× and 2× of the size each image is shown at into
  `apps/web/public/images/`, the list the app reads (`apps/web/src/components/art/manifest.json`),
  the link-preview art and the desktop app's copies (both with the cyan accent).
- **Showing:** `<Art name="…">` (`apps/web/src/components/art/art.tsx`) shows the variant for the
  current theme, paints its accent layer in the organization's accent colour, is decorative
  (`alt=""`, hidden from screen readers), loads lazily with fixed sizes so nothing jumps, and can
  fade its edges into whatever is behind it. `<EmptyState art="…">`
  and `<ArtOr>` keep today's icon when there's no picture.
- **Turning them off:** Admin → Settings → Organization & branding → Illustrations. The public
  landing page always shows its pictures.
- **Link preview:** `apps/web/src/app/(marketing)/opengraph-image.tsx` draws the logo and headline
  over the generated art; it's in its own route group so customers' app pages never show it.

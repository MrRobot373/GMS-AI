# Image prompts, one by one

Every picture in Aatmiq, with the full prompt to paste into an image tool (ChatGPT, Midjourney, Firefly, FLUX…), the shape to ask for, and the file name to save it under. Generated from `design/image-prompts.md` by `node scripts/generate-images.mjs prompts`.

**How to use it**

1. Make the **dark** version first, from its prompt. Make 2–4 and keep the best: no text, nothing extra, the object in the middle.
2. Make the **light** version. Best: attach the dark image you kept and paste the *light from the dark one* prompt below, so both have the same composition. Otherwise paste the image's own light prompt.
3. Save the files with the names given (`.jpg` or `.png`) into `design/generated/`, or send them to me.
4. Run `node scripts/generate-images.mjs export` (or ask me): it makes the greys neutral, splits off the accent so the app can paint it in the organization's colour, centres the empty-state objects and writes the WebP files the app uses.

Don't worry about the exact greys: the export makes them consistent. What matters is the subject, flat shapes, one small cyan accent, a plain background and no text.

**Light from the dark one** (attach the dark image, then paste):

```text
Recreate this exact image as its light version: keep the same composition, framing, shapes, proportions and empty space; change only the colours as follows.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of soft light grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of soft off-white (#FBFBFB) that fills the whole frame. Keep the cyan accent on the same part.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

## Public website

### landing-hero

- **Where:** Landing page, behind the headline "Your own AI. Nowhere else.", full width; the product replica follows below it.
- **Shape:** 3:2 (landscape), e.g. 1536×1024
- **Save as:** `landing-hero-dark.jpg` and `landing-hero-light.jpg`

Dark:

```text
A wide, calm composition of a few large geometric shapes placed only around the edges of the frame: a big quarter circle in the top left corner, a tall rounded rectangle on the right side, a thin arc low on the left, and a small cyan dot near the top right. The whole centre of the frame is empty, for a headline.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of dark charcoal grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of dark charcoal (#0F0F0F) that fills the whole frame; the shapes stay calm and sparse so the picture can sit behind or beside text.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

Light:

```text
A wide, calm composition of a few large geometric shapes placed only around the edges of the frame: a big quarter circle in the top left corner, a tall rounded rectangle on the right side, a thin arc low on the left, and a small cyan dot near the top right. The whole centre of the frame is empty, for a headline.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of soft light grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of soft off-white (#FBFBFB) that fills the whole frame; the shapes stay calm and sparse so the picture can sit behind or beside text.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

### landing-chat

- **Where:** Landing page, top of the "Chat" card ("Ask, write, understand.").
- **Shape:** 3:2 (landscape), e.g. 1536×1024
- **Save as:** `landing-chat-dark.jpg` and `landing-chat-light.jpg`

Dark:

```text
Two rounded speech bubbles overlapping slightly, one larger and one smaller, with three small dots inside the smaller bubble in cyan, centered.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of dark charcoal grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of dark charcoal (#0F0F0F) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

Light:

```text
Two rounded speech bubbles overlapping slightly, one larger and one smaller, with three small dots inside the smaller bubble in cyan, centered.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of soft light grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of soft off-white (#FBFBFB) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

### landing-work

- **Where:** Landing page, top of the "Work AI" card ("Hand off a task. Get it done.").
- **Shape:** 3:2 (landscape), e.g. 1536×1024
- **Save as:** `landing-work-dark.jpg` and `landing-work-light.jpg`

Dark:

```text
A task card with three short horizontal bars like a checklist, the first two ticked with small round check marks, and a circular progress ring beside the card, three-quarters filled in cyan, centered.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of dark charcoal grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of dark charcoal (#0F0F0F) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

Light:

```text
A task card with three short horizontal bars like a checklist, the first two ticked with small round check marks, and a circular progress ring beside the card, three-quarters filled in cyan, centered.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of soft light grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of soft off-white (#FBFBFB) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

### landing-code

- **Where:** Landing page, top of the "Code" card ("A full IDE, with an agent inside.").
- **Shape:** 3:2 (landscape), e.g. 1536×1024
- **Save as:** `landing-code-dark.jpg` and `landing-code-light.jpg`

Dark:

```text
An editor window: a rounded rectangle with three small circles in its top bar and several short rounded bars of different lengths inside, indented like lines of code, one bar in cyan, centered.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of dark charcoal grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of dark charcoal (#0F0F0F) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

Light:

```text
An editor window: a rounded rectangle with three small circles in its top bar and several short rounded bars of different lengths inside, indented like lines of code, one bar in cyan, centered.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of soft light grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of soft off-white (#FBFBFB) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

### landing-steps

- **Where:** Landing page, "How it works", under the heading in the left column.
- **Shape:** 2:3 (portrait), e.g. 1024×1536
- **Save as:** `landing-steps-dark.jpg` and `landing-steps-light.jpg`

Dark:

```text
Three blocks stacked like rising steps from the bottom left to the upper right: a server box with two slots, a plug, and a small group of three circles; a cyan dot on the top block. Tall portrait composition, the steps in the lower two thirds, empty space above.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of dark charcoal grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of dark charcoal (#0F0F0F) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

Light:

```text
Three blocks stacked like rising steps from the bottom left to the upper right: a server box with two slots, a plug, and a small group of three circles; a cyan dot on the top block. Tall portrait composition, the steps in the lower two thirds, empty space above.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of soft light grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of soft off-white (#FBFBFB) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

### landing-cta

- **Where:** Landing page, background of the closing block "Give your team AI they can trust." (shown at low opacity behind centered text).
- **Shape:** 3:2 (landscape), e.g. 1536×1024
- **Save as:** `landing-cta-dark.jpg` and `landing-cta-light.jpg`

Dark:

```text
A few large, soft geometric shapes along the bottom edge and the two sides of the frame: half circles, a long rounded bar and one small cyan circle. The centre and the top are empty, for text.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of dark charcoal grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of dark charcoal (#0F0F0F) that fills the whole frame; the shapes stay calm and sparse so the picture can sit behind or beside text.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

Light:

```text
A few large, soft geometric shapes along the bottom edge and the two sides of the frame: half circles, a long rounded bar and one small cyan circle. The centre and the top are empty, for text.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of soft light grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of soft off-white (#FBFBFB) that fills the whole frame; the shapes stay calm and sparse so the picture can sit behind or beside text.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

### og-image

- **Where:** The preview when someone shares a link to the site. Code adds the logo and "Your own AI. Nowhere else." on the left half.
- **Shape:** 3:2 (landscape), e.g. 1536×1024
- **Save as:** `og-image-dark.jpg` (dark only)

Dark:

```text
On the right half of the frame only: a chat bubble, a document page and an editor window arranged around a central cyan circle, overlapping a little. The entire left half of the frame is empty, for a headline.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of dark charcoal grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of dark charcoal (#0F0F0F) that fills the whole frame; the shapes stay calm and sparse so the picture can sit behind or beside text.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

## Sign-in and account pages

### auth-panel

- **Where:** Right half of sign in, accept invitation, invalid invitation, forgot password, reset password and two-step setup on screens 1024 px and wider; a 160 px band above the card in the desktop app's connect screen.
- **Shape:** 2:3 (portrait), e.g. 1024×1536
- **Save as:** `auth-panel-dark.jpg` and `auth-panel-light.jpg`

Dark:

```text
A tall, calm composition: an open doorway with a pale shape of light falling through it onto the floor, a small cyan keyhole shape on the door, and two or three simple floating shapes around it (a circle, a small rounded square). Tall portrait composition, the doorway slightly below the centre.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of dark charcoal grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of dark charcoal (#0F0F0F) that fills the whole frame; the shapes stay calm and sparse so the picture can sit behind or beside text.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

Light:

```text
A tall, calm composition: an open doorway with a pale shape of light falling through it onto the floor, a small cyan keyhole shape on the door, and two or three simple floating shapes around it (a circle, a small rounded square). Tall portrait composition, the doorway slightly below the centre.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of soft light grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of soft off-white (#FBFBFB) that fills the whole frame; the shapes stay calm and sparse so the picture can sit behind or beside text.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

### auth-setup

- **Where:** Right half of the first-time setup page (the owner creates the organization).
- **Shape:** 2:3 (portrait), e.g. 1024×1536
- **Save as:** `auth-setup-dark.jpg` and `auth-setup-light.jpg`

Dark:

```text
A tall composition of simple building blocks being put together: a few rounded blocks stacked into a small structure, one block in cyan being placed on top, with a little empty space around it. Tall portrait composition, the blocks in the lower half.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of dark charcoal grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of dark charcoal (#0F0F0F) that fills the whole frame; the shapes stay calm and sparse so the picture can sit behind or beside text.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

Light:

```text
A tall composition of simple building blocks being put together: a few rounded blocks stacked into a small structure, one block in cyan being placed on top, with a little empty space around it. Tall portrait composition, the blocks in the lower half.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of soft light grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of soft off-white (#FBFBFB) that fills the whole frame; the shapes stay calm and sparse so the picture can sit behind or beside text.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

## Empty states in the app

### empty-documents

- **Where:** Documents page, in the drop area when the library is empty ("Drop files here or click to upload"); also the chat composer's library picker when empty.
- **Shape:** 1:1 (square), e.g. 1024×1024
- **Save as:** `empty-documents-dark.jpg` and `empty-documents-light.jpg`

Dark:

```text
A neat stack of three blank document pages, the top page with a folded corner in cyan.

Spot illustration: one centered object filling about half of the square frame, the same empty margin on every side.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of dark charcoal grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of dark charcoal (#0F0F0F) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

Light:

```text
A neat stack of three blank document pages, the top page with a folded corner in cyan.

Spot illustration: one centered object filling about half of the square frame, the same empty margin on every side.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of soft light grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of soft off-white (#FBFBFB) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

### empty-projects

- **Where:** Projects page when there are no projects, above "New project".
- **Shape:** 1:1 (square), e.g. 1024×1024
- **Save as:** `empty-projects-dark.jpg` and `empty-projects-light.jpg`

Dark:

```text
An open folder with three cards standing inside it, the front card with a small cyan tab.

Spot illustration: one centered object filling about half of the square frame, the same empty margin on every side.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of dark charcoal grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of dark charcoal (#0F0F0F) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

Light:

```text
An open folder with three cards standing inside it, the front card with a small cyan tab.

Spot illustration: one centered object filling about half of the square frame, the same empty margin on every side.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of soft light grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of soft off-white (#FBFBFB) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

### empty-project-chats

- **Where:** Inside a project with no chats yet, in the dashed "Chats" box ("Chats you start here stay in this project…"). Shown at 120×120.
- **Shape:** 1:1 (square), e.g. 1024×1024
- **Save as:** `empty-project-chats-dark.jpg` and `empty-project-chats-light.jpg`

Dark:

```text
A folder with two small rounded speech bubbles rising out of it, one bubble in cyan.

Spot illustration: one centered object filling about half of the square frame, the same empty margin on every side.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of dark charcoal grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of dark charcoal (#0F0F0F) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

Light:

```text
A folder with two small rounded speech bubbles rising out of it, one bubble in cyan.

Spot illustration: one centered object filling about half of the square frame, the same empty margin on every side.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of soft light grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of soft off-white (#FBFBFB) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

### empty-work

- **Where:** Work AI home when there are no tasks yet, in the dashed "Tasks" box ("Tasks you start appear here…"), under the composer and its example buttons.
- **Shape:** 1:1 (square), e.g. 1024×1024
- **Save as:** `empty-work-dark.jpg` and `empty-work-light.jpg`

Dark:

```text
A blank task card with three empty checkbox rows and a small cyan play-button circle at its corner.

Spot illustration: one centered object filling about half of the square frame, the same empty margin on every side.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of dark charcoal grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of dark charcoal (#0F0F0F) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

Light:

```text
A blank task card with three empty checkbox rows and a small cyan play-button circle at its corner.

Spot illustration: one centered object filling about half of the square frame, the same empty margin on every side.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of soft light grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of soft off-white (#FBFBFB) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

### empty-skills

- **Where:** Work AI → Skills, "No skills of your own yet".
- **Shape:** 1:1 (square), e.g. 1024×1024
- **Save as:** `empty-skills-dark.jpg` and `empty-skills-light.jpg`

Dark:

```text
Four simple tool shapes laid out in a neat row: a wrench, a ruler, a pencil and a small gear, the gear in cyan.

Spot illustration: one centered object filling about half of the square frame, the same empty margin on every side.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of dark charcoal grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of dark charcoal (#0F0F0F) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

Light:

```text
Four simple tool shapes laid out in a neat row: a wrench, a ruler, a pencil and a small gear, the gear in cyan.

Spot illustration: one centered object filling about half of the square frame, the same empty margin on every side.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of soft light grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of soft off-white (#FBFBFB) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

### empty-connections

- **Where:** Work AI → Connections, "No apps yet".
- **Shape:** 1:1 (square), e.g. 1024×1024
- **Save as:** `empty-connections-dark.jpg` and `empty-connections-light.jpg`

Dark:

```text
Two rounded app tiles side by side, joined by a short curved cable with a plug, the plug in cyan.

Spot illustration: one centered object filling about half of the square frame, the same empty margin on every side.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of dark charcoal grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of dark charcoal (#0F0F0F) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

Light:

```text
Two rounded app tiles side by side, joined by a short curved cable with a plug, the plug in cyan.

Spot illustration: one centered object filling about half of the square frame, the same empty margin on every side.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of soft light grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of soft off-white (#FBFBFB) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

### empty-schedules

- **Where:** Work AI → Schedules, "Nothing scheduled".
- **Shape:** 1:1 (square), e.g. 1024×1024
- **Save as:** `empty-schedules-dark.jpg` and `empty-schedules-light.jpg`

Dark:

```text
A calendar page with an empty grid of small squares and a round clock overlapping its lower corner, the clock hands in cyan.

Spot illustration: one centered object filling about half of the square frame, the same empty margin on every side.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of dark charcoal grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of dark charcoal (#0F0F0F) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

Light:

```text
A calendar page with an empty grid of small squares and a round clock overlapping its lower corner, the clock hands in cyan.

Spot illustration: one centered object filling about half of the square frame, the same empty margin on every side.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of soft light grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of soft off-white (#FBFBFB) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

### empty-code

- **Where:** Code page, "No workspaces yet".
- **Shape:** 1:1 (square), e.g. 1024×1024
- **Save as:** `empty-code-dark.jpg` and `empty-code-light.jpg`

Dark:

```text
A small editor window with three dots in its top bar and a few short rounded bars inside like lines of code, a blinking cursor bar in cyan.

Spot illustration: one centered object filling about half of the square frame, the same empty margin on every side.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of dark charcoal grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of dark charcoal (#0F0F0F) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

Light:

```text
A small editor window with three dots in its top bar and a few short rounded bars inside like lines of code, a blinking cursor bar in cyan.

Spot illustration: one centered object filling about half of the square frame, the same empty margin on every side.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of soft light grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of soft off-white (#FBFBFB) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

### empty-inbox

- **Where:** Notifications with nothing new; Admin → Requests, "No pending requests"; Admin → Users, "No pending invitations".
- **Shape:** 1:1 (square), e.g. 1024×1024
- **Save as:** `empty-inbox-dark.jpg` and `empty-inbox-light.jpg`

Dark:

```text
An empty inbox tray, open at the front, with a small cyan dot floating just above it.

Spot illustration: one centered object filling about half of the square frame, the same empty margin on every side.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of dark charcoal grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of dark charcoal (#0F0F0F) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

Light:

```text
An empty inbox tray, open at the front, with a small cyan dot floating just above it.

Spot illustration: one centered object filling about half of the square frame, the same empty margin on every side.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of soft light grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of soft off-white (#FBFBFB) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

### empty-models

- **Where:** Admin → Models, "No providers yet" and "No models yet".
- **Shape:** 1:1 (square), e.g. 1024×1024
- **Save as:** `empty-models-dark.jpg` and `empty-models-light.jpg`

Dark:

```text
Two flat server boxes stacked, each with a row of small round lights, one light in cyan, and an empty slot on top of the stack.

Spot illustration: one centered object filling about half of the square frame, the same empty margin on every side.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of dark charcoal grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of dark charcoal (#0F0F0F) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

Light:

```text
Two flat server boxes stacked, each with a row of small round lights, one light in cyan, and an empty slot on top of the stack.

Spot illustration: one centered object filling about half of the square frame, the same empty margin on every side.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of soft light grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of soft off-white (#FBFBFB) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

### empty-groups

- **Where:** Admin → Groups when there are none.
- **Shape:** 1:1 (square), e.g. 1024×1024
- **Save as:** `empty-groups-dark.jpg` and `empty-groups-light.jpg`

Dark:

```text
Three plain circles of different sizes overlapping slightly in a cluster, the smallest circle in cyan.

Spot illustration: one centered object filling about half of the square frame, the same empty margin on every side.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of dark charcoal grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of dark charcoal (#0F0F0F) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

Light:

```text
Three plain circles of different sizes overlapping slightly in a cluster, the smallest circle in cyan.

Spot illustration: one centered object filling about half of the square frame, the same empty margin on every side.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of soft light grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of soft off-white (#FBFBFB) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

### health-ok

- **Where:** Admin → Health, next to "Everything is working". Shown at 96×96.
- **Shape:** 1:1 (square), e.g. 1024×1024
- **Save as:** `health-ok-dark.jpg` and `health-ok-light.jpg`

Dark:

```text
A rounded shield with a simple check mark in cyan.

Spot illustration: one centered object filling about half of the square frame, the same empty margin on every side.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of dark charcoal grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of dark charcoal (#0F0F0F) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

Light:

```text
A rounded shield with a simple check mark in cyan.

Spot illustration: one centered object filling about half of the square frame, the same empty margin on every side.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of soft light grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of soft off-white (#FBFBFB) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

### license-none

- **Where:** Admin → License when there's no license key yet ("Enter a new license key").
- **Shape:** 1:1 (square), e.g. 1024×1024
- **Save as:** `license-none-dark.jpg` and `license-none-light.jpg`

Dark:

```text
A simple key lying beside a closed padlock, the key in cyan.

Spot illustration: one centered object filling about half of the square frame, the same empty margin on every side.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of dark charcoal grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of dark charcoal (#0F0F0F) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

Light:

```text
A simple key lying beside a closed padlock, the key in cyan.

Spot illustration: one centered object filling about half of the square frame, the same empty margin on every side.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of soft light grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of soft off-white (#FBFBFB) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

## System pages

### not-found

- **Where:** The 404 page ("This page doesn't exist"), above the message and a button home.
- **Shape:** 3:2 (landscape), e.g. 1536×1024
- **Save as:** `not-found-dark.jpg` and `not-found-light.jpg`

Dark:

```text
A signpost with two blank arrow signs pointing in different directions, a small cyan dot at the top of the post, standing on a short flat ground line.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of dark charcoal grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of dark charcoal (#0F0F0F) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

Light:

```text
A signpost with two blank arrow signs pointing in different directions, a small cyan dot at the top of the post, standing on a short flat ground line.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of soft light grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of soft off-white (#FBFBFB) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

### error

- **Where:** The error page ("Something went wrong"), above the message and "Try again".
- **Shape:** 3:2 (landscape), e.g. 1536×1024
- **Save as:** `error-dark.jpg` and `error-light.jpg`

Dark:

```text
Three puzzle-like blocks: two fitted together and one lying just beside them, slightly turned, its edge in cyan.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of dark charcoal grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of dark charcoal (#0F0F0F) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

Light:

```text
Three puzzle-like blocks: two fitted together and one lying just beside them, slightly turned, its edge in cyan.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of soft light grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of soft off-white (#FBFBFB) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

### offline

- **Where:** The desktop app's "Can't reach your server" screen.
- **Shape:** 3:2 (landscape), e.g. 1536×1024
- **Save as:** `offline-dark.jpg` and `offline-light.jpg`

Dark:

```text
A plug and a socket a short distance apart, not connected, with a small cyan spark-shaped gap between them.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of dark charcoal grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of dark charcoal (#0F0F0F) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

Light:

```text
A plug and a socket a short distance apart, not connected, with a small cyan spark-shaped gap between them.

Modern editorial vector illustration made of simple geometric shapes filled with three shades of soft light grey and one bright cyan highlight on one small part, clean crisp edges, flat colour with no gradients, no outlines and no 3D shading, at most one soft flat shadow shape, a very fine paper grain. Minimal, calm, premium, centered, plenty of empty space.

On a plain solid background of soft off-white (#FBFBFB) that fills the whole frame.

No words, letters, numbers or logos; no people, faces or hands; no photographs, 3D renders, gradients, glows, glass or neon; no clutter and no objects other than those described.
```

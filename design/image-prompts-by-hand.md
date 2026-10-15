# Image prompts, one by one

Every picture in Aatmiq, with the full prompt to paste into an image tool (ChatGPT, Midjourney, Firefly, FLUX…), the shape to ask for, and the file name to save it under. Generated from `design/image-prompts.md` by `node scripts/generate-images.mjs prompts`.

**How to use it**

1. Make the **dark** version first, from its prompt. Make 2–4 and keep the best: no text, nothing extra, the object in the middle.
2. Make the **light** version. Best: attach the dark image you kept and paste the *light from the dark one* prompt below, so both have the same composition. Otherwise paste the image's own light prompt.
3. Save the files with the names given (`.jpg` or `.png`) into `design/generated/`, or send them to me.
4. Run `node scripts/generate-images.mjs export` (or ask me): it gives every image the same grade (neutral grey, the glow in the brand cyan or white), centres the empty-state objects and writes the WebP files the app uses.

Don't worry about the exact colours: the export makes them consistent. What matters is the subject, the composition, a plain background and no text.

**Light from the dark one** (attach the dark image, then paste):

```text
Recreate this exact image as its light version: keep the same composition, camera angle, framing, objects, proportions and empty space; change only the material, the light and the colours as follows.

Minimal fine-art photograph, museum quality. Stone of pale limestone and soft travertine with a fine natural grain, no gloss. One soft diffused daylight from the upper left, gentle long soft shadows, airy high-key exposure. Near-monochrome, warm neutral off-white palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

The background stays plain and seamless, and every edge of the frame fades smoothly into solid soft off-white (#FBFBFB). The tones are neutral off-white, very slightly warm, never peach, beige or yellow.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

(If the picture has a glow, add: *Keep the glowing light in the same place.*)

## Public website

### landing-hero

- **Where:** Landing page, the top of the page, full width: the headline "Your own AI. Nowhere else." sits in its sky, the monolith stands below the buttons, and the product replica follows under it.
- **Shape:** 3:2 (landscape), e.g. 1536×1024
- **Save as:** `landing-hero-dark.jpg` and `landing-hero-light.jpg`

Dark:

```text
A vast, perfectly calm, empty plain at nightfall under a deep, dark charcoal sky, seen from a low eye level. Far away and small in the frame, exactly in the horizontal centre, a single tall, slender monolith of smooth stone stands alone, its base at about 80% of the frame's height, a small soft glow of light emanating from within its lower third. A faint, low mist lies on the ground around it. Above it the sky is enormous, empty and smooth, filling the top 70% of the frame, so a headline can sit there, and fading seamlessly into the plain background colour at the top and side edges. The ground fades the same way at the bottom edge. Wide, cinematic, serene, a lot of empty space.

The glowing light is a small, soft cyan (#22D3EE), the only colour in the image.

Minimal fine-art photograph, museum quality. Stone of matte dark basalt and graphite with a fine natural grain, no gloss. One soft diffused key light from the upper left, gentle long shadows, rich deep tones, low-key exposure. Near-monochrome, cool neutral grey palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

The whole scene stays within tones close to near-black charcoal (#0F0F0F), and every edge of the frame fades smoothly into solid near-black charcoal (#0F0F0F), so the image blends into a page of that colour.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

Light:

```text
A vast, perfectly calm, empty plain in soft, bright overcast daylight under a pale, empty sky, seen from a low eye level. Far away and small in the frame, exactly in the horizontal centre, a single tall, slender monolith of smooth stone stands alone, its base at about 80% of the frame's height, a small soft glow of light emanating from within its lower third. A faint, low mist lies on the ground around it. Above it the sky is enormous, empty and smooth, filling the top 70% of the frame, so a headline can sit there, and fading seamlessly into the plain background colour at the top and side edges. The ground fades the same way at the bottom edge. Wide, cinematic, serene, a lot of empty space.

The glowing light is a small, soft cyan (#22D3EE), the only colour in the image.

Minimal fine-art photograph, museum quality. Stone of pale limestone and soft travertine with a fine natural grain, no gloss. One soft diffused daylight from the upper left, gentle long soft shadows, airy high-key exposure. Near-monochrome, warm neutral off-white palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

The whole scene stays within tones close to soft off-white (#FBFBFB), and every edge of the frame fades smoothly into solid soft off-white (#FBFBFB), so the image blends into a page of that colour.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

### landing-chat

- **Where:** Landing page, top of the "Chat" card ("Ask, write, understand.").
- **Shape:** 3:2 (landscape), e.g. 1536×1024
- **Save as:** `landing-chat-dark.jpg` and `landing-chat-light.jpg`

Dark:

```text
Two smooth, rounded river stones of slightly different sizes resting on a low rectangular stone plinth, turned gently towards each other as if in quiet conversation. A thin, soft line of light glows in the narrow gap between them, as if passing from one to the other. Simple, balanced, intimate. Centered, viewed at eye level.

The glowing light is a small, soft cyan (#22D3EE), the only colour in the image.

Minimal fine-art photograph, museum quality. Stone of matte dark basalt and graphite with a fine natural grain, no gloss. One soft diffused key light from the upper left, gentle long shadows, rich deep tones, low-key exposure. Near-monochrome, cool neutral grey palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid near-black charcoal (#0F0F0F) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

Light:

```text
Two smooth, rounded river stones of slightly different sizes resting on a low rectangular stone plinth, turned gently towards each other as if in quiet conversation. A thin, soft line of light glows in the narrow gap between them, as if passing from one to the other. Simple, balanced, intimate. Centered, viewed at eye level.

The glowing light is a small, soft cyan (#22D3EE), the only colour in the image.

Minimal fine-art photograph, museum quality. Stone of pale limestone and soft travertine with a fine natural grain, no gloss. One soft diffused daylight from the upper left, gentle long soft shadows, airy high-key exposure. Near-monochrome, warm neutral off-white palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid soft off-white (#FBFBFB) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

### landing-work

- **Where:** Landing page, top of the "Work AI" card ("Hand off a task. Get it done.").
- **Shape:** 3:2 (landscape), e.g. 1536×1024
- **Save as:** `landing-work-dark.jpg` and `landing-work-light.jpg`

Dark:

```text
A cairn of four flat, smooth stones stacked in perfect balance, decreasing in size towards the top, with a fifth small stone floating just above the stack about to settle into place. The top stone has a small soft glow of light within it. Precise, calm, a sense of steady progress. Centered, viewed slightly from below.

The glowing light is a small, soft cyan (#22D3EE), the only colour in the image.

Minimal fine-art photograph, museum quality. Stone of matte dark basalt and graphite with a fine natural grain, no gloss. One soft diffused key light from the upper left, gentle long shadows, rich deep tones, low-key exposure. Near-monochrome, cool neutral grey palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid near-black charcoal (#0F0F0F) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

Light:

```text
A cairn of four flat, smooth stones stacked in perfect balance, decreasing in size towards the top, with a fifth small stone floating just above the stack about to settle into place. The top stone has a small soft glow of light within it. Precise, calm, a sense of steady progress. Centered, viewed slightly from below.

The glowing light is a small, soft cyan (#22D3EE), the only colour in the image.

Minimal fine-art photograph, museum quality. Stone of pale limestone and soft travertine with a fine natural grain, no gloss. One soft diffused daylight from the upper left, gentle long soft shadows, airy high-key exposure. Near-monochrome, warm neutral off-white palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid soft off-white (#FBFBFB) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

### landing-code

- **Where:** Landing page, top of the "Code" card ("A full IDE, with an agent inside.").
- **Shape:** 3:2 (landscape), e.g. 1536×1024
- **Save as:** `landing-code-dark.jpg` and `landing-code-light.jpg`

Dark:

```text
Two precisely machined stone blocks joined by a crisp interlocking dovetail joint, with razor-sharp edges and perfectly flat faces, sitting slightly apart as if just about to slide together. A small soft glow of light shines from inside the joint. Engineering precision, craftsmanship, exactness. Three-quarter view, centered.

The glowing light is a small, soft cyan (#22D3EE), the only colour in the image.

Minimal fine-art photograph, museum quality. Stone of matte dark basalt and graphite with a fine natural grain, no gloss. One soft diffused key light from the upper left, gentle long shadows, rich deep tones, low-key exposure. Near-monochrome, cool neutral grey palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid near-black charcoal (#0F0F0F) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

Light:

```text
Two precisely machined stone blocks joined by a crisp interlocking dovetail joint, with razor-sharp edges and perfectly flat faces, sitting slightly apart as if just about to slide together. A small soft glow of light shines from inside the joint. Engineering precision, craftsmanship, exactness. Three-quarter view, centered.

The glowing light is a small, soft cyan (#22D3EE), the only colour in the image.

Minimal fine-art photograph, museum quality. Stone of pale limestone and soft travertine with a fine natural grain, no gloss. One soft diffused daylight from the upper left, gentle long soft shadows, airy high-key exposure. Near-monochrome, warm neutral off-white palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid soft off-white (#FBFBFB) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

### landing-steps

- **Where:** Landing page, "How it works", under the heading in the left column.
- **Shape:** 2:3 (portrait), e.g. 1024×1536
- **Save as:** `landing-steps-dark.jpg` and `landing-steps-light.jpg`

Dark:

```text
Three wide, shallow stone steps rising gently from the bottom left towards the upper right, each a single smooth slab. On the top step rests one small rounded stone with a soft glow of light inside it. Long soft shadows fall across the steps. A feeling of an easy, short path. Tall portrait composition with the steps in the lower two thirds and calm empty space above.

The glowing light is a small, soft cyan (#22D3EE), the only colour in the image.

Minimal fine-art photograph, museum quality. Stone of matte dark basalt and graphite with a fine natural grain, no gloss. One soft diffused key light from the upper left, gentle long shadows, rich deep tones, low-key exposure. Near-monochrome, cool neutral grey palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid near-black charcoal (#0F0F0F) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

Light:

```text
Three wide, shallow stone steps rising gently from the bottom left towards the upper right, each a single smooth slab. On the top step rests one small rounded stone with a soft glow of light inside it. Long soft shadows fall across the steps. A feeling of an easy, short path. Tall portrait composition with the steps in the lower two thirds and calm empty space above.

The glowing light is a small, soft cyan (#22D3EE), the only colour in the image.

Minimal fine-art photograph, museum quality. Stone of pale limestone and soft travertine with a fine natural grain, no gloss. One soft diffused daylight from the upper left, gentle long soft shadows, airy high-key exposure. Near-monochrome, warm neutral off-white palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid soft off-white (#FBFBFB) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

### landing-cta

- **Where:** Landing page, background of the closing block "Give your team AI they can trust." (shown at low opacity behind centered text).
- **Shape:** 3:2 (landscape), e.g. 1536×1024
- **Save as:** `landing-cta-dark.jpg` and `landing-cta-light.jpg`

Dark:

```text
A close, low view of the base of a monumental smooth stone monolith rising out of frame, its surface softly lit from one side, with a small soft glow of light emanating from deep within the stone near the bottom centre. The centre and top of the frame are quiet and dark-toned so text can sit there, and the image fades smoothly into the plain background at every edge. Monumental, calm, trustworthy.

The glowing light is a small, soft cyan (#22D3EE), the only colour in the image.

Minimal fine-art photograph, museum quality. Stone of matte dark basalt and graphite with a fine natural grain, no gloss. One soft diffused key light from the upper left, gentle long shadows, rich deep tones, low-key exposure. Near-monochrome, cool neutral grey palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

The whole scene stays within tones close to near-black charcoal (#0F0F0F), and every edge of the frame fades smoothly into solid near-black charcoal (#0F0F0F), so the image blends into a page of that colour.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

Light:

```text
A close, low view of the base of a monumental smooth stone monolith rising out of frame, its surface softly lit from one side, with a small soft glow of light emanating from deep within the stone near the bottom centre. The centre and top of the frame are quiet and dark-toned so text can sit there, and the image fades smoothly into the plain background at every edge. Monumental, calm, trustworthy.

The glowing light is a small, soft cyan (#22D3EE), the only colour in the image.

Minimal fine-art photograph, museum quality. Stone of pale limestone and soft travertine with a fine natural grain, no gloss. One soft diffused daylight from the upper left, gentle long soft shadows, airy high-key exposure. Near-monochrome, warm neutral off-white palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

The whole scene stays within tones close to soft off-white (#FBFBFB), and every edge of the frame fades smoothly into solid soft off-white (#FBFBFB), so the image blends into a page of that colour.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

### og-image

- **Where:** The preview when someone shares a link to the site. Code adds the logo and "Your own AI. Nowhere else." on the left half.
- **Shape:** 3:2 (landscape), e.g. 1536×1024
- **Save as:** `og-image-dark.jpg` (dark only)

Dark:

```text
A single tall, slender monolith of smooth stone standing in the right third of the frame on a perfectly plain seamless ground, a small soft glow of light emanating from within its lower third, with a long soft shadow falling to the left. The entire left half of the frame is empty plain background for a headline. Minimal, iconic, poster-like.

The glowing light is a small, soft cyan (#22D3EE), the only colour in the image.

Minimal fine-art photograph, museum quality. Stone of matte dark basalt and graphite with a fine natural grain, no gloss. One soft diffused key light from the upper left, gentle long shadows, rich deep tones, low-key exposure. Near-monochrome, cool neutral grey palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

The whole scene stays within tones close to near-black charcoal (#0F0F0F), and every edge of the frame fades smoothly into solid near-black charcoal (#0F0F0F), so the image blends into a page of that colour.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

## Sign-in and account pages

### auth-panel

- **Where:** Right half of sign in, accept invitation, invalid invitation, forgot password, reset password and two-step setup on screens 1024 px and wider; a 160 px band above the card in the desktop app's connect screen. The form keeps the left half; the customer's logo stays on it.
- **Shape:** 2:3 (portrait), e.g. 1024×1536
- **Save as:** `auth-panel-dark.jpg` and `auth-panel-light.jpg`

Dark:

```text
A quiet, enclosed stone courtyard seen from inside: smooth plain stone walls, and in the middle a single tall standing stone, slender and smooth, with a small soft glow of light emanating from within it. Soft daylight falls from an opening above, drawing a gentle pool of light on the floor around the stone. Private, protected, peaceful. Tall portrait composition, the stone slightly below centre, lots of calm wall and space around it.

The glowing light is a soft warm white (#F3EFE6); there is no other colour in the image.

Minimal fine-art photograph, museum quality. Stone of matte dark basalt and graphite with a fine natural grain, no gloss. One soft diffused key light from the upper left, gentle long shadows, rich deep tones, low-key exposure. Near-monochrome, cool neutral grey palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

The whole scene stays within tones close to near-black charcoal (#0F0F0F), and every edge of the frame fades smoothly into solid near-black charcoal (#0F0F0F), so the image blends into a page of that colour.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

Light:

```text
A quiet, enclosed stone courtyard seen from inside: smooth plain stone walls, and in the middle a single tall standing stone, slender and smooth, with a small soft glow of light emanating from within it. Soft daylight falls from an opening above, drawing a gentle pool of light on the floor around the stone. Private, protected, peaceful. Tall portrait composition, the stone slightly below centre, lots of calm wall and space around it.

The glowing light is a soft warm white (#F3EFE6); there is no other colour in the image.

Minimal fine-art photograph, museum quality. Stone of pale limestone and soft travertine with a fine natural grain, no gloss. One soft diffused daylight from the upper left, gentle long soft shadows, airy high-key exposure. Near-monochrome, warm neutral off-white palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

The whole scene stays within tones close to soft off-white (#FBFBFB), and every edge of the frame fades smoothly into solid soft off-white (#FBFBFB), so the image blends into a page of that colour.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

### auth-setup

- **Where:** Right half of the first-time setup page (the owner creates the organization).
- **Shape:** 2:3 (portrait), e.g. 1024×1536
- **Save as:** `auth-setup-dark.jpg` and `auth-setup-light.jpg`

Dark:

```text
A tall, simple stone archway standing on its own, viewed straight on, with soft warm-white light pouring through the opening and spilling a long pool of light across the smooth stone floor towards the viewer. Nothing visible beyond the arch except soft light. A threshold, a beginning, an invitation to step in. Tall portrait composition, the arch centered in the lower two thirds.

The glowing light is a soft warm white (#F3EFE6); there is no other colour in the image.

Minimal fine-art photograph, museum quality. Stone of matte dark basalt and graphite with a fine natural grain, no gloss. One soft diffused key light from the upper left, gentle long shadows, rich deep tones, low-key exposure. Near-monochrome, cool neutral grey palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

The whole scene stays within tones close to near-black charcoal (#0F0F0F), and every edge of the frame fades smoothly into solid near-black charcoal (#0F0F0F), so the image blends into a page of that colour.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

Light:

```text
A tall, simple stone archway standing on its own, viewed straight on, with soft warm-white light pouring through the opening and spilling a long pool of light across the smooth stone floor towards the viewer. Nothing visible beyond the arch except soft light. A threshold, a beginning, an invitation to step in. Tall portrait composition, the arch centered in the lower two thirds.

The glowing light is a soft warm white (#F3EFE6); there is no other colour in the image.

Minimal fine-art photograph, museum quality. Stone of pale limestone and soft travertine with a fine natural grain, no gloss. One soft diffused daylight from the upper left, gentle long soft shadows, airy high-key exposure. Near-monochrome, warm neutral off-white palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

The whole scene stays within tones close to soft off-white (#FBFBFB), and every edge of the frame fades smoothly into solid soft off-white (#FBFBFB), so the image blends into a page of that colour.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

## Empty states in the app

### empty-documents

- **Where:** Documents page, in the drop area when the library is empty ("Drop files here or click to upload"); also the chat composer's library picker when empty.
- **Shape:** 1:1 (square), e.g. 1024×1024
- **Save as:** `empty-documents-dark.jpg` and `empty-documents-light.jpg`

Dark:

```text
A neat stack of five thin, smooth slate tablets, slightly fanned so each edge is visible, the top tablet blank and perfectly smooth, waiting to be written on.

Isolated spot illustration: a single centered composition filling about half of the square frame, generous empty margin on every side, no floor line, no environment, only a soft contact shadow beneath the objects.

Minimal fine-art photograph, museum quality. Stone of matte dark basalt and graphite with a fine natural grain, no gloss. One soft diffused key light from the upper left, gentle long shadows, rich deep tones, low-key exposure. Near-monochrome, cool neutral grey palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid near-black charcoal (#0F0F0F) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

Light:

```text
A neat stack of five thin, smooth slate tablets, slightly fanned so each edge is visible, the top tablet blank and perfectly smooth, waiting to be written on.

Isolated spot illustration: a single centered composition filling about half of the square frame, generous empty margin on every side, no floor line, no environment, only a soft contact shadow beneath the objects.

Minimal fine-art photograph, museum quality. Stone of pale limestone and soft travertine with a fine natural grain, no gloss. One soft diffused daylight from the upper left, gentle long soft shadows, airy high-key exposure. Near-monochrome, warm neutral off-white palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid soft off-white (#FBFBFB) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

### empty-projects

- **Where:** Projects page when there are no projects, above "New project".
- **Shape:** 1:1 (square), e.g. 1024×1024
- **Save as:** `empty-projects-dark.jpg` and `empty-projects-light.jpg`

Dark:

```text
A shallow, rectangular stone tray holding three smooth pebbles of different sizes arranged neatly together, kept in one place.

Isolated spot illustration: a single centered composition filling about half of the square frame, generous empty margin on every side, no floor line, no environment, only a soft contact shadow beneath the objects.

Minimal fine-art photograph, museum quality. Stone of matte dark basalt and graphite with a fine natural grain, no gloss. One soft diffused key light from the upper left, gentle long shadows, rich deep tones, low-key exposure. Near-monochrome, cool neutral grey palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid near-black charcoal (#0F0F0F) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

Light:

```text
A shallow, rectangular stone tray holding three smooth pebbles of different sizes arranged neatly together, kept in one place.

Isolated spot illustration: a single centered composition filling about half of the square frame, generous empty margin on every side, no floor line, no environment, only a soft contact shadow beneath the objects.

Minimal fine-art photograph, museum quality. Stone of pale limestone and soft travertine with a fine natural grain, no gloss. One soft diffused daylight from the upper left, gentle long soft shadows, airy high-key exposure. Near-monochrome, warm neutral off-white palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid soft off-white (#FBFBFB) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

### empty-project-chats

- **Where:** Inside a project with no chats yet, in the dashed "Chats" box ("Chats you start here stay in this project…"). Shown at 120×120.
- **Shape:** 1:1 (square), e.g. 1024×1024
- **Save as:** `empty-project-chats-dark.jpg` and `empty-project-chats-light.jpg`

Dark:

```text
Two smooth rounded pebbles resting side by side inside a shallow round stone dish, touching lightly.

Isolated spot illustration: a single centered composition filling about half of the square frame, generous empty margin on every side, no floor line, no environment, only a soft contact shadow beneath the objects.

Minimal fine-art photograph, museum quality. Stone of matte dark basalt and graphite with a fine natural grain, no gloss. One soft diffused key light from the upper left, gentle long shadows, rich deep tones, low-key exposure. Near-monochrome, cool neutral grey palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid near-black charcoal (#0F0F0F) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

Light:

```text
Two smooth rounded pebbles resting side by side inside a shallow round stone dish, touching lightly.

Isolated spot illustration: a single centered composition filling about half of the square frame, generous empty margin on every side, no floor line, no environment, only a soft contact shadow beneath the objects.

Minimal fine-art photograph, museum quality. Stone of pale limestone and soft travertine with a fine natural grain, no gloss. One soft diffused daylight from the upper left, gentle long soft shadows, airy high-key exposure. Near-monochrome, warm neutral off-white palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid soft off-white (#FBFBFB) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

### empty-work

- **Where:** Work AI home when there are no tasks yet, in the dashed "Tasks" box ("Tasks you start appear here…"), under the composer and its example buttons.
- **Shape:** 1:1 (square), e.g. 1024×1024
- **Save as:** `empty-work-dark.jpg` and `empty-work-light.jpg`

Dark:

```text
A smooth stone sphere resting at the start of a gentle, curving groove carved into a flat stone slab; the groove sweeps away in a graceful arc, showing the path the sphere will take. A small soft glow of light inside the sphere.

Isolated spot illustration: a single centered composition filling about half of the square frame, generous empty margin on every side, no floor line, no environment, only a soft contact shadow beneath the objects.

The glowing light is a soft warm white (#F3EFE6); there is no other colour in the image.

Minimal fine-art photograph, museum quality. Stone of matte dark basalt and graphite with a fine natural grain, no gloss. One soft diffused key light from the upper left, gentle long shadows, rich deep tones, low-key exposure. Near-monochrome, cool neutral grey palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid near-black charcoal (#0F0F0F) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

Light:

```text
A smooth stone sphere resting at the start of a gentle, curving groove carved into a flat stone slab; the groove sweeps away in a graceful arc, showing the path the sphere will take. A small soft glow of light inside the sphere.

Isolated spot illustration: a single centered composition filling about half of the square frame, generous empty margin on every side, no floor line, no environment, only a soft contact shadow beneath the objects.

The glowing light is a soft warm white (#F3EFE6); there is no other colour in the image.

Minimal fine-art photograph, museum quality. Stone of pale limestone and soft travertine with a fine natural grain, no gloss. One soft diffused daylight from the upper left, gentle long soft shadows, airy high-key exposure. Near-monochrome, warm neutral off-white palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid soft off-white (#FBFBFB) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

### empty-skills

- **Where:** Work AI → Skills, "No skills of your own yet".
- **Shape:** 1:1 (square), e.g. 1024×1024
- **Save as:** `empty-skills-dark.jpg` and `empty-skills-light.jpg`

Dark:

```text
A tidy row of four small carved stone tools of different simple shapes, a cube, a cylinder, a wedge and a small sphere, laid out evenly as a set.

Isolated spot illustration: a single centered composition filling about half of the square frame, generous empty margin on every side, no floor line, no environment, only a soft contact shadow beneath the objects.

Minimal fine-art photograph, museum quality. Stone of matte dark basalt and graphite with a fine natural grain, no gloss. One soft diffused key light from the upper left, gentle long shadows, rich deep tones, low-key exposure. Near-monochrome, cool neutral grey palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid near-black charcoal (#0F0F0F) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

Light:

```text
A tidy row of four small carved stone tools of different simple shapes, a cube, a cylinder, a wedge and a small sphere, laid out evenly as a set.

Isolated spot illustration: a single centered composition filling about half of the square frame, generous empty margin on every side, no floor line, no environment, only a soft contact shadow beneath the objects.

Minimal fine-art photograph, museum quality. Stone of pale limestone and soft travertine with a fine natural grain, no gloss. One soft diffused daylight from the upper left, gentle long soft shadows, airy high-key exposure. Near-monochrome, warm neutral off-white palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid soft off-white (#FBFBFB) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

### empty-connections

- **Where:** Work AI → Connections, "No apps yet".
- **Shape:** 1:1 (square), e.g. 1024×1024
- **Save as:** `empty-connections-dark.jpg` and `empty-connections-light.jpg`

Dark:

```text
Two smooth standing stones a short distance apart, joined at the top by a thin, elegant stone bridge forming a small arch between them.

Isolated spot illustration: a single centered composition filling about half of the square frame, generous empty margin on every side, no floor line, no environment, only a soft contact shadow beneath the objects.

Minimal fine-art photograph, museum quality. Stone of matte dark basalt and graphite with a fine natural grain, no gloss. One soft diffused key light from the upper left, gentle long shadows, rich deep tones, low-key exposure. Near-monochrome, cool neutral grey palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid near-black charcoal (#0F0F0F) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

Light:

```text
Two smooth standing stones a short distance apart, joined at the top by a thin, elegant stone bridge forming a small arch between them.

Isolated spot illustration: a single centered composition filling about half of the square frame, generous empty margin on every side, no floor line, no environment, only a soft contact shadow beneath the objects.

Minimal fine-art photograph, museum quality. Stone of pale limestone and soft travertine with a fine natural grain, no gloss. One soft diffused daylight from the upper left, gentle long soft shadows, airy high-key exposure. Near-monochrome, warm neutral off-white palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid soft off-white (#FBFBFB) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

### empty-schedules

- **Where:** Work AI → Schedules, "Nothing scheduled".
- **Shape:** 1:1 (square), e.g. 1024×1024
- **Save as:** `empty-schedules-dark.jpg` and `empty-schedules-light.jpg`

Dark:

```text
A minimal round stone sundial: a flat smooth disc with a single thin triangular stone gnomon, casting one crisp, clean shadow across its face. No markings on the dial.

Isolated spot illustration: a single centered composition filling about half of the square frame, generous empty margin on every side, no floor line, no environment, only a soft contact shadow beneath the objects.

Minimal fine-art photograph, museum quality. Stone of matte dark basalt and graphite with a fine natural grain, no gloss. One soft diffused key light from the upper left, gentle long shadows, rich deep tones, low-key exposure. Near-monochrome, cool neutral grey palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid near-black charcoal (#0F0F0F) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

Light:

```text
A minimal round stone sundial: a flat smooth disc with a single thin triangular stone gnomon, casting one crisp, clean shadow across its face. No markings on the dial.

Isolated spot illustration: a single centered composition filling about half of the square frame, generous empty margin on every side, no floor line, no environment, only a soft contact shadow beneath the objects.

Minimal fine-art photograph, museum quality. Stone of pale limestone and soft travertine with a fine natural grain, no gloss. One soft diffused daylight from the upper left, gentle long soft shadows, airy high-key exposure. Near-monochrome, warm neutral off-white palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid soft off-white (#FBFBFB) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

### empty-code

- **Where:** Code page, "No workspaces yet".
- **Shape:** 1:1 (square), e.g. 1024×1024
- **Save as:** `empty-code-dark.jpg` and `empty-code-light.jpg`

Dark:

```text
A small stepped stone structure made of precisely cut rectangular blocks rising in three exact tiers, with crisp edges and perfectly flat faces, like a tiny ziggurat.

Isolated spot illustration: a single centered composition filling about half of the square frame, generous empty margin on every side, no floor line, no environment, only a soft contact shadow beneath the objects.

Minimal fine-art photograph, museum quality. Stone of matte dark basalt and graphite with a fine natural grain, no gloss. One soft diffused key light from the upper left, gentle long shadows, rich deep tones, low-key exposure. Near-monochrome, cool neutral grey palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid near-black charcoal (#0F0F0F) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

Light:

```text
A small stepped stone structure made of precisely cut rectangular blocks rising in three exact tiers, with crisp edges and perfectly flat faces, like a tiny ziggurat.

Isolated spot illustration: a single centered composition filling about half of the square frame, generous empty margin on every side, no floor line, no environment, only a soft contact shadow beneath the objects.

Minimal fine-art photograph, museum quality. Stone of pale limestone and soft travertine with a fine natural grain, no gloss. One soft diffused daylight from the upper left, gentle long soft shadows, airy high-key exposure. Near-monochrome, warm neutral off-white palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid soft off-white (#FBFBFB) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

### empty-inbox

- **Where:** Notifications with nothing new; Admin → Requests, "No pending requests"; Admin → Users, "No pending invitations".
- **Shape:** 1:1 (square), e.g. 1024×1024
- **Save as:** `empty-inbox-dark.jpg` and `empty-inbox-light.jpg`

Dark:

```text
A single empty, shallow, round stone bowl with smooth thin walls, perfectly clean inside.

Isolated spot illustration: a single centered composition filling about half of the square frame, generous empty margin on every side, no floor line, no environment, only a soft contact shadow beneath the objects.

Minimal fine-art photograph, museum quality. Stone of matte dark basalt and graphite with a fine natural grain, no gloss. One soft diffused key light from the upper left, gentle long shadows, rich deep tones, low-key exposure. Near-monochrome, cool neutral grey palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid near-black charcoal (#0F0F0F) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

Light:

```text
A single empty, shallow, round stone bowl with smooth thin walls, perfectly clean inside.

Isolated spot illustration: a single centered composition filling about half of the square frame, generous empty margin on every side, no floor line, no environment, only a soft contact shadow beneath the objects.

Minimal fine-art photograph, museum quality. Stone of pale limestone and soft travertine with a fine natural grain, no gloss. One soft diffused daylight from the upper left, gentle long soft shadows, airy high-key exposure. Near-monochrome, warm neutral off-white palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid soft off-white (#FBFBFB) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

### empty-models

- **Where:** Admin → Models, "No providers yet" and "No models yet".
- **Shape:** 1:1 (square), e.g. 1024×1024
- **Save as:** `empty-models-dark.jpg` and `empty-models-light.jpg`

Dark:

```text
A single empty square stone pedestal with clean edges, its flat top bare and softly lit from above, waiting for something to be placed on it.

Isolated spot illustration: a single centered composition filling about half of the square frame, generous empty margin on every side, no floor line, no environment, only a soft contact shadow beneath the objects.

Minimal fine-art photograph, museum quality. Stone of matte dark basalt and graphite with a fine natural grain, no gloss. One soft diffused key light from the upper left, gentle long shadows, rich deep tones, low-key exposure. Near-monochrome, cool neutral grey palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid near-black charcoal (#0F0F0F) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

Light:

```text
A single empty square stone pedestal with clean edges, its flat top bare and softly lit from above, waiting for something to be placed on it.

Isolated spot illustration: a single centered composition filling about half of the square frame, generous empty margin on every side, no floor line, no environment, only a soft contact shadow beneath the objects.

Minimal fine-art photograph, museum quality. Stone of pale limestone and soft travertine with a fine natural grain, no gloss. One soft diffused daylight from the upper left, gentle long soft shadows, airy high-key exposure. Near-monochrome, warm neutral off-white palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid soft off-white (#FBFBFB) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

### empty-groups

- **Where:** Admin → Groups when there are none.
- **Shape:** 1:1 (square), e.g. 1024×1024
- **Save as:** `empty-groups-dark.jpg` and `empty-groups-light.jpg`

Dark:

```text
Five smooth stones of different sizes set close together in a neat circle on a shallow round stone plate.

Isolated spot illustration: a single centered composition filling about half of the square frame, generous empty margin on every side, no floor line, no environment, only a soft contact shadow beneath the objects.

Minimal fine-art photograph, museum quality. Stone of matte dark basalt and graphite with a fine natural grain, no gloss. One soft diffused key light from the upper left, gentle long shadows, rich deep tones, low-key exposure. Near-monochrome, cool neutral grey palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid near-black charcoal (#0F0F0F) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

Light:

```text
Five smooth stones of different sizes set close together in a neat circle on a shallow round stone plate.

Isolated spot illustration: a single centered composition filling about half of the square frame, generous empty margin on every side, no floor line, no environment, only a soft contact shadow beneath the objects.

Minimal fine-art photograph, museum quality. Stone of pale limestone and soft travertine with a fine natural grain, no gloss. One soft diffused daylight from the upper left, gentle long soft shadows, airy high-key exposure. Near-monochrome, warm neutral off-white palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid soft off-white (#FBFBFB) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

### health-ok

- **Where:** Admin → Health, next to "Everything is working". Shown at 96×96.
- **Shape:** 1:1 (square), e.g. 1024×1024
- **Save as:** `health-ok-dark.jpg` and `health-ok-light.jpg`

Dark:

```text
A small cairn of three smooth stones balanced perfectly on top of each other, still and steady, with a small soft glow of light inside the top stone.

Isolated spot illustration: a single centered composition filling about half of the square frame, generous empty margin on every side, no floor line, no environment, only a soft contact shadow beneath the objects.

The glowing light is a soft warm white (#F3EFE6); there is no other colour in the image.

Minimal fine-art photograph, museum quality. Stone of matte dark basalt and graphite with a fine natural grain, no gloss. One soft diffused key light from the upper left, gentle long shadows, rich deep tones, low-key exposure. Near-monochrome, cool neutral grey palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid near-black charcoal (#0F0F0F) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

Light:

```text
A small cairn of three smooth stones balanced perfectly on top of each other, still and steady, with a small soft glow of light inside the top stone.

Isolated spot illustration: a single centered composition filling about half of the square frame, generous empty margin on every side, no floor line, no environment, only a soft contact shadow beneath the objects.

The glowing light is a soft warm white (#F3EFE6); there is no other colour in the image.

Minimal fine-art photograph, museum quality. Stone of pale limestone and soft travertine with a fine natural grain, no gloss. One soft diffused daylight from the upper left, gentle long soft shadows, airy high-key exposure. Near-monochrome, warm neutral off-white palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid soft off-white (#FBFBFB) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

### license-none

- **Where:** Admin → License when there's no license key yet ("Enter a new license key").
- **Shape:** 1:1 (square), e.g. 1024×1024
- **Save as:** `license-none-dark.jpg` and `license-none-light.jpg`

Dark:

```text
A smooth rectangular stone block with a single simple keyhole-shaped opening carved cleanly through its face, a small soft glow of light visible through the keyhole from inside.

Isolated spot illustration: a single centered composition filling about half of the square frame, generous empty margin on every side, no floor line, no environment, only a soft contact shadow beneath the objects.

The glowing light is a soft warm white (#F3EFE6); there is no other colour in the image.

Minimal fine-art photograph, museum quality. Stone of matte dark basalt and graphite with a fine natural grain, no gloss. One soft diffused key light from the upper left, gentle long shadows, rich deep tones, low-key exposure. Near-monochrome, cool neutral grey palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid near-black charcoal (#0F0F0F) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

Light:

```text
A smooth rectangular stone block with a single simple keyhole-shaped opening carved cleanly through its face, a small soft glow of light visible through the keyhole from inside.

Isolated spot illustration: a single centered composition filling about half of the square frame, generous empty margin on every side, no floor line, no environment, only a soft contact shadow beneath the objects.

The glowing light is a soft warm white (#F3EFE6); there is no other colour in the image.

Minimal fine-art photograph, museum quality. Stone of pale limestone and soft travertine with a fine natural grain, no gloss. One soft diffused daylight from the upper left, gentle long soft shadows, airy high-key exposure. Near-monochrome, warm neutral off-white palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid soft off-white (#FBFBFB) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

## System pages

### not-found

- **Where:** The 404 page ("This page doesn't exist"), above the message and a button home.
- **Shape:** 3:2 (landscape), e.g. 1536×1024
- **Save as:** `not-found-dark.jpg` and `not-found-light.jpg`

Dark:

```text
A lone, simple stone archway standing in an empty, plain space with soft mist around its base; through the opening there is only more empty space, a doorway that leads nowhere. Quiet, slightly wistful, gentle. Centered, viewed straight on, small in the frame.

Minimal fine-art photograph, museum quality. Stone of matte dark basalt and graphite with a fine natural grain, no gloss. One soft diffused key light from the upper left, gentle long shadows, rich deep tones, low-key exposure. Near-monochrome, cool neutral grey palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid near-black charcoal (#0F0F0F) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

Light:

```text
A lone, simple stone archway standing in an empty, plain space with soft mist around its base; through the opening there is only more empty space, a doorway that leads nowhere. Quiet, slightly wistful, gentle. Centered, viewed straight on, small in the frame.

Minimal fine-art photograph, museum quality. Stone of pale limestone and soft travertine with a fine natural grain, no gloss. One soft diffused daylight from the upper left, gentle long soft shadows, airy high-key exposure. Near-monochrome, warm neutral off-white palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid soft off-white (#FBFBFB) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

### error

- **Where:** The error page ("Something went wrong"), above the message and "Try again".
- **Shape:** 3:2 (landscape), e.g. 1536×1024
- **Save as:** `error-dark.jpg` and `error-light.jpg`

Dark:

```text
A small cairn of smooth stones that has gently toppled: three stones resting calmly on the ground beside a low base stone, nothing broken, ready to be stacked again. Calm, not dramatic. Centered, viewed at eye level.

Minimal fine-art photograph, museum quality. Stone of matte dark basalt and graphite with a fine natural grain, no gloss. One soft diffused key light from the upper left, gentle long shadows, rich deep tones, low-key exposure. Near-monochrome, cool neutral grey palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid near-black charcoal (#0F0F0F) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

Light:

```text
A small cairn of smooth stones that has gently toppled: three stones resting calmly on the ground beside a low base stone, nothing broken, ready to be stacked again. Calm, not dramatic. Centered, viewed at eye level.

Minimal fine-art photograph, museum quality. Stone of pale limestone and soft travertine with a fine natural grain, no gloss. One soft diffused daylight from the upper left, gentle long soft shadows, airy high-key exposure. Near-monochrome, warm neutral off-white palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid soft off-white (#FBFBFB) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

### offline

- **Where:** The desktop app's "Can't reach your server" screen.
- **Shape:** 3:2 (landscape), e.g. 1536×1024
- **Save as:** `offline-dark.jpg` and `offline-light.jpg`

Dark:

```text
A tall smooth monolith standing in thick soft fog, its outline faint and partly hidden, the small inner light inside it dimmed to a faint glow. Hushed, patient, waiting. Centered.

The glowing light is a soft warm white (#F3EFE6); there is no other colour in the image.

Minimal fine-art photograph, museum quality. Stone of matte dark basalt and graphite with a fine natural grain, no gloss. One soft diffused key light from the upper left, gentle long shadows, rich deep tones, low-key exposure. Near-monochrome, cool neutral grey palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid near-black charcoal (#0F0F0F) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

Light:

```text
A tall smooth monolith standing in thick soft fog, its outline faint and partly hidden, the small inner light inside it dimmed to a faint glow. Hushed, patient, waiting. Centered.

The glowing light is a soft warm white (#F3EFE6); there is no other colour in the image.

Minimal fine-art photograph, museum quality. Stone of pale limestone and soft travertine with a fine natural grain, no gloss. One soft diffused daylight from the upper left, gentle long soft shadows, airy high-key exposure. Near-monochrome, warm neutral off-white palette. Generous negative space; the subject never touches the edges. Calm, quiet, premium, timeless. Photorealistic, high detail, sharp focus on the subject.

Studio still life on a seamless plain background of solid soft off-white (#FBFBFB) that fills the whole frame, with no horizon line, no floor edge, no vignette and no texture.

Avoid: any text, letters, numbers or symbols; logos; watermarks; signatures; people, hands or faces; computer screens or user interfaces; robots; brains; circuit boards; network lines or nodes; holograms; neon; lens flare; rainbow or purple gradients; glossy plastic; cartoon or clip-art style; busy patterns; clutter; extra objects not described.
```

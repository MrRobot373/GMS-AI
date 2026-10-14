# Interface languages

Aatmiq's interface is in **English** and **Hindi (हिन्दी)**. Each person picks theirs in
**Settings → Appearance → Language**; people who haven't picked get the organization's default,
which admins set in **Admin → Settings → Language**. Chat answers come in the language people
write in, whichever the interface is.

## What's translated

Everything people use day to day: signing in (passwords, two-step sign-in, invitations, resets),
the sidebar and search, chat (the composer, model picker, answers' tools, sources, token notices),
documents, projects (sources, sharing, instructions), settings (profile, security, usage, your
data), Work AI (tasks, steps, approvals, files, schedules, skills, connections) and the Code home
page. Dates and counts follow the language too ("5 मिनट पहले", "1 नव॰", "3 दस्तावेज़").

Still in English:

- **The admin console**: it's for the IT team, and keeping it in one language keeps support simple.
- **Messages from the server**: errors from the API, emails, notifications, and Auto's reason for
  its choice. (Most errors people meet in the interface have their own Hindi text.)
- **The Code editor** (VS Code's own interface; its official language packs don't include Hindi).
- Names: Aatmiq, Work AI and Aatmiq Code stay as they are.

## How it works

- `apps/web/src/i18n/`: `t("New chat")` looks the English text up in the language's catalog
  (`hi.ts`) and shows English when there's no entry. Values go in with `{name}` slots
  (`t("Delete {name}?", { name })`), which can hold elements (a link, a bold name), so each language
  keeps its own word order. Counts use `t.n(count, "{n} file", "{n} files")`, with the language's
  plural rule (in Hindi, 0 and 1 take the first form). Texts defined outside components are marked
  with `msg("…")` and translated where they're shown. `t.date()` and `t.dateTime()` format in the
  language.
- The language travels in a cookie (`aatmiq_lang`) so pages arrive already in it, with
  `<html lang="hi">` from the first paint (screen readers pick the right voice), and the sign-in
  page keeps the language after signing out. The saved choice is `user.locale` (null: the
  organization's `default_locale`).
- Devanagari comes from Noto Sans Devanagari, bundled with the app (no internet needed); browsers
  download it only when Hindi text is on screen.

## Checks

- `pnpm --filter @aatmiq/web test` (`scripts/check-i18n.mjs`, in CI) collects every text the
  interface translates and fails when one has no Hindi, when a translation's `{slots}` differ from
  the English, or when the catalog has entries nothing uses.
- `tests/e2e/hindi.mjs` (in CI) switches to Hindi and checks the pages, `lang`, the server-rendered
  first paint, dates, the sign-in page after signing out, the organization default and a person's
  own choice, that the admin console stays English, and runs axe in Hindi. It saves screenshots of
  the main pages in Hindi to `tests/e2e/results-hindi/`.

## Before release: a native speaker's review

The Hindi was written for this release and needs a review by a native speaker who knows office
software: open the screenshots from `tests/e2e/results-hindi/` (or switch a test account to
Hindi), and correct `apps/web/src/i18n/hi.ts` directly: the English is the key, the Hindi the value.
The terms used throughout: चैट, दस्तावेज़, प्रोजेक्ट, वर्कस्पेस, टास्क, स्किल, शेड्यूल, कनेक्शन,
टोकन, मॉडल, सहेजें, हटाएँ, रद्द करें, मंज़ूरी, साइन इन. Plain Hindi with the English words
people use at work, rather than formal Sanskrit-based terms.

## Adding a language

1. Add it to `LOCALES` in `packages/shared/src/schemas.ts` and `apps/web/src/i18n/index.tsx`
   (with its name in its own script, and its BCP 47 tag for dates).
2. Copy `hi.ts` to the new language's file, translate the values, and add it to `CATALOGS`.
3. Make `check-i18n.mjs` check it too, and add the option to Admin → Settings → Language.
4. If its script isn't covered by Inter or Noto Sans Devanagari, add a font for it to the font stack
   in `packages/ui/src/theme.css` (bundled with `@fontsource`, so it works offline).

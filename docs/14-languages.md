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

The **admin console** too: every page under Admin (users, groups, workspaces, models and Auto,
token requests, usage, audit log, health, settings, sign-in providers, Work AI, connectors and the
connector catalog, email, license), for admins who use Aatmiq in Hindi.

And **what the server says**: error messages, notifications, emails (in the recipient's language:
theirs, else the organization's default), health checks and alerts, license notices, and Auto's
reason for its choice.

Still in English:

- **The Code editor** (VS Code's own interface; its official language packs don't include Hindi).
- What the agent and the model write, the audit log's event names, and messages from other
  services passed on as they are (a model server's or an identity provider's own error).
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
- The server (`apps/api/src/i18n/`) writes its texts in English where they're made and translates
  them on the way out with `tr(locale, text)`: errors when they're answered (the language from the
  same cookie), notifications when they're read, emails for their recipient, health checks and
  license messages when they're shown. Its catalog (`hi.ts`) holds English templates with `{slots}`
  (`"Task finished: {title}"`); a finished text is matched against them, and the values go into the
  Hindi, translated too when they're texts of ours (a health alert's summary, "3 days"). Write each
  sentence whole: ``n === 1 ? "1 document has…" : `${n} documents have…` ``, never a word picked
  inside a sentence, so each language keeps its own word order.

## Checks

- `pnpm --filter @aatmiq/web test` (`scripts/check-i18n.mjs`, in CI) collects every text the
  interface translates (with the connector catalog's descriptions and Auto's reasons) and fails
  when one has no Hindi, when a translation's `{slots}` differ from the English, or when the
  catalog has entries nothing uses.
- `apps/api/src/i18n.test.ts` (in CI) does the same for the server: it collects every error
  message, notification, email part, health check and license message from the source, and also
  fails when a sentence picks English words with a condition inside it.
- `tests/e2e/hindi.mjs` (in CI) switches to Hindi and checks the pages, `lang`, the server-rendered
  first paint, dates, the sign-in page after signing out, the organization default and a person's
  own choice, the admin console's pages, and runs axe in Hindi (the admin console too). It saves
  screenshots of the main pages and the admin console in Hindi to `tests/e2e/results-hindi/`.

## Before release: a native speaker's review

The Hindi was written for this release and needs a review by a native speaker who knows office
software: open the screenshots from `tests/e2e/results-hindi/` (or switch a test account to
Hindi), and correct `apps/web/src/i18n/hi.ts` (the interface) and `apps/api/src/i18n/hi.ts` (the
server's messages and emails) directly: the English is the key, the Hindi the value.
The terms used throughout: चैट, दस्तावेज़, प्रोजेक्ट, वर्कस्पेस, टास्क, स्किल, शेड्यूल, कनेक्शन,
टोकन, मॉडल, सहेजें, हटाएँ, रद्द करें, मंज़ूरी, साइन इन. Plain Hindi with the English words
people use at work, rather than formal Sanskrit-based terms.

## Adding a language

1. Add it to `LOCALES` in `packages/shared/src/schemas.ts` and `apps/web/src/i18n/index.tsx`
   (with its name in its own script, and its BCP 47 tag for dates).
2. Copy `hi.ts` to the new language's file, translate the values, and add it to `CATALOGS`; the
   same for the server (`apps/api/src/i18n/`, with its `LOCALES`).
3. Make `check-i18n.mjs` and `apps/api/src/i18n.test.ts` check it too, and add the option to
   Admin → Settings → Language.
4. If its script isn't covered by Inter or Noto Sans Devanagari, add a font for it to the font stack
   in `packages/ui/src/theme.css` (bundled with `@fontsource`, so it works offline).

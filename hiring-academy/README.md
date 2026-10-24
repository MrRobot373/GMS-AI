# Hiring Academy

A one-page website for Hiring Academy, a job-training and placement academy in Pune, Maharashtra, plus a small Node.js service that saves inquiries and forwards them by email.

Stack: HTML, CSS, JavaScript, and Node.js (Express + Nodemailer). No database, no build step.

## Setup

1. Install dependencies:

   ```
   npm install
   ```

2. Copy the environment template and fill in your values:

   ```
   copy .env.example .env
   ```

3. Create a Gmail app password (not your normal Gmail password):

   - Sign in to your Google Account at https://myaccount.google.com/apppasswords
   - Two-factor verification must be enabled on the account to create an app password.
   - Choose a name (for example `hiring-academy`), create it, and copy the 16-character password.
   - Put that value in `.env` as `SMTP_PASS`. Gmail uses `smtp.gmail.com` on port 587.

   The `SMTP_USER` and `INQUIRY_TO` values in the template are already set to `yashbadgujar5415@gmail.com` if that is the account you are using.

4. Start the server:

   ```
   npm start
   ```

## Running

The site opens at http://localhost:4173 (or the port set in `PORT`).

- `POST /api/inquiry` validates the form payload, appends one JSON line to `data/inquiries.jsonl`, and sends an email with Nodemailer if SMTP is configured.
- If `SMTP_USER` or `SMTP_PASS` is missing, the inquiry is still saved and the API responds `200` with `"Email is not configured yet."` — the site never breaks because of a missing SMTP setup.
- Inquiries from the same IP are rate-limited to 5 per 10 minutes.

## Files

- `server.js` — Express server, `.env` loading, inquiry validation, JSONL log, email sending, rate limiting.
- `public/index.html` — the single page: Home, Programs, Training, Campus, Inquiry.
- `public/styles.css` — design tokens and layout (ink green, paper, marigold; Georgia headings).
- `public/app.js` — menu toggle and client-side form validation + `fetch` submit.
- `data/inquiries.jsonl` — created automatically when the first inquiry arrives.

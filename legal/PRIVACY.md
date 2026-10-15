# Aatmiq Privacy Notice

> **Draft for legal review.** This is [COMPANY]'s notice about the personal data *we* handle. The
> data inside a customer's Aatmiq installation is the customer's: the customer decides how it's
> used and tells its people (template: [STAFF-NOTICE.md](STAFF-NOTICE.md)). Placeholders are listed
> in [README.md](README.md).

Effective date: [EFFECTIVE DATE] · Version 0.1 (draft)

## Who we are

[COMPANY], [COMPANY ADDRESS] (**"we"**), makes Aatmiq, software that organizations run on their own
servers. For the personal data described here we are the data fiduciary (under India's Digital
Personal Data Protection Act, 2023) or controller (under the GDPR and similar laws).

Questions and requests: [PRIVACY EMAIL]. Grievance officer: [GRIEVANCE OFFICER NAME], [PRIVACY EMAIL].

## The short version

- Aatmiq runs on our customers' servers. **Chats, documents, projects, Work AI tasks, code and
  the people's accounts stay there.** We don't receive them, can't see them, and don't use them to
  train AI models.
- Once a day an installation tells our license server **counts** (how many seats are used, how many
  tokens were processed), so we can check the license. No names, emails or content.
- We hold the business contact and billing details of the people who buy from us, and whatever
  you send us when you ask for support.

## What we collect, and why

| What | From | Why | Legal basis |
|---|---|---|---|
| **Business contact details**: name, work email, phone, job title, company of the people who order, are invoiced or are our contacts at a customer | You, during sales and onboarding | To sell, deliver and invoice licenses, and to contact you about your account, renewals and security notices | Contract; legitimate interests; legal obligations (tax, accounting) |
| **License check-ins** (see below) | Each Aatmiq installation, about once a day | To check the license is valid and within its seats, deliver changed license terms, warn about expiring or misused keys, plan capacity and support | Contract; legitimate interests |
| **Request logs of our license server**: the IP address a check-in came from, time, result | Our license server | Security and troubleshooting | Legitimate interests |
| **Support communications**: your messages and anything you attach (logs, screenshots, configuration, backups) | You | To help with your issue; to improve the product | Contract; legitimate interests |
| **Website and email** [if applicable: analytics or cookies on [WEBSITE]] | Your browser | [describe, or remove if none] | [consent / legitimate interests] |

**What a license check-in contains**, exactly: the license key, a random identifier of the
installation (made on the customer's server, not linked to a person), the Aatmiq version, the
number of seats in use, the number of input and output tokens and requests per section (Chat, Work
AI, Code) since the previous check-in, the number of workspaces, the Node.js version and the
server's uptime. Customers who can't allow this connection can run Aatmiq without internet access
by agreement with us; check-ins are then off.

Support files may contain personal data from the customer's installation (for example names or
email addresses in logs). Please send us only what's needed; we can help you redact it. When we
handle such data for you, we do so as your processor under the Data Processing Addendum
([DPA.md](DPA.md)).

## What we don't collect

Aatmiq doesn't send us usage analytics, telemetry or crash reports, and the editor (Aatmiq Code)
has telemetry switched off. A customer's server does connect to some other services, directly and
not through us, when the customer uses them:

- Hugging Face, the Ollama library and container registries, to download models and updates;
- Open VSX (open-vsx.org), when someone installs an extension in Aatmiq Code;
- search engines, through the private search service in the installation, when Work AI searches
  the web (without the person's identity);
- websites the Work AI browser opens, and apps people connect (such as Gmail, Slack or GitHub),
  at their direction;
- the customer's email server, and any external model service the customer configures.

Those services handle data under their own terms.

## Who we share it with

- **Service providers** that help us run our business, under contract and only for that purpose:
  [hosting provider for the license server, e.g. …], [email provider], [payment and accounting
  providers], [CRM / support desk]. The current list is in [DPA.md](DPA.md#annex-3-sub-processors).
- **Professional advisers** (lawyers, auditors) under confidentiality.
- **Authorities**, when the law requires it.
- **A buyer or successor** of our business, under this notice.

We don't sell personal data.

## Where it's kept

Our license server and business systems are in [COUNTRY/REGION]. When data moves to another
country, we use the safeguards the law requires (for data from the EU, for example, the European
Commission's standard contractual clauses).

## How long we keep it

| What | How long |
|---|---|
| Business contact and billing records | As long as we have a business relationship, then as tax and company law require ([in India, up to 8 years]) |
| License check-ins | While the license exists, plus [2 years] |
| License server request logs | [30 days] |
| Support communications and files | [2 years] after the issue is closed; files you send for an issue are deleted when it's closed, unless you ask us to keep them |

## Security

We protect personal data with appropriate measures, including encryption in transit, access only
for staff who need it, two-step sign-in for our administrative systems, and logs of administrative
actions. License keys are signed, and the license server never receives customer content.

## Your rights

Depending on where you are, you can ask us to: tell you what personal data we have about you and
how we use it; correct or complete it; erase it; stop or limit certain uses; or give you a copy.
Under India's DPDP Act you can also nominate someone to exercise your rights, and raise a grievance
with our grievance officer, then with the Data Protection Board of India. In the EU and UK you can
complain to your data protection authority. Write to [PRIVACY EMAIL]; we answer within [30 days].

Where we rely on consent, you can withdraw it at any time.

For data inside your employer's Aatmiq installation, ask your employer (or use **Settings → Your
data** to download yours): we don't hold it.

## Children

Aatmiq is for organizations and isn't meant for children; we don't knowingly collect children's
data.

## Changes

We'll post changes here with a new effective date, and tell customers' contacts of material changes.

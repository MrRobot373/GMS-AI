# Legal documents

> **Status: drafts, not yet reviewed by a lawyer.** They're written from what the product actually
> does (checked against the code), assume a company in India selling to businesses, and cover
> India's Digital Personal Data Protection Act, 2023 and the GDPR. Have a lawyer qualified where
> you're incorporated and where you sell review them, fill in the placeholders, and only then put
> them in front of customers. Nothing here is legal advice.

## What's here

| File | What it is | Who signs or reads it |
|---|---|---|
| [EULA.md](EULA.md) | The software license agreement: license per installation and seat, license keys and check-ins, what happens when a license lapses, customer data, AI output, fees, support, warranties, liability, term | Each customer, with every Order |
| [PRIVACY.md](PRIVACY.md) | Our own privacy notice: the personal data **we** hold (buyers' contact details, license check-ins, license-server logs, support) | Published on the website; linked from Orders |
| [DPA.md](DPA.md) | Data processing addendum for when we do touch a customer's personal data: support sessions, files sent to us, services on their systems | Customers who ask for one (most larger ones will) |
| [STAFF-NOTICE.md](STAFF-NOTICE.md) | A template customers adapt and give their own staff: what Aatmiq stores about them, who can see it, their rights | Given to customers during onboarding |
| [THIRD-PARTY.md](THIRD-PARTY.md) | Every open-source component and AI model we ship or set up, their licenses, what each asks of us, and the written offer for source code | Ships with every release |
| [third-party/npm-packages.md](third-party/npm-packages.md) | The generated list of every npm package (version, license, source) in the API, web app and desktop app | Ships with every release |
| [third-party/licenses/](third-party/licenses/) | Full texts of the GPL, LGPL, MPL and AGPL, which the notices refer to | Ships with every release |
| [third-party/code-oss-LICENSE.txt](third-party/code-oss-LICENSE.txt) | The MIT license of Code-OSS / OpenVSCode Server (Aatmiq Code), with the trademark note | Ships in the API image |

## Placeholders to fill in

| Placeholder | Meaning | In |
|---|---|---|
| `[COMPANY]` | The legal name of the company selling Aatmiq | EULA, privacy, DPA, third-party |
| `[COMPANY ADDRESS]` | Registered office | EULA, privacy |
| `[COMPANY REGISTRATION]` | CIN (or registration number elsewhere) | EULA |
| `[LEGAL EMAIL]` | Where legal notices and source-code requests go | EULA, third-party |
| `[PRIVACY EMAIL]` | Where privacy requests go | Privacy, DPA |
| `[GRIEVANCE OFFICER NAME]` | The person who handles grievances under the DPDP Act | Privacy, DPA |
| `[SECURITY EMAIL]` | Where breach notices and security reports go | DPA |
| `[EFFECTIVE DATE]` | When the privacy notice takes effect | Privacy |
| `[WEBSITE]` | The company website, if it uses analytics or cookies (otherwise delete that row) | Privacy |
| `[COUNTRY]`, `[COUNTRY/REGION]` | Where the license server and our business systems run | Privacy, DPA |
| `[SUPPORT POLICY URL]` | The support policy: channels, response times per plan, supported versions (rollout checklist item 6) | EULA |
| `[GOVERNING LAW]`, `[CITY]` | Governing law, and the seat of arbitration and the courts | EULA |

Choices in square brackets with a value in them, such as `[30]` days, `[90 days]` of warranty,
`[60]` days' notice before renewal, `[48]` hours for breach notices or `[2 years]` of keeping
check-ins, are our suggested defaults: keep or change them, then remove the brackets. The service
providers in the DPA's Annex 3 and the privacy notice's sharing section have to be the ones you
actually use.

`STAFF-NOTICE.md` has its own placeholders (`[ORGANIZATION]`, `[CONTACT]`…): the customer fills
those in, not us.

## What the lawyer should look at

1. **Jurisdiction.** The EULA assumes Indian law and arbitration under the Arbitration and
   Conciliation Act, 1996. For customers abroad, decide whether to keep that or offer a local
   version.
2. **The license-key behaviour** (EULA section 3): a warning 14 days after a missed check-in,
   admin settings locked after 30, a 14-day grace period after expiry, then read-only. This is how
   the product behaves today ([docs/05-license-server.md](../docs/05-license-server.md)); the
   wording must match it.
3. **The check-ins are not personal data.** They carry counts only (exact contents in the privacy
   notice), but the license server sees the customer's IP address, which we treat as personal data
   with a short retention.
4. **Roles.** The customer is the data fiduciary for everything in its installation; we're a
   processor only during support and services (DPA), and a fiduciary for our own business contacts
   (privacy notice).
5. **AGPL components.** SearXNG and MinIO are AGPL-3.0. Compose downloads them from their
   publishers, so normally we don't distribute them; the offline bundle does, unmodified, with the
   AGPL text and the written offer (THIRD-PARTY.md). Confirm that's enough.
6. **Model licenses.** The NVIDIA Nemotron Open Model License requires its notice to be passed on
   (done in THIRD-PARTY.md); the EULA passes the model licenses on to customers. The optional older
   embedding model (EmbeddingGemma version 1) is under Google's Gemma Terms of Use, which come with
   a prohibited-use policy that has to flow down; the default (EmbeddingGemma 2) is Apache-2.0.
7. **LGPL and MPL libraries** (libvips, the LibreOffice kit), used unmodified as separate
   libraries: check the notices and the source offer meet their terms.
8. **AI output.** The EULA gives output to the customer, says it can be wrong, and disclaims
   warranties for it.
9. **Liability cap** (12 months' fees) and the indemnity scope.

## How the open-source notices are made

`scripts/third-party-notices.mjs` reads the dependencies the shipped packages actually use (from
pnpm), and:

- writes `third-party/npm-packages.md` (run `node scripts/third-party-notices.mjs` after changing
  dependencies, and commit the result);
- fails (`--check`, run in CI on every push) when that list is out of date or a package has a
  license we haven't accepted. To accept a new license, add it to `ALLOWED` in the script after
  checking what it asks of us; a package that needs more than a notice goes in `REVIEWED` and in
  THIRD-PARTY.md;
- writes the full license texts into each image while it's built: `/app/THIRD_PARTY_NOTICES.txt`,
  `/opt/dsh/THIRD_PARTY_NOTICES.txt` and `/opt/aatmiq-code/THIRD_PARTY_NOTICES.txt` in the API
  image, and `/third-party-notices.txt` on every installation's website (the web image).

The release workflow copies this folder into each release's deploy folder, and `deploy/offline.sh`
puts it in the offline bundle.

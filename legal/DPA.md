# Data Processing Addendum

> **Draft template for legal review.** Aatmiq is self-hosted: in normal use we never receive the
> personal data in a customer's installation, so there's nothing for us to process. This addendum
> covers the times we do: support, files a customer sends us, and services in an Order where we work
> on the customer's systems. It's written for India's DPDP Act, 2023 and the GDPR; adjust it to
> where you sell. Placeholders are listed in [README.md](README.md).

Version 0.1 (draft)

This Data Processing Addendum (**"DPA"**) forms part of the Aatmiq Software License Agreement (the
**"Agreement"**) between [COMPANY] (**"we"**, the **"Processor"**) and the Customer (the
**"Customer"**). Terms defined in the Agreement have the same meaning here.

## 1. When it applies

1.1 This DPA applies when we process **Customer Personal Data**: personal data in Customer Data that
the Customer gives us or lets us access, in particular:
(a) during support: remote or screen-sharing sessions, and logs, screenshots, configuration files,
database exports or backups the Customer sends us;
(b) when an Order includes services on the Customer's systems (installation, upgrades, a managed
model service, or operating an Installation for the Customer).

1.2 It doesn't apply to: Customer Data in an Installation we have no access to; the license
check-ins (which contain counts, not personal data); or the business contact details we hold about
the Customer's staff to manage the account, for which we are an independent data fiduciary under our
privacy notice.

## 2. Roles

The Customer is the data fiduciary (DPDP Act) or controller (GDPR) of Customer Personal Data, and we
are its data processor (DPDP Act) or processor (GDPR). The Customer is responsible for having a
lawful basis to process it and to share it with us, and for its notices to the people concerned.

## 3. Our obligations

We will:

3.1 **Instructions.** Process Customer Personal Data only to provide the support or services
requested, on the Customer's documented instructions (the Agreement, the Order and the support
request are instructions), and tell the Customer if we think an instruction breaks the law.

3.2 **Purpose.** Not sell it, use it to train AI models, or use it for any other purpose.

3.3 **Confidentiality.** Let only staff and sub-processors who need it access it, under
confidentiality obligations.

3.4 **Security.** Protect it with the measures in Annex 2.

3.5 **Sub-processors.** Use only the sub-processors in Annex 3, under written terms at least as
protective as this DPA; tell the Customer at least [30] days before adding or replacing one; and
let the Customer object on reasonable grounds, in which case we'll work out an alternative or the
Customer may end the affected service. We remain responsible for our sub-processors.

3.6 **Requests from people.** Tell the Customer without undue delay if someone asks us to exercise
their rights over Customer Personal Data, and help the Customer answer. (Aatmiq lets the Customer
download or erase a person's data itself: Admin → Users.)

3.7 **Breaches.** Notify the Customer without undue delay, and in any case within [48] hours, after
becoming aware of a personal data breach affecting Customer Personal Data we process, with what we
know about its nature, the data and people affected, likely consequences and the measures taken,
and keep the Customer updated, so that the Customer can meet its own duties (such as notifying the
Data Protection Board of India and the people affected, or a supervisory authority).

3.8 **Assistance.** Give reasonable help with the Customer's data protection impact assessments and
consultations with authorities, as far as they concern our processing.

3.9 **Deletion.** Delete Customer Personal Data when the support issue or service ends, including
files the Customer sent for an issue (within [30] days of closing it), unless the Customer asks us
to keep it longer or the law requires us to keep it, and confirm deletion on request.

3.10 **Audits.** Make available the information needed to show compliance with this DPA, and allow
an audit by the Customer or an independent auditor it appoints, at most once a year (more often
after a breach or when an authority requires it), on [30] days' notice, during business hours, under
confidentiality, at the Customer's cost.

## 4. International transfers

Customer Personal Data may be processed in [COUNTRY] and in the countries of the sub-processors in
Annex 3. Where the law of the Customer's country restricts such a transfer, we'll use the safeguard
it requires: for personal data from the EEA, the standard contractual clauses (Commission Decision
(EU) 2021/914, Module Two, controller to processor) are incorporated by reference, with Annexes 1–3
of this DPA as their appendix, the [optional docking clause: not used] and the governing law and
courts of [an EU member state]; for the UK, the UK addendum to those clauses. Transfers out of India
follow any restriction the Government of India notifies under the DPDP Act.

## 5. The Customer's obligations

The Customer will give us only the personal data needed for the issue or service (and remove or
mask other personal data from logs and exports where it can), give lawful instructions, and tell us
of any special requirements for the data it shares.

## 6. Liability and order of precedence

Liability under this DPA is subject to the limitations in the Agreement. If this DPA and the
Agreement conflict on the processing of personal data, this DPA prevails; the standard contractual
clauses prevail over both where they apply.

## 7. Term

This DPA lasts as long as we process Customer Personal Data, and section 3.9 survives.

---

## Annex 1: Details of the processing

| | |
|---|---|
| Subject matter and nature | Support and services for the Customer's Aatmiq Installations: viewing, receiving, storing for the duration of an issue, analyzing and deleting data the Customer shares |
| Purpose | Diagnosing and fixing issues; installing, upgrading or operating the Software as ordered |
| Duration | For each support issue or service, until it ends, then deletion as in section 3.9 |
| People concerned | The Customer's employees and contractors who use Aatmiq; people mentioned in their chats, documents or tasks |
| Personal data | What the Customer chooses to share, typically: account details (names, work emails, roles), sign-in records (IP addresses, browsers), activity and application logs, and where unavoidable excerpts of chats, documents or task files |
| Sensitive data | Not expected. The Customer will tell us before sharing any special category or sensitive personal data, and we'll agree how to handle it |

## Annex 2: Security measures

**Our handling of Customer Personal Data**

- Access only for named support engineers who need it, with two-step sign-in on our systems;
  access is logged.
- Files received for support are kept in [a restricted, encrypted store], never on removable media,
  and deleted as in section 3.9.
- Remote sessions only when the Customer starts or approves them; the Customer can watch and end
  them.
- Staff are bound by confidentiality and trained in data protection; devices are encrypted and
  centrally managed.
- Our development process includes automated tests on every change, dependency audits, license
  checks of the open-source components, and an internal security review.

**Security features of the Software** (which the Customer configures in its Installation)

- Runs entirely on the Customer's servers; AI models run locally; no telemetry; the license
  check-in carries counts only.
- HTTPS through the bundled Caddy proxy (the Customer's certificate or an internal authority), with
  secure cookies and strict transport security.
- Passwords stored as one-way hashes; optional or required two-step sign-in (authenticator app and
  backup codes); single sign-on with Google, Microsoft, OpenID Connect or SAML 2.0; sign-in rate
  limits; signed-in devices people can review and sign out.
- Secrets (provider keys, client secrets, connected-app tokens, the mail server password) encrypted
  at rest with a key derived from the Installation's own secret.
- Roles and permissions per organization, workspace and project; chats private to their author.
- Each Work AI task and each person's editor runs as its own unprivileged operating-system user (or
  in its own container), and a firewall stops them from reaching the database, the model servers,
  private networks and cloud metadata; risky agent actions wait for a person's approval.
- An activity log of security-relevant events; a health page with email alerts.
- Nightly backups (database and files, the last 14 kept) and a tested restore procedure.
- Tools for privacy requests: download everything about a person; erase a person (shared items
  move to a colleague, the activity log keeps a pseudonym); retention of chats by age; a notice to
  people when chats are recorded for compliance.

## Annex 3: Sub-processors

| Sub-processor | What for | Where |
|---|---|---|
| [Email provider, e.g. …] | Support email | [ ] |
| [Support desk / ticketing tool] | Support requests and attachments | [ ] |
| [File transfer or storage service] | Large support files | [ ] |
| [Hosting provider] | Only for managed services in an Order | [ ] |

[Remove rows you don't use. If support is handled only by your own staff on your own systems, say so
here: "None".]

## Annex 4: Contacts

- Customer's privacy contact: [NAME, EMAIL]
- Our privacy contact and grievance officer: [GRIEVANCE OFFICER NAME], [PRIVACY EMAIL]
- Our security contact (breach notices): [SECURITY EMAIL]

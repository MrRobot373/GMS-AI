# Aatmiq Software License Agreement

> **Draft for legal review — not yet for use with customers.** Written to match how Aatmiq works
> (self-hosted, per-seat subscription, offline license keys, counts-only check-ins). Fill in the
> placeholders listed in [README.md](README.md) and have a lawyer qualified in [GOVERNING LAW]
> review it before the first sale.

Effective date: [EFFECTIVE DATE] · Version 0.1 (draft)

This Software License Agreement (the **"Agreement"**) is between **[COMPANY]**, [COMPANY ADDRESS]
([COMPANY REGISTRATION]) (**"we"**, **"us"**), and the organization named in the Order (the
**"Customer"**, **"you"**). It applies to every Order that refers to it. By signing an Order, or by
installing or using the Software, you accept this Agreement on behalf of the Customer, and confirm
that you have the authority to do so.

## 1. Definitions

- **"Software"**: the Aatmiq software we make available to you (the server software in its container
  images, the web application, the Aatmiq Code editor and desktop apps), its updates, and the
  license key, but not Third-Party Components or Models.
- **"Documentation"**: the guides and specifications we publish for the Software (including
  the user guide, admin guide and hardware sizing guide).
- **"Order"**: the order form, quotation or invoice we accept, stating the plan, number of seats,
  term and fees.
- **"Plan"**: the edition in the Order (for example Chat, Work, Complete or Enterprise), which sets
  the sections (Chat, Work AI, Code), features and limits the license key enables.
- **"Seat"**: an active user account in your installation. Pending invitations count as Seats until
  they're accepted, withdrawn or expire. Deactivated or erased accounts don't count.
- **"Installation"**: one running deployment of the server software, with its own database.
- **"Customer Data"**: everything you and your users put into or create with the Software:
  accounts, chats, documents, projects, Work AI tasks and their files, code, settings and logs.
- **"Output"**: text, code, files and other content the Software generates for you, including with
  the Models.
- **"Models"**: the AI models the Software runs or connects to, whether open-weight models our
  setup downloads (such as Nemotron, Qwen or Gemma) or a model service you configure.
- **"Third-Party Components"**: open-source software and other third-party software included with
  or used by the Software, listed in `legal/THIRD-PARTY.md`.
- **"Subscription Term"**: the period in the Order, including renewals.

## 2. License

2.1 **Grant.** Subject to this Agreement and payment of the fees, we grant you, for the
Subscription Term, a non-exclusive, non-transferable, non-sublicensable license to:
(a) install the Software on servers you own or control (in your premises, a data center or a cloud
account you control), as one production Installation per license key, plus Installations for
testing, staging or disaster recovery that don't serve users at the same time as production;
(b) let up to the number of Seats in the Order use it, through the web application, the desktop
apps and Aatmiq Code; and
(c) use the Documentation,
in each case for your internal business purposes, within the limits of your Plan.

2.2 **Your users.** Your employees and contractors working for you may use the Software under your
account. You are responsible for their use and for keeping their credentials secure.

2.3 **Affiliates.** Your affiliates may use the Software under your Order if the Order says so; you
remain responsible for them.

2.4 **Reservation.** We and our licensors keep all rights not expressly granted. The Software is
licensed, not sold.

## 3. License keys and check-ins

3.1 **Keys.** The Software works with a license key we issue for your Order. The key states your
Plan, Seats, sections, features and end date, and the Software checks it on your server without
contacting us.

3.2 **Check-ins.** Unless agreed otherwise for an installation without internet access, the
Software contacts our license server about once a day (by default `https://license.aatmiq.com`).
A check-in sends only: the license key, a random identifier of the Installation, the Software
version, the number of Seats in use, token counts per section since the previous check-in, the
number of workspaces, the Node.js version and the server's uptime. It never sends Customer Data,
user names, email addresses, prompts or documents. Our license server answers with the current
state of your license and, if your terms changed, an updated key. Our privacy notice describes how
we handle this information.

3.3 **When check-ins stop.** If an Installation doesn't check in for 14 days past the interval,
admins see a warning; after 30 days, admin settings are paused until it checks in again. Users keep
working throughout.

3.4 **End of the term.** For 14 days after the end date the Software keeps working with a notice.
After that, until a new key is entered, it becomes read-only: people can still sign in, read their
chats, documents and tasks and download their data, but can't make changes or use the AI. Customer
Data stays on your servers either way.

3.5 **Seat limit.** The Software doesn't let you invite people beyond your Seats. To add Seats,
order more; your new key reaches the Installation at its next check-in.

3.6 **No circumvention.** You won't remove, disable or work around the license key, the check-ins or
the Plan's limits, or run more Installations or Seats than licensed.

## 4. Restrictions

You won't, and won't let anyone else:
(a) copy, modify, translate or create derivative works of the Software, except configuration,
branding and integrations the Documentation describes;
(b) reverse engineer, decompile or disassemble the Software, except to the extent applicable law
permits despite this restriction;
(c) sell, rent, lease, sublicense or distribute the Software, or offer it to third parties as a
hosted service, outsourcing or service-bureau offering, without our written agreement;
(d) remove or change any proprietary, license or attribution notice;
(e) use the Software to build a competing product, or publish benchmark results without our consent;
(f) use the Software or the Models in breach of law, the Models' licenses and acceptable-use terms,
or the rights of others; or
(g) use the Software where its failure could lead to death, personal injury or severe environmental
damage, or to make decisions with legal or similarly significant effects on individuals without
appropriate human review.

## 5. Customer Data

5.1 **Yours.** As between us, you own Customer Data. The Software stores it on servers you control.
We have no access to it, and we don't use it to train models or for any other purpose.

5.2 **When we see it.** We access Customer Data only if you give it to us or give us access, for
example during a support session, by sending logs, backups or screenshots, or under a managed
service in your Order. We then process it only to provide that service, as set out in the Data
Processing Addendum (`legal/DPA.md`), which forms part of this Agreement when it applies.

5.3 **Your responsibilities.** You are responsible for: the lawful basis for processing personal
data in your Installation, including telling your users how it is used (a template is in
`legal/STAFF-NOTICE.md`); the content you and your users put in; securing your servers, network
and backups; configuring the Software's settings (such as retention, prompt-logging notices,
connectors and model servers); and the third-party services you connect it to.

5.4 **Third-party services you connect.** If you or your users connect the Software to other
services (such as Gmail, Slack, GitHub or a hosted model API), data goes to those services under
their terms and at your direction. We aren't responsible for them.

## 6. AI Output and Models

6.1 **Output is yours.** As between us, you own the Output, and we claim no rights in it. The
Models' licenses don't claim it either (see `legal/THIRD-PARTY.md`).

6.2 **Review it.** Output is generated by machine-learning models. It can be inaccurate, incomplete,
biased, or similar to content others have, and the Work AI agent can take wrong steps. You are
responsible for reviewing Output and actions before relying on them, and for configuring the
agent's approval settings to suit your risk.

6.3 **Model licenses.** The Models are provided by their makers under their own licenses (for
example the NVIDIA Nemotron Open Model License, Apache-2.0, or the Gemma Terms of Use), which you
accept by using them. We pass these on as is.

## 7. Third-Party Components

The Third-Party Components are licensed under their own licenses, listed with their texts in
`legal/THIRD-PARTY.md` and in each release. Nothing in this Agreement limits your rights under
those licenses, and where an open-source license requires us to offer source code, we do so as
described there.

## 8. Fees and taxes

8.1 You'll pay the fees in the Order, in advance for each year of the Subscription Term unless the
Order says otherwise, within [30] days of our invoice.

8.2 Fees exclude taxes. You'll pay applicable taxes (including GST), except taxes on our income.

8.3 If an Installation uses more Seats than licensed, we may invoice the difference pro rata for
the rest of the term.

8.4 If you don't pay an undisputed invoice within [30] days after we remind you in writing, we may
suspend renewal of your license key until you pay.

8.5 Fees are non-refundable, except as stated in sections 10.2 and 11.

## 9. Updates and support

9.1 During the Subscription Term you get the updates we release, and the support of your Plan as
described in our support policy ([SUPPORT POLICY URL]): where to report issues, response times and
which versions we support.

9.2 You decide when to update. We support the versions our support policy names; we may need you
to update to fix an issue.

## 10. Warranties

10.1 **Ours.** We warrant that for [90 days] from delivery of each major version, the Software will
perform substantially as described in the Documentation when installed on supported hardware
and systems, and that we won't knowingly include malware in it.

10.2 **Remedy.** If it doesn't, tell us within the warranty period. We'll fix it or provide a
workaround, and if we can't within a reasonable time, either of us may end the affected Order and
we'll refund the prepaid fees for the rest of its term. This is your only remedy for breach of
this warranty.

10.3 **Disclaimer.** Except as stated in this section, the Software, Output, Models and
Third-Party Components are provided "as is". To the extent the law allows, we disclaim all other
warranties, express or implied, including merchantability, fitness for a particular purpose,
non-infringement, accuracy of Output, and uninterrupted or error-free operation.

## 11. Indemnity

11.1 **Ours.** We'll defend you against third-party claims that the Software, as we provide it,
infringes their intellectual property rights, and pay the damages and costs a court awards or we
agree to in a settlement. This doesn't cover claims arising from Third-Party Components, Models,
Output, Customer Data, your modifications, combination with things we didn't provide, or use in
breach of this Agreement. If the Software is, or we think it may be, held to infringe, we may get
you the right to keep using it, change it so it doesn't infringe, or end the license and refund the
prepaid fees for the rest of the term.

11.2 **Yours.** You'll defend us against third-party claims arising from Customer Data, your use of
Output, or your use of the Software in breach of section 4 or the law, and pay the damages and
costs a court awards or you agree to in a settlement.

11.3 **Process.** The party asking for defense must tell the other promptly, let it control the
defense and settlement (no settlement may admit fault of the defended party without its consent),
and reasonably help at the other's cost.

## 12. Limitation of liability

12.1 Neither party is liable for indirect, incidental, special, consequential or punitive damages,
or for loss of profits, revenue, goodwill or data, even if told they were possible.

12.2 Each party's total liability under this Agreement is limited to the fees you paid under it in
the 12 months before the event giving rise to the claim.

12.3 Sections 12.1 and 12.2 don't apply to: your payment obligations; breach of section 3.6 or 4;
the indemnities in section 11; breach of confidentiality; or liability that can't be limited by law.

## 13. Confidentiality

Each party will keep the other's non-public information it receives under this Agreement
confidential, use it only for this Agreement, and protect it with at least reasonable care. This
doesn't apply to information that is or becomes public without breach, was already known, is
independently developed, or is lawfully received from someone else. A party may disclose it when
the law requires, after telling the other where allowed. Our license keys, pricing and the Software
are our confidential information; Customer Data is yours.

## 14. Term and termination

14.1 This Agreement lasts as long as an Order under it. Each Order lasts for its Subscription Term
and renews for the same period unless either party gives notice at least [60] days before the end.

14.2 Either party may end an Order if the other materially breaches this Agreement and doesn't fix
the breach within 30 days of written notice, or becomes insolvent.

14.3 When an Order ends, the license ends, the Software becomes read-only as in section 3.4, and you
will stop using it (other than to read and export your data) and delete our confidential
information. You keep your Customer Data: it is on your servers, and people can download their
data in read-only mode. Sections 4, 5, 6.1, 7, 8 (for amounts due), 10.3, 11, 12, 13, 14.3 and 15
survive.

## 15. General

15.1 **Pilots.** For a pilot or evaluation stated in an Order, this Agreement applies except that
section 10 and section 11.1 don't, and either party may end it at any time.

15.2 **Usage statement.** Once a year, at our reasonable request, you'll confirm in writing the
number of Installations and Seats in use.

15.3 **Feedback.** We may use suggestions you give us without obligation.

15.4 **Publicity.** Neither party will use the other's name or logo in marketing without consent.

15.5 **Export and sanctions.** Each party will comply with export-control and sanctions laws that
apply to it.

15.6 **Assignment.** Neither party may assign this Agreement without the other's consent, except
to a successor in a merger or sale of the business, with notice.

15.7 **Force majeure.** Neither party is liable for delay caused by events beyond its reasonable
control (other than payment obligations).

15.8 **Governing law and disputes.** This Agreement is governed by the laws of [GOVERNING LAW,
e.g. India]. The parties will first try to resolve a dispute by good-faith negotiation for 30 days.
Then it will be finally resolved by arbitration under [the Arbitration and Conciliation Act, 1996],
by a sole arbitrator, seated in [CITY], in English. Either party may seek urgent interim relief from
the courts of [CITY].

15.9 **Notices.** Notices go to the addresses in the Order, or to [LEGAL EMAIL] for us, and are
effective when received.

15.10 **Entire agreement.** This Agreement, the Order and the Data Processing Addendum (where it
applies) are the entire agreement on their subject. If they conflict, the Order prevails, then the
Data Processing Addendum (for personal data), then this Agreement. Purchase-order terms don't apply.
Changes need a written amendment signed by both parties. If a provision is unenforceable, the rest
remains in force. Not enforcing a right isn't a waiver.

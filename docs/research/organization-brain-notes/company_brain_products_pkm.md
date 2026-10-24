# Company-brain products and PKM approaches: how they build organizational memory (state as of 24 Oct 2026)

Scope note: profiles of enterprise "company brain" products (Glean, Microsoft 365 Copilot, Gemini Enterprise, Atlassian Rovo, Notion AI, Guru, Slack AI, Dropbox Dash, Moveworks, Writer, ChatGPT, Claude, Perplexity Enterprise, Coveo, Elastic) and PKM/markdown approaches (Obsidian and plugins, Logseq, Karpathy's LLM wiki, Basic Memory, Mem, Reflect, Tana, Capacities), judged for a self-hosted "organization brain" in GEM AI (TypeScript, Postgres + pgvector, local models, on-prem in India). Every fact carries a source. "Vendor claim" marks marketing statements. help.openai.com and openai.com returned HTTP 403 to fetches, so OpenAI facts come from search-result excerpts of those pages. Prices are mostly third-party estimates and are flagged as such.

## Q1. What architectural patterns are common across the best enterprise products (permission-aware graph of people, documents and activity; personalization; connectors with ACL sync)?

### Takeaway
The leading products converge on the same stack: (1) many connectors that pull content **plus metadata plus ACLs** into a central hybrid index (lexical + vector), with a slower or optional **federated/live** mode for sensitive or fast-changing data; (2) a **graph** that links content, people (one canonical identity across apps) and activity; (3) ranking that blends relevance with authority, freshness and usage or social signals; and (4) **query-time permission trimming**, so answers only use what the asking user can already open. The main failure in practice is not the AI. It is that faithful permission mirroring exposes years of existing oversharing. Almost none of these products can run fully on-premises.

### Cited Findings

**Glean**
- The knowledge graph rests on "three fundamental pillars: content, people, and activity", built from "over 100 connectors", each written for one app's data model and API. Crawlers index full content (titles, body, comments), metadata (creator, timestamps, update history, folder structure) and permissions. Admins can tune crawl frequency, blackout periods and include/exclude rules — [Glean docs: Knowledge Graph](https://docs.glean.com/security/knowledge-graph); [Glean blog](https://glean.com/blog/enterprise-ai-knowledge-graph)
- People layer: one identity across connected apps, plus org context (role, team, tenure, location) and collaboration insights (close collaborators, recent projects). Glean says "One in ten enterprise searches are people-related" — [Glean docs](https://docs.glean.com/security/knowledge-graph)
- Activity layer: signals come from Teams, Slack, email, plugins and a Chrome extension. Individual data "remains isolated to each user", and aggregated insights need data from several users before they apply (privacy thresholds). "Activity data never leaves your exclusive GCP project" — [Glean docs](https://docs.glean.com/security/knowledge-graph)
- Personal Graph: a per-user personalization layer that infers tasks, projects, goals, commitments and priorities (partly from turnaround times) from "personal activity from 100+ data sources" (edits, replies, pings). It keeps up to 5 writing-style profiles by content type and audience. The page does not describe privacy or user controls for it, and gives no launch date — [Glean Personal Graph](https://www.glean.com/enterprise-context/personal-graph)
- Ranking: per a Glean search summary of its docs, the algorithm "continuously improves based on user interactions with search results and document access patterns", and new content is indexed and updates applied "within minutes" — [Glean docs: About Glean Search](https://docs.glean.com/administration/search) (this page returned 404 when fetched on 2026-10-24, so the quote comes from a search excerpt). Glean's community forum lists the ranking signals as content, semantic relevance, links and anchors between documents, timestamps and activity data. It says duplicate or stale copies "split authority" — [Glean community](https://community.glean.com/discussion/884/why-do-results-improve-after-we-clean-up-source-data)
- Agents: Glean Agents became GA on 20 May 2025 (natural-language builder, agent library, guardrails). The Agents API, hosted MCP server and deep-research agent were still in beta then — [Glean press](https://www.glean.com/press/glean-expands-horizontal-agent-platform-delivers-dozens-of-agents-and-open-interoperability-across-the-enterprise); [Glean blog](https://www.glean.com/blog/go-agents-launch)
- Deployment: hosted SaaS or "Customer Hosted (formerly Cloud-Prem)", where Glean runs the tenant as a managed service inside the customer's GCP or AWS. Customers who self-host get lower licence costs. No fully on-prem or air-gapped option was found — [Glean deployment models](https://docs.glean.com/get-started/build/about-deployment); [Glean help: deployment options](https://help.glean.com/en/articles/10093412-glean-deployment-options)
- Price class: list prices are not public. A competitor (GoSearch) cites buyer reports of about $50–75+/user/month with roughly a 100-seat minimum, with AI possibly an extra ~$15/user/month. Treat as unverified and possibly biased — [GoSearch](https://www.gosearch.ai/blog/glean-pricing-explained)

**Microsoft 365 Copilot (Microsoft Graph + Semantic Index + Copilot connectors)**
- Semantic index: Copilot maps tenant data into "an advanced lexical and semantic index" built on Microsoft Graph. Graph ranking uses "keyword matching, personalization, and social matching" (signals about the user "and their close network"). There is a tenant-level index built from SharePoint Online text files, and a user-level index for the user's mailbox and working set — [Microsoft Learn: Semantic indexing](https://learn.microsoft.com/en-us/microsoftsearch/semantic-index-for-copilot)
- Freshness: documents users create are indexed "near real-time" in their mailbox. New SharePoint documents accessible "by two or more users are indexed daily", and updates to indexed documents are "immediately indexed" — [Microsoft Learn](https://learn.microsoft.com/en-us/microsoftsearch/semantic-index-for-copilot)
- Permissions: grounding "only accesses content that the current user is authorized to access", and indexing "doesn't change access permissions". Semantic indexing "can't be disabled". The only exclusion lever without Purview DLP is turning off search for a whole SharePoint site, which removes it from both Microsoft Search and the index. Microsoft's own guidance tells admins to reduce oversharing (SharePoint Advanced Management, sensitivity labels, DLP) — [Microsoft Learn](https://learn.microsoft.com/en-us/microsoftsearch/semantic-index-for-copilot)
- Data residency: the user index is stored where the mailbox is, and the tenant index in an isolated tenant container in the SharePoint region (EU Data Boundary respected). Prompts and data are not used to train foundation LLMs — [Microsoft Learn](https://learn.microsoft.com/en-us/microsoftsearch/semantic-index-for-copilot)
- Connectors:
  - **Synced** connectors index items into Graph, and every item carries an ACL. They come in an admin (tenant) configuration or a self-serve per-user configuration, which is removed when the user disconnects.
  - **Federated** connectors use MCP to fetch live data without indexing it, and are read-only (write actions were "available starting early October 2026").
  - There are 100+ prebuilt connectors, and the "Microsoft Graph connector agent" indexes on-prem sources.
  - "Search relevance algorithms rank external and internal results equally, based on query match, freshness, and user context."
  - [Microsoft Learn: Copilot connectors overview](https://learn.microsoft.com/en-us/microsoft-365/copilot/connectors/overview) (updated 2026-10-12)
- Oversharing is the main deployment blocker. Gartner (Aug 2024, 132 IT leaders): 40% delayed Copilot by at least 3 months, mainly over oversharing and security — [Infosecurity Magazine](https://infosecurity-magazine.com/news/microsoft-copilot-delayed-over). A CoreView survey (21 Jul 2026, vendor survey): 66% of enterprises delayed or cancelled Copilot over fears of exposing confidential SharePoint data — [CoreView](https://www.coreview.com/news/66-percent-of-enterprises-delay-microsoft-copilot)
- Price class (third-party, Oct 2026): Microsoft 365 Copilot add-on about $30/user/month (annual), on top of an E3/E5 base. Copilot Business (<300 users) is about $21 list, with promotions at $18 and promo dates that conflict between sources — [GeoToolbox](https://geotoolbox.ai/blog/copilot-pricing); [collab365](https://spaces.collab365.com/posts/microsoft-cuts-copilot-business-price-by-three-dol-dcEFtq); [Velosio](https://velosio.com/blog/m365-copilot-pricing-calculator). Cloud only.

**Google Gemini Enterprise (formerly Agentspace)**
- Agentspace was renamed Gemini Enterprise on 9 Oct 2025 (third-party report) — [Atlan](https://atlan.com/know/ai-agent/ai-agent-applications/google-agentspace/)
- Connectors write into per-entity "data stores" and work in one of two modes:
  - **Federation**, which queries the source live ("search quality might be lower"; "your query string is sent to all enabled third-party search backends").
  - **Ingestion**, which copies data into the Gemini index.
  - Sync schedules: entity full syncs every 3h–7d; **identity full syncs every 30 min–7d**; incremental syncs default every 3h. Incremental sync "does not sync identity data or deletions", so deletions need a full sync.
  - Ingestion regions are global, US or EU; CMEK is optional.
  - [Google docs: connectors and data stores](https://docs.cloud.google.com/gemini/enterprise/docs/introduction-to-connectors-and-data-stores)
- Access control:
  - It needs an identity provider (Google Identity, or a third-party IdP via workforce identity federation). Connectors pull "documents, metadata, and permissions", using Google identities or identity mapping.
  - Limits: 3,000 readers per document. Access control must be chosen when a data store is created and can't be toggled afterward. Changing the IdP means recreating data stores.
  - [Google docs: configure IdP](https://docs.cloud.google.com/gemini/enterprise/docs/configure-identity-provider); [Google docs](https://docs.cloud.google.com/gemini/enterprise/docs/introduction-to-connectors-and-data-stores)
- Editions: Business, Standard, Plus, Pay-as-you-go, Frontline. Business starts at $21/seat/month; Standard and Plus are priced through sales. Quotas are pooled and enforced on a rolling 7 days (Plus: 200 assistant queries/day) — [Google docs: editions](https://docs.cloud.google.com/gemini/enterprise/docs/editions); [Gemini Enterprise FAQ](https://cloud.google.com/gemini-enterprise/faq). Cloud only (Google Cloud).

**Atlassian Rovo / Teamwork Graph**
- Teamwork Graph is "Atlassian's unified data layer". Everything is an object with an object type (work items, documents, messages, users, groups, projects), and one type can hold items from Jira, Asana or GitHub. It maps relationships (page to work item, Slack message to project, co-authors). "100 out-of-the-box Teamwork Graph connectors" push data "along with relationships and permissions". It feeds Rovo Search, Chat, Agents and Analytics — [Atlassian developer: What is Teamwork Graph](https://developer.atlassian.com/platform/teamwork-graph/what-is-teamwork-graph/)
- Permission sync is event-driven: new or removed content syncs to Rovo. Restriction changes narrow or widen visibility. Deletions remove the item from Search, Chat and Agents — [Atlassian support: permission sync](https://support.atlassian.com/organization-administration/docs/how-connector-permissions-are-kept-in-sync/)
- Connector types:
  - Synced connectors are set up by an admin and indexed.
  - Direct connectors search live through the provider's API, and nothing is stored.
  - Smart Link connectors use each user's own permissions.
  - Third-party connectors' capabilities are "self declared… not verified by Atlassian", and deletions may not sync.
  - [Atlassian support: evaluate third-party connectors](https://support.atlassian.com/organization-administration/docs/evaluate-third-party-connectors-in-the-teamwork-graph/)
- Packaging: Rovo is included in all Standard, Premium and Enterprise Cloud plans, metered in credits (Jira: 25/70/150 credits per user). There is no Rovo on the Free plan — [Atlassian Rovo admin guide](https://www.atlassian.com/software/rovo/guides/admin-guide/rovo-activation); [Jira pricing](https://www.atlassian.com/en/software/jira/pricing)
- Self-hosting outlook: Data Center sales to new customers ended 30 Mar 2026, and DC reaches end of life (read-only) on 28 Mar 2029. Atlassian cites Rovo and Teamwork Graph as reasons Cloud is the better long-term fit — [Eficode](https://www.eficode.com/blog/atlassian-is-ending-data-center-next-steps-for-you); [Atlassian blog](https://www.atlassian.com/blog/development/from-data-center-to-cloud-the-next-chapter-for-marketplace-apps)

**Notion AI (Q&A / Enterprise Search / Agents)**
- AI Connectors cover Slack, Google Drive, Teams, SharePoint, OneDrive, Jira, GitHub, Linear, Salesforce, Gmail, Outlook and Google Calendar. Answers carry citations — [Notion help: AI connectors](https://notion.com/help/category/notion-ai-connectors). A partner (not Notion) says AI honours existing permissions and queries connected apps with each user's tokens — [MediaJunction](https://www.mediajunction.com/notion-platform/enterprise-search)
- Memory as an editable page: the Notion 3.0 agent's instructions page "acts like a memory bank". The user can edit it, only one is active at a time, and sharing it doesn't change anyone else's agent. Custom Agents each have their own instructions page that "acts as your agent's memory and grows as you chat" — [Notion 3.0 blog](https://www.notion.com/blog/introducing-notion-3-0); [Notion help: instructions](https://www.notion.com/help/instructions-for-notion-agent); [Notion help: custom agent](https://www.notion.com/help/guides/build-your-first-custom-agent)

**Guru (verified-knowledge pattern)**
- Every card has a verifier (an expert or a group) and a review interval, from specific days to annual. Only the verifier can re-verify — [Guru help: verification](https://help.getguru.com/docs/verifying-and-unverifying-cards). Knowledge Agents can auto-verify content that is "actively used, trusted, and up to date" and unverify content that is outdated or flagged, with audit logs (vendor docs, per search excerpt) — same source
- Guru's MCP server "enforces the same RBAC permissions" as the web app. External AI tools get the "cited, permission-aware knowledge layer", not raw documents. Writes through MCP trigger the normal review and publishing workflow — [Guru MCP server](https://www.getguru.com/features/mcp-server); [Guru developer docs](https://developer.getguru.com/docs/guru-mcp-server-overview)

**Slack AI / Slack enterprise search**
- Enterprise search is federated: each answer is based "on your access and permissions to that data at that exact time". Slack "doesn't store your external search results" and the LLM "immediately forgets that data". Models are hosted inside Slack's trust boundary (vendor claim) — [Slack enterprise search](https://slack.com/features/enterprise-search); [Slack blog](https://slack.com/blog/news/slack-enterprise-search-uncover-knowledge-work-smarter)
- A Real-Time Search API lets partners search Slack without bulk export. Its availability dates conflict across Slack posts — [slack.dev](https://slack.dev/secure-data-connectivity-for-the-modern-ai-era/). Enterprise search is tied to the Enterprise+ plan per a later Slack page — [Slack](https://slack.com/features/enterprise-search)
- Incident (Aug 2024): PromptArmor showed that indirect prompt injection planted in a **public** channel could make Slack AI exfiltrate data from the victim's private channels. Slack first called the behaviour "intended", then patched it — [PromptArmor](https://promptarmor.substack.com/p/data-exfiltration-from-slack-ai-via); [The Register](https://www.theregister.com/2024/08/21/slack_ai_prompt_injection/)

**Dropbox Dash (most detailed public engineering write-up)**
- Pipeline: custom crawlers per app ("each has its own ACL and permission system"). Content is normalized to markdown, enriched (CLIP for images, transcription for audio, scene descriptions for video), and stored in a **BM25 + dense vector** index. "Multiple ranking passes" personalize results and enforce ACLs per user. Quality is measured with NDCG — [Dropbox Tech, Josh Clemm, Jan 2026](https://dropbox.tech/machine-learning/vp-josh-clemm-knowledge-graphs-mcp-and-dspy-dash)
- Knowledge graph:
  - It links cross-app relations (meeting to attendees, documents, transcripts, Jira).
  - A canonical person ID was "very, very impactful".
  - Graphs are **not** kept in a graph database (latency and query-pattern problems) but built asynchronously.
  - "Knowledge bundles" summarize graph context and are chunked and embedded like any document.
  - [Dropbox Tech](https://dropbox.tech/machine-learning/vp-josh-clemm-knowledge-graphs-mcp-and-dspy-dash)
- Lessons:
  - An index beats federated retrieval at scale.
  - MCP tool definitions and results bloat context, so context is capped at about 100k tokens; one query took "up to 45 seconds" via MCP versus seconds via the index. The fix is a single "super tool" plus sub-agents.
  - An LLM-as-judge (1–5 relevance) started at 8% disagreement with humans and improved with o3, "RAG as a judge" and DSPy prompt optimization.
  - [Dropbox Tech](https://dropbox.tech/machine-learning/vp-josh-clemm-knowledge-graphs-mcp-and-dspy-dash); [InfoQ](https://www.infoq.com/news/2026/02/dropbox-context-engine)

**Moveworks (now ServiceNow)**
- ServiceNow completed the acquisition on 15 Dec 2025 — [BusinessWire](https://www.businesswire.com/news/home/20251215128980/en/ServiceNow-completes-acquisition-of-Moveworks)
- "Permission mirroring" works through two connector types. Indexed connectors (ServiceNow, Confluence, SharePoint, Google Drive, Zendesk) capture permissions at indexing and enforce them at query time. Live connectors (Outlook, Jira, Box, Slack) query with the user's delegated token. Google Drive private files are included only with the user's consent. Confluence uses a read-only service account and silently skips anything it can't see. Source permission models are normalized into **ReBAC** (with ABAC rules) — [Moveworks docs: enterprise search](https://docs.moveworks.com/ai-assistant/enterprise-search/overview); [SharePoint setup](https://docs.moveworks.com/ai-assistant/enterprise-search/configure-enterprise-search/sharepoint-online-and-onedrive-setup-for-enterprise-search); [Google Drive setup](https://docs.moveworks.com/ai-assistant/enterprise-search/configure-enterprise-search/google-drive-setup-for-enterprise-search); [Moveworks blog](https://www.moveworks.com/us/en/resources/blog/enterprise-guide-to-enterprise-search-and-information-security)

**Writer Knowledge Graph (anti-pattern on permissions)**
- Graph-based RAG: a specialized LLM maps semantic relationships between data points instead of plain chunk vectors. Writer claims higher accuracy than vector RAG — [Writer dev docs](https://dev.writer.com/home/knowledge-graph); [The New Stack](https://thenewstack.io/writer-coms-graph-based-rag-alternative-to-vector-retrieval/)
- "Permissions from the data source don't transfer over to Knowledge Graph": everyone with access to the graph sees the connected data. Indexed data is stored in a multitenant GCP environment and the original files are deleted. Connectors require the Enterprise plan. Writer's product overview mentions an "option to self-host your Knowledge Graph" with no details — [Writer help: KG data connectors](https://support.writer.com/articles/4599542578-setting-up-knowledge-graph-data-connectors); [Writer help: manage KG](https://support.writer.com/article/242-how-to-create-and-manage-a-knowledge-graph); [Writer blog](https://writer.com/blog/enterprise-ai-features/)

**Perplexity Enterprise**
- Connectors: Google Drive, OneDrive, SharePoint, Box, Dropbox. Limits: 5,000 files in a personal repository and 15,000 total with Spaces (Enterprise Pro). Thread uploads are kept 7 days; repository files until deleted — [Perplexity help: enterprise file limits](https://intercom.help/perplexity-ai/en/articles/12009761-enterprise-file-limits); [Perplexity FAQ](https://hub-prod.perplexity.ai/hub/faq/pro-enterprise-faq)
- "Enterprise data will never be used to train" — [Perplexity FAQ](https://hub-prod.perplexity.ai/hub/faq/pro-enterprise-faq). Price: $34/seat/month (annual) on Perplexity's page versus $40/month or $400/year in a third-party review (conflict) — [Perplexity pricing](https://enterprise-prod.perplexity.ai/enterprise/pricing); [coworker.ai](https://coworker.ai/blog/perplexity-enterprise-pricing). SaaS only.

**Coveo (classic enterprise search: early-binding ACLs + click learning)**
- "Early-binding": crawlers import item permissions at crawl time. The index evaluates effective permissions from the item's permission model plus a cached "security identity" store. Group-membership changes lag until the next identity refresh (a new group member cannot see a file until then) — [Coveo docs: security identities](https://docs.coveo.com/en/1719/)
- Automatic Relevance Tuning learns from search and click events (and outcomes such as case deflection). It needs at least 100 click and search events before it boosts anything — [Coveo ART](https://docs.coveo.com/en/3384/); [Coveo ART troubleshooting](https://docs.coveo.com/en/1858/)

**Elastic**
- Content connectors support document-level security (DLS) for SharePoint Online and Server, Confluence and others. Connectors can run self-managed next to a self-managed Elasticsearch. DLS for connectors is labelled beta and "not available for all Elastic subscription levels" — [Elastic: DLS for connectors](https://www.elastic.co/guide/en/enterprise-search/current/dls.html); [Elastic DLS e2e guide](https://www.elastic.co/guide/en/elasticsearch/reference/current/es-dls-e2e-guide.html); [Elastic connectors security](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/es-connectors-security.html)

### Inferences
- **Common reference architecture** (all mapped to the cited items above):
  1. Connectors ingest content plus metadata plus ACLs plus identities.
  2. A normalized document store and a hybrid BM25/vector index (Postgres FTS + pgvector fits this).
  3. An identity graph with one canonical person ID.
  4. A relationship graph (doc–person–project–meeting), which Dropbox shows can live in relational tables and be summarized into embeddable "bundles" rather than needing a graph DB.
  5. Activity signals (views, edits, clicks, shares) feeding ranking.
  6. Query-time permission trimming before any text reaches the LLM.
  7. Citations in every answer.
- **Two sync modes are standard**: indexed for quality and speed, federated/live for sensitive or volatile data (Microsoft, Google, Atlassian, Moveworks, Slack). GEM AI's MCP connectors are federated by nature. Dropbox's evidence suggests they should be complemented by an index for anything used often.
- **Identity and ACL sync should run faster than content sync, and deletions need explicit handling.** Google runs identity sync every 30 min against content every 3h, and its incremental syncs miss deletions; Coveo has group-membership lag; Atlassian third-party connectors may not propagate deletions. GEM AI should track ACLs per document, re-sync groups often, run periodic full reconciliation for deletes, and fail closed when ACL data is stale.
- **Oversharing tooling is part of the product.** The Microsoft and Gartner evidence shows mirrored permissions surface bad sharing. GEM AI should ship admin reports ("documents visible to everyone that look sensitive"), exclusion lists and per-project scoping before turning on org-wide indexing.
- **Ranking signals worth copying**: recency, edit and view counts, author or team proximity, verified status (Guru) and duplicate consolidation (Glean). Use privacy thresholds for aggregate signals (Glean). Click-learning needs volume (Coveo's minimum of 100 events), so small on-prem tenants should lean on LLM-as-judge evaluation (Dropbox) rather than click models.
- **Anti-pattern**: Writer's KG drops source permissions; any GEM AI design where a shared "brain" flattens ACLs repeats this. Slack's incident shows that retrieved content (even from "public" spaces) must be treated as untrusted input to the LLM.

| Product | Self-host? | Price class (as found) |
|---|---|---|
| Glean | Customer-hosted in own GCP/AWS, Glean-managed; no on-prem found | ~$50–75+/user/mo (unverified, competitor-sourced) |
| M365 Copilot | No (cloud; on-prem sources via connector agent) | ~$30/user/mo add-on; Business ~$18–21 (third-party) |
| Gemini Enterprise | No | from $21/seat/mo (Business) |
| Atlassian Rovo | No (DC EOL 2029) | included in paid Cloud plans, credit-metered |
| Perplexity Ent. | No | $34–40/seat/mo |
| Writer KG | "option to self-host" (undocumented) | Enterprise plan |
| Elastic | Yes, self-managed | subscription tier for DLS unclear |

### Gaps
- No primary source found for Glean's ranking model internals, its Personal Graph privacy controls or launch date, or any Glean on-prem/air-gapped option.
- Gemini Enterprise "knowledge graph" internals and any official memory/personalization feature were not documented in the pages read. Atlan mentions an "Agent Platform Memory Bank" (third-party only).
- No current official Slack, Notion or Moveworks pricing was verified. Notion's permission mirroring was confirmed only by a partner site.
- Coveo and Perplexity self-hosting: no evidence either exists (Coveo appears SaaS-only, unverified). Elastic's licence tier for connector DLS could not be confirmed.

## Q2. How do ChatGPT, Claude and Copilot (and Glean/Notion) design user-facing memory, and what problems were reported?

### Takeaway
There are two designs. (a) A **profile/summary injected automatically** into every chat (ChatGPT "reference chat history", Copilot inferred memories, Glean learned memories). (b) **Model-invoked retrieval over past chats or memory files** (Claude's chat search tools, Claude's API memory tool). Everyone has added the same controls: separate explicit "saved" memories from inferred ones; a view/edit/delete UI; temporary or incognito chats; **project-scoped memory**; and an admin kill switch. The reported problems are hidden context changing outputs, memory leaking across unrelated work, persistent prompt injection ("memory poisoning"), and compliance gaps: Copilot memories ignore Purview retention policies and produce no audit log.

### Cited Findings

**ChatGPT (OpenAI)**
- Memory has two parts: "Reference saved memories" (explicit) and "Reference chat history". Turning off saved memories also turns off chat history; turning off chat history doesn't delete saved memories — [OpenAI help: Memory in ChatGPT](https://help.openai.com/en/articles/8590148-memory-in-chatgpt) (search excerpt; fetch blocked)
- Chat-history memory launched for paid users in spring 2025 and reached free users on 3 Jun 2025. Simon Willison found that "the summary then gets injected into the context every time you start a new chat" — [Simon Willison, 21 May 2025](https://simonwillison.net/2025/May/21/chatgpt-new-memory/)
- "Project-only memory" was released around 22 Aug 2025 — [Willison update](https://simonwillison.net/2025/May/21/chatgpt-new-memory/). On Business/Enterprise, project-only memory requires memory to be on at both workspace and account level — [OpenAI help: Projects](https://help.openai.com/en/articles/10169521-projects-in-chatgpt) (search excerpt)
- Oct 2025: automatic sorting and prioritizing of saved memories addressed "memory full" complaints, and users can re-prioritize entries — [TechRadar](https://www.techradar.com/ai-platforms-assistants/chatgpt/chatgpt-is-smarter-now-that-its-learned-to-forget-a-huge-memory-upgrade-is-coming)
- Enterprise:
  - Enterprise owners can turn memory off for the organization — [OpenAI blog: Memory and new controls](https://openai.com/index/memory-and-new-controls-for-chatgpt/) (search excerpt).
  - 25 Jun 2026 release notes: "improved memory" is rolling out to Enterprise/Edu. It is admin opt-in during early access, then on by default for eligible workspaces unless an admin opts out, and users can revert to legacy saved memories. It is disabled by default in regulated workspaces — [OpenAI Enterprise/Edu release notes](https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes); [OpenAI help](https://help.openai.com/en/articles/8590148-memory-in-chatgpt) (search excerpts).
  - An unverified single blog claims a June 2026 "dreaming" background memory system with doubled capacity, so treat that as uncertain.
- Company knowledge (Business/Enterprise/Edu, launched Oct 2025):
  - It searches connected apps (Slack, SharePoint, Google Drive, GitHub, etc.) with citations, respecting each user's existing permissions.
  - It must be turned on per conversation and does no write actions.
  - Connectors were renamed "apps" on 17 Dec 2025. Admins manage apps with RBAC and groups, and apps are covered by the Compliance API.
  - [OpenAI help: company knowledge](https://help.openai.com/en/articles/12628342-company-knowledge-in-chatgpt-business-enterprise-and-edu) (search excerpt); [VentureBeat](https://venturebeat.com/ai/openai-launches-company-knowledge-in-chatgpt-letting-you-access-your-firms)
- Price class (third-party): Business about $20/user/month annual or $25 monthly; Enterprise is custom, reportedly $45–75/seat — [eesel](https://www.eesel.ai/blog/chatgpt-work-pricing); [coworker.ai](https://coworker.ai/blog/chatgpt-enterprise-pricing)

**Claude (Anthropic)**
- Memory reached Team/Enterprise on 11 Sep 2025 and Pro/Max on 23 Oct 2025.
  - It captures team processes, client needs, project details and priorities.
  - "A separate memory for each project" keeps confidential work apart.
  - A memory **summary** can be viewed and edited in Settings, or steered by chatting.
  - Incognito chats don't save to history or memory.
  - Enterprise admins can disable memory org-wide.
  - Memory can be imported from or exported to other AI tools.
  - Anthropic ran safety testing (over-accommodation, reinforcing harmful patterns) before widening access.
  - [Anthropic: Bringing memory to Claude](https://claude.com/blog/memory)
- Chat recall uses visible tool calls (`conversation_search`, `recent_chats`) that the model invokes; nothing is auto-injected. This contrasts with ChatGPT's automatic inclusion — [Simon Willison, 12 Sep 2025](https://simonwillison.net/2025/Sep/12/claude-memory/). Anthropic told BGR search runs only when instructed — [BGR](https://bgr.com/1937826/claude-ai-can-search-reference-past-conversations/)
- Developer memory tool (`memory_20250818`):
  - It is client-side: the app maps `/memories` to its own storage (per-user directory or DB keys) and implements view/create/str_replace/insert/delete/rename.
  - The API auto-injects "ALWAYS VIEW YOUR MEMORY DIRECTORY BEFORE DOING ANYTHING ELSE… ASSUME INTERRUPTION".
  - Recommended safeguards: path-traversal checks, stripping sensitive data, size caps and "periodically delete memory files that haven't been accessed in a long time".
  - It pairs with context editing and compaction.
  - [Claude docs: memory tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool)
- Price class (third-party): Team Standard $20–25/seat/month, Premium $100–125. The seat minimum (2 vs 5) conflicts between sources — [krater.ai](https://krater.ai/blog/claude-team-plan-pricing); [pasqualepillitteri.it](https://pasqualepillitteri.it/en/news/8545/claude-team-2-seats-small-teams)

**Microsoft 365 Copilot memory**
- Memories include saved memories, details inferred from chat history, and custom instructions. They are stored "in the user's Exchange mailbox in a hidden folder" and inherit mailbox compliance (Customer Lockbox, encryption at rest).
- The "Enhanced personalization" control is **on by default**. Turning it off stops memories being applied but does not delete them.
- Saved memories persist until the user deletes them. Deleting a chat doesn't delete the memories derived from it. Inferred chat-history details are removed within 7 days after all source chats are deleted, or 30 days after the control is disabled.
- **Purview retention policies don't apply to memory.** "Memory and personalization actions don't generate audit log entries." "Admins can't restrict what type of information is added."
- Admins can find and delete memories via eDiscovery (item class IPM.Contact, folder "CopilotMemory"). Temporary chats are discoverable.
- The page (updated Sept 2026) still labels the feature preview/Frontier.
- [Microsoft Learn: Manage Copilot personalization and memory](https://learn.microsoft.com/en-us/microsoft-365/copilot/copilot-personalization-memory)
- Message Center MC1158329 mirrors show user-level controls with a GA timeline of Jan 2026, which conflicts with the "preview" label above — [mc.merill.net](https://mc.merill.net/message/MC1158329)

**Glean Assistant memory**
- "Saved memories" are explicit and can't be turned off by admins. "Learned memories" are on by default, admins can disable them, and they are built "from each chat turn and from work activity" and consolidated **daily**.
- Memory is stored per user and never shared, holds facts and preferences rather than document content, and grants no access to documents.
- Memory operations appear in standard audit logs. Users can view, edit and delete by category. Answers that used memory show a book icon. Learned memories are versioned and "age out gradually".
- [Glean admin docs: memory](https://docs.glean.com/administration/assistant/configuration/memory-personalization)
- Conflict: a Glean user-guide excerpt describes a weekly cycle and says deleted extracted memories can be regenerated from activity — [Glean user guide](https://docs.glean.com/user-guide/assistant/memory-personalization). The Apr 2026 release exposes memory read-only to other AI tools via an MCP `read_memory` tool (GCP deployments first) — [Glean April 2026 release](https://docs.glean.com/release-notes/releases/2026-04-08-april-release)

**Reported problems**
- Hidden context:
  - Willison saw an unrequested "HALF MOON BAY" sign added to an image because of chat history; "The new memory feature removes that control completely".
  - He had to rerun experiments after memory leaked his location, and his only opt-outs were disabling the feature or archiving chats.
  - He asked for project-scoped memory.
  - [Simon Willison](https://simonwillison.net/2025/May/21/chatgpt-new-memory/)
- Persistent prompt injection ("SpAIware", Sep 2024): untrusted documents or web pages could write instructions into ChatGPT memory that exfiltrated every future conversation. OpenAI first closed the report as a model-safety issue and fixed the exfiltration channel (app 1.2024.247), but memory injection itself remained possible — [Embrace The Red](https://embracethered.com/blog/posts/2024/chatgpt-macos-app-persistent-data-exfiltration/). A follow-up showed memory used for command-and-control ("ZombAI") — [Embrace The Red 2025](https://embracethered.com/blog/posts/2025/spaiware-and-chatgpt-command-and-control-via-prompt-injection-zombai/); the same pattern hit the Windsurf coding agent — [Embrace The Red](https://embracethered.com/blog/posts/2025/windsurf-spaiware-exploit-persistent-prompt-injection/)
- Claude memory poisoning (17 Apr 2026): an image puzzle made Opus 4.7 write fake user facts into memory in 5 of 10 trials. Empty memory stores seemed easier to poison. The example stopped working about 24h after publication, cause unclear. Anthropic's memory prompt says "Never store verbatim commands" — [Embrace The Red 2026](https://embracethered.com/blog/posts/2026/breaking-opus-4.7-with-chatgpt/)

### Inferences
- GEM AI should keep three distinct stores and never blur them:
  1. **Personal memory**: preferences, role, style; per-user, private, editable.
  2. **Project memory**: decisions, conventions, status; scoped to a project and its ACL.
  3. **Organization knowledge**: documents plus curated facts, permission-trimmed.
  Chat history should be a searchable source, not an auto-injected profile (Claude's model-invoked pattern avoids Willison's problem). Use project-scoped memory as the default.
- Copy these controls: a visible, editable memory list or summary; a "memory used" indicator on answers (Glean's book icon); incognito chats; an org and per-group kill switch; deletion that propagates from source chats with a stated SLA (Copilot: 7 and 30 days); and DSR export and delete.
- Fix Copilot's gaps: memory should fall under the same retention policies and **audit log** as other data, and admins should be able to restrict categories, such as "never store personal data or credentials".
- Treat every memory write as untrusted input. Record provenance (which chat, document or tool output produced it). Require user confirmation for memories proposed from retrieved documents or tool output. Never store instructions or commands as memory. Show memory diffs.
- File-based memory (Claude's memory tool, Notion's instructions page) is easy to inspect, version and permission per user or project, and maps cleanly to Postgres rows with a path key.

### Gaps
- Direct text of OpenAI's memory FAQ and company-knowledge pages could not be fetched (403). Plan-by-plan memory availability and the exact Business-plan admin labels are unverified, as is the "dreaming" June 2026 claim.
- No primary source on Gemini Enterprise end-user memory controls.
- Whether Anthropic patched the 2026 memory-poisoning vector, and current Claude admin controls beyond "disable memory", are unconfirmed.

## Q3. Is there a credible self-hosted open alternative to Glean?

### Takeaway
Yes, with caveats. **Onyx** (formerly Danswer) is the only widely cited, mature, MIT-licensed, self-hostable product with connectors, hybrid search, agents and local-LLM support. Its **permission sync is an Enterprise Edition (paid) feature** covering about 14 connectors, and it lacks file-share and WebDAV connectors as of Sept 2026. Elasticsearch self-managed with connector DLS is a lower-level building block. PipesHub is an emerging option with an unverified permission model. No open project matches Glean's activity graph or personal graph.

### Cited Findings
- Onyx: "the knowledge/context layer for your team and AI agents". Community Edition is "available freely under the MIT license" (RAG, chat, agents, actions); Enterprise Edition adds group syncing and SCIM. It has 50+ connectors, deep research, MCP both ways (Claude Code and Codex can connect to Onyx), and self-hosted LLMs ("Ollama, LiteLLM, vLLM"). It deploys with Docker, Kubernetes, Helm or Terraform, including "air-gappable" setups, and has about 32.9k GitHub stars — [Onyx GitHub](https://github.com/onyx-dot-app/onyx)
- Permission-syncing connectors are an EE feature: Confluence, Jira, Google Drive, Gmail, Slack, Salesforce, GitHub, Box, Canvas, SharePoint, Teams, Outlook, Zoom — [Onyx docs: connectors overview](https://docs.onyx.app/admins/connectors/overview); OneDrive with permission sync was added in v4.9.0 — [Onyx changelog](https://docs.onyx.app/changelog). It is paid on Cloud Business/Enterprise and on self-hosted EE — [Onyx docs: GitHub connector](https://docs.onyx.app/admins/connectors/official/github). SharePoint permission sync needs certificate auth — [Onyx docs: M365 setup](https://docs.onyx.app/admins/connectors/official/microsoft-365/setup)
- Onyx access model: connectors are Private, Public or Auto-Sync Permissions. "All access in Onyx comes from group membership". Custom groups are EE-only — [Onyx docs: permissions](https://docs.onyx.app/admins/permissions/understanding_permissions)
- A Sept 2026 third-party guide confirms permission sync is EE-only and notes no official connector for Nextcloud, WebDAV or SMB shares — [WZ-IT](https://wz-it.com/en/blog/onyx-self-hosted-installation/). The cloud business plan is about $20/user/month (vendor and third-party) — [Onyx alternatives page](https://onyx.app/alternatives)
- PipesHub is described as a self-hostable Glean alternative that builds a knowledge graph across apps. Its permission model is not verified — [PremAI](https://www.premai.io/blog/12-best-glean-alternatives-for-private-enterprise-ai-search-2026/)
- Elastic: self-managed connectors with DLS for SharePoint and Confluence (beta, licence-gated) — [Elastic DLS](https://www.elastic.co/guide/en/enterprise-search/current/dls.html)
- For contrast, Glean's most private option is still Glean-managed in the customer's GCP or AWS — [Glean docs](https://docs.glean.com/get-started/build/about-deployment)

### Inferences
- For GEM AI, Onyx is the best reference implementation to study or benchmark (connector framework, ACL fields, group model, MCP exposure). GEM AI already has its own stack, though, and the parts Onyx paywalls (permission sync, groups) are exactly what GEM AI must build in.
- The engineering-firm on-prem gap is a differentiation opportunity for GEM AI: SMB/NAS file shares, PLM/CAD vaults and Windows AD group sync. Microsoft covers network shares only through its cloud connector agent; Onyx lacks them.
- Building on Postgres + pgvector is consistent with what Dropbox learned: an asynchronous graph in tables plus a hybrid index, no graph database needed.

### Gaps
- No verified data on Onyx EE price for self-hosting, or its permission-sync cadence.
- SWIRL, Airweave, Khoj and similar projects were not found in the searched sources and remain unassessed.
- No independent benchmark compares Onyx with Glean on answer quality.

## Q4. When does a markdown/wiki brain (Obsidian, Karpathy's LLM wiki, Basic Memory, Mem, Tana, etc.) work for teams, and what breaks?

### Takeaway
A markdown brain works when one owner or a small trusted team curates **about 100 sources and hundreds of pages** on a bounded topic, the LLM does the bookkeeping (summaries, links, index, lint), and git gives history. It breaks on **permissions** (a vault is all-or-nothing), **concurrent edits** (no co-editing, merge conflicts), **scale** (beyond index files you need search, i.e. RAG again), and **trust** (LLM-written pages can compound errors and contradictions without review). The durable ideas to copy are the *operations* (ingest, query, lint, file answers back), the *index and log files*, and *files as the source of truth with a rebuildable index*. Do not copy the storage model for org-wide permissioned knowledge.

### Cited Findings
- Karpathy's "LLM Wiki" gist (created 4 Apr 2026):
  - Three layers: raw sources (immutable); a wiki the LLM writes ("You read it; the LLM writes it"); and a schema file (CLAUDE.md or AGENTS.md).
  - **Ingest**: one source may touch 10–15 pages, and he prefers supervising one at a time.
  - **Query**: answers carry citations, and good answers are filed back as pages.
  - **Lint**: checks for contradictions, stale claims, orphans and missing links.
  - `index.md` (catalog) "works surprisingly well at moderate scale (~100 sources, ~hundreds of pages)". Beyond that, use search (qmd: BM25 + vector + LLM rerank).
  - `log.md` is append-only. Git provides history. Team use (Slack threads, meetings) is mentioned, but **permissions, concurrent edits and conflict resolution are not addressed**, and there are no benchmarks.
  - [Karpathy gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- Coverage reported Karpathy's own wiki at about 100 articles and 400K words, run with "hacky" scripts and Obsidian. Steph Ango (Obsidian) suggested agents work in a separate "messy vault". Eugen Alpeza warned scaling to thousands of employees with contradictory tribal knowledge gets "brutal". A multi-agent variant adds a "Quality Gate" model before drafts reach the live wiki — [VentureBeat, 3 Apr 2026](https://venturebeat.com/data/karpathy-shares-llm-knowledge-base-architecture-that-bypasses-rag-with-an)
- Obsidian team limits:
  - A shared Sync vault allows at most 20 collaborators, all of whom need paid Sync.
  - There is no live co-editing.
  - The default auto-merge "may sometimes create duplicate text"; a conflict-file option arrived in 1.9.7.
  - [Obsidian help: collaborate](https://obsidian.md/help/sync/collaborate)
  - Sync has no per-file or per-folder sharing (user feature request) — [Obsidian forum](https://forum.obsidian.md/t/feature-request-obsidian-sync-native-file-and-folder-sharing-for-obsidian-and-non-obsidian-users/108755)
  - Git users complain of constant merge conflicts — [Obsidian forum](https://forum.obsidian.md/t/team-colaboration/69608)
- Workarounds:
  - Relay (System 3) uses CRDTs for real-time shared folders with folder access — [System 3 Relay](https://system3.md/relay); [Obsidian forum](https://forum.obsidian.md/t/relay-multiplayer-plugin-for-obsidian-collaborative-editing-and-folder-sharing/87170)
  - Vault Rooms offers per-path permissions, LAN-first — [Obsidian plugin](https://community.obsidian.md/plugins/vault-rooms)
  - Covault merges conflicting lines with an LLM (early stage, 0 reviews) — [Obsidian plugin](https://community.obsidian.md/plugins/covault)
- AI plugins:
  - Smart Connections uses a local embedding model (BGE-micro via transformers.js) for related-note and semantic lookup, with optional Ollama or cloud models — [Obsidian plugin](https://community.obsidian.md/plugins/smart-connections). One source says its licence moved from GPLv3 to source-available in early 2026 (unverified) — [PromptQuorum](https://www.promptquorum.com/pt/power-local-llm/smart-connections-review)
  - Copilot for Obsidian has a "Vault QA" mode over a local vector store, fully offline with Ollama. v4.0.0 introduced the local "Miyo" indexing engine, and Plus adds a paid Agent Mode — [GitHub](https://github.com/logancyang/obsidian-copilot); [v4.0.0 notes](https://newreleases.io/project/github/logancyang/obsidian-copilot/release/4.0.0); [Obsidian plugin page](https://community.obsidian.md/plugins/copilot)
- Logseq: the DB version (SQLite replaces markdown files as the canonical store) entered public beta around 13 Jul 2026. Real-time collaboration is alpha and paid. Logseq warns of possible data loss and recommends backups — [Kompozy](https://kompozy.io/news/logseq-2-0-db-version-beta); [Logseq forum changelog](https://discuss.logseq.com/t/logseq-db-changelog/30013/35); [Logseq repo mirror](https://gitee.com/mirrors/logseq)
- Basic Memory:
  - Markdown files are "the source of truth" and the database is a derived index rebuildable from them.
  - Notes are entities with frontmatter, categorized observations (`- [category] fact`) and typed relations (`relates_to [[Target]]`).
  - MCP tools include `write_note`, `read_note`, `search_notes` and `build_context`, with `memory://` URLs and hybrid search.
  - Licence is AGPL-3.0, with a paid cloud. Multi-user conflict handling is not described.
  - [Basic Memory docs](https://docs.basicmemory.com/reference/technical-information); [Mintlify docs](https://www.mintlify.com/basicmachines-co/basic-memory/concepts/how-it-works)
- Mem 2.0 (Oct 2025) offers self-organizing notes, Deep Search, "Heads Up" resurfacing in meetings, Agentic Chat, and a Mem Teams workspace — [Mem blog](https://get.mem.ai/blog/mem-2-dot-0); [AlternativeTo](https://alternativeto.net/news/2025/10/mem-2-0-relaunches-with-smarter-note-taking-tools-offline-support-and-a-new-agentic-chat)
- Tana:
  - Types (supertags) are user-defined schemas.
  - Spaces have their own members and AI personality, and access inherits from organization to space to document.
  - "AI in Tana never changes your content without approval".
  - It has an MCP server and meeting transcription.
  - [Tana learn](https://www.tana.inc/learn)
- Capacities: typed objects with backlinks and a paid AI tier. It is encrypted in transit and at rest but **not** end-to-end, and AI sends notes to external providers. It is described as primarily single-user (competitor claim) — [Capacities compare](https://capacities.io/compare/anytype); [Hjarni comparison](https://hjarni.com/compare/hjarni-vs-capacities)
- Reflect: end-to-end encrypted notes and attachments, AI summaries and chat, about $10/month annual — [Reflect blog](https://reflect.app/blog/encrypted-assets-lock-screen-activity-deep-links); [Reflect](https://reflect.app/)
- A vendor's characterization of a team vault: "No permissions, no encryption, no audit trail. Whoever has the vault has everything, including after they leave" (vendor marketing, VaultGuard) — [Product Hunt](https://www.producthunt.com/posts/1232104)

### Inferences
- **Works for**: a single expert's research brain; one project team's living spec or decision log; the brain of one agent (Claude Code memory files). In GEM AI terms: a per-project wiki the LLM maintains, owned by the project's ACL group.
- **Breaks for**:
  - Org-wide knowledge with mixed confidentiality (no ACLs below vault level).
  - Many simultaneous writers (merge conflicts; LLM merges are unproven).
  - Thousands of sources (index files stop scaling, so you are back to hybrid search).
  - Auditability (who changed what and why).
  - Drift (LLM summaries can silently diverge from sources unless lint and review gates exist).
- Hybrid to copy: store wiki pages as rows (path, markdown, frontmatter, ACL = project) in Postgres, with git-like versions and an append-only change log. Let the LLM run ingest, lint and file-back operations. Gate writes through a review queue (Guru-style verification and Karpathy's supervised ingest). Keep raw documents immutable and every claim linked to its source chunk. Use pgvector plus FTS search once a project passes about 100 sources. Basic Memory's observation/relation syntax is a ready-made schema for "structured project knowledge".

### Gaps
- No independent study measures LLM-wiki accuracy drift or team-scale outcomes. Karpathy's own claims are unbenchmarked.
- Team features and pricing for Tana, Capacities and Mem Teams are thinly documented. No reliable source covers large-team (>50 user) Obsidian deployments.

## Q5. Lessons GEM AI should copy or avoid (derived from Q1–Q4)

### Takeaway
Copy: permission-mirrored hybrid index with canonical identities; indexed plus federated connector modes; an asynchronous relationship graph summarized into embeddable bundles; verified/stale trust tiers with owners and review intervals; scoped, visible, editable memories with an audit trail; an LLM-maintained project wiki with lint and review gates. Avoid: flattening source ACLs (Writer), auto-injected global chat profiles (early ChatGPT), memory outside retention and audit (Copilot), unreviewed memory writes from untrusted content (SpAIware and the 2026 Claude attack), many raw MCP tools in context (Dropbox), and indexing everything before oversharing is cleaned up (Copilot rollouts).

### Cited Findings
- ACL carried with every indexed item and trimmed at query time — [Microsoft Learn connectors](https://learn.microsoft.com/en-us/microsoft-365/copilot/connectors/overview); [Glean docs](https://docs.glean.com/security/knowledge-graph); [Moveworks docs](https://docs.moveworks.com/ai-assistant/enterprise-search/overview)
- Identity sync faster than content sync; incremental syncs miss deletions — [Google docs](https://docs.cloud.google.com/gemini/enterprise/docs/introduction-to-connectors-and-data-stores); group-membership lag until identity refresh — [Coveo docs](https://docs.coveo.com/en/1719/)
- Canonical person ID, asynchronous graph, knowledge bundles, super-tool over MCP, LLM-as-judge with DSPy — [Dropbox Tech](https://dropbox.tech/machine-learning/vp-josh-clemm-knowledge-graphs-mcp-and-dspy-dash)
- Verifier plus interval plus auto-unverify — [Guru help](https://help.getguru.com/docs/verifying-and-unverifying-cards)
- Project-scoped memory, editable summary, incognito, admin disable — [Anthropic](https://claude.com/blog/memory); memory citations and audit logging — [Glean docs](https://docs.glean.com/administration/assistant/configuration/memory-personalization)
- Copilot memory: no retention-policy coverage, no audit log, no admin category restriction — [Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-365/copilot/copilot-personalization-memory)
- Source permissions dropped in a shared graph — [Writer help](https://support.writer.com/articles/4599542578-setting-up-knowledge-graph-data-connectors)
- Memory poisoning — [Embrace The Red 2024](https://embracethered.com/blog/posts/2024/chatgpt-macos-app-persistent-data-exfiltration/); [Embrace The Red 2026](https://embracethered.com/blog/posts/2026/breaking-opus-4.7-with-chatgpt/)
- Oversharing delays — [Infosecurity Magazine](https://infosecurity-magazine.com/news/microsoft-copilot-delayed-over)
- LLM-wiki operations and scale limit — [Karpathy gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)

### Inferences
- How the brain "decides what is worth keeping", combining the patterns above:
  1. Score each candidate fact or document by usage (views, citations in answers), authority (author role, verified status), recency and duplication (merge near-duplicates so authority isn't split).
  2. Promote durable items (decisions, specs, standards, project facts) into curated project or org knowledge with owner and verifier fields and a review interval.
  3. Let unused, unverified items age out of ranking. Glean's learned memories similarly "age out gradually".
  4. Never auto-promote content that came from untrusted retrieved text without human confirmation.
- Chat and agents should call one permission-aware "brain search" tool (plus a read-only memory tool) instead of reading raw chat history, consistent with the Dropbox super-tool finding and Claude's model-invoked recall.

### Gaps
- No public product documents a complete "what to keep" policy end to end. The recipe above is a synthesis, not a vendor-proven design.

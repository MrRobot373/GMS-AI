# Agent memory frameworks as candidates for the GEM AI "organization brain" (state as of 24 Oct 2026)

Method note for the report writer: most facts come from primary sources fetched on 24 Oct 2026: GitHub READMEs and source files read at `HEAD` through raw.githubusercontent.com, official docs, PyPI/npm registry metadata, and vendor blogs and papers. GitHub star counts and release tags were read from the shields.io GitHub badge API on 24 Oct 2026, because direct GitHub API access was blocked in this environment. Star counts are rounded (for example "68k"). Every benchmark number below is self-reported by the vendor unless it is marked otherwise.

## System-by-system profiles (what it is, memory model, storage, SDKs, license, maturity, fit)

### Takeaway
The field changed a lot between mid-2025 and Oct 2026, so earlier summaries are out of date:
- Mem0 OSS dropped its ADD/UPDATE/DELETE algorithm and its graph memory. It now does single-pass ADD-only extraction plus hybrid retrieval, and its self-hosted server runs on Postgres/pgvector only.
- Zep Community Edition is dead. Zep is cloud or BYOC only, and Graphiti still requires Neo4j, FalkorDB or Neptune.
- Letta retired its V1 Postgres API server in favour of the git-backed "Letta Code" harness.
- LangMem has stalled: its last PyPI release was Oct 2025.
- Two newer systems fit GEM AI's Postgres-only, local-model constraints best: Hindsight (MIT, Postgres+pgvector, TS client) and the Mem0 OSS server. TencentDB Agent Memory (MIT, Node 22, ships a DeepSeek Harness adapter, team ACLs) has the closest product concept, but it stores data in SQLite or MongoDB.

### Cited Findings

#### Maturity snapshot (shields.io / PyPI / npm, read 24 Oct 2026)
| Repo | Stars | Latest release | License (per repo) |
|---|---|---|---|
| mem0ai/mem0 | 68k | v2.2.1 (PyPI 2026-09-25); npm `mem0ai` 3.3.1 (2026-09-25) | Apache-2.0 |
| getzep/graphiti | 32k | v0.31.2 (PyPI 2026-10-20) | Apache-2.0 |
| getzep/zep (now examples/integrations only) | 5k | zep-ingest-v0.4.0 (Oct 2026); SDK `zep-cloud` 4.0.1 (2026-10-20) | Apache-2.0 |
| letta-ai/letta (points to letta-code) | 25k | v0.16.8 (May 2026); npm `@letta-ai/letta-code` 0.34.23 (2026-10-23) | Apache-2.0 |
| langchain-ai/langmem | 1.7k | no GitHub releases; PyPI 0.0.30 (2025-10-27) | MIT |
| topoteretes/cognee | 33k | v1.6.6rc1 (Oct 2026); PyPI 1.6.5 (2026-10-16) | Apache-2.0 (Postgres-graph production version is licensed separately) |
| MemTensor/MemOS | 12k | v2.0.34 (Sep 2026); PyPI `MemoryOS` 2.0.33 (2026-09-03) | Apache-2.0 |
| TencentCloud/TencentDB-Agent-Memory | 30k | v2.0.3-beta.1 (Oct 2026); npm `@tencentdb-agent-memory/memory-tencentdb` 1.0.3 (2026-09-22) | MIT |
| vectorize-io/hindsight | 53k | v1.1.0 (PyPI `hindsight-api` 2026-10-21) | MIT |
| supermemoryai/supermemory | 31k | server-v0.0.9 (Oct 2026); npm `supermemory` 5.0.2 | MIT (repo); server binary closed |
| EverMind-AI/EverMemOS (now "EverOS") | 14k | v1.5.1 (PyPI `everos` 2026-10-22) | Apache-2.0 |
| GibsonAI/Memori (MemoriLabs) | 17k | v3.3.6 (PyPI 2026-05-28) | Apache-2.0 per README |
| NevaMind-AI/memU | 15k | v2.0.0-beta.0 (Jul 2026); `memu-cli` 0.10.0 (2026-08-05) | Apache-2.0 per badge |
| plastic-labs/honcho | 7.8k | v3.4.0; SDK 2.7.0 (2026-10-22) | AGPL-3.0 (server) |
| MemMachine/MemMachine | 3.1k | v0.4.0 (2026-10-08) | Apache-2.0 |
| memodb-io/memobase | 2.9k | PyPI 0.0.27 (2025-11-08); last commit Jan 2026 | Apache-2.0 |
| Mirix-AI/MIRIX | 3.5k | v0.1.6 (Dec 2025); PyPI 0.1.7 (2026-02-01); last commit Aug 2026 | Apache-2.0 |
| basicmachines-co/basic-memory | 4.3k | v0.24.1 (2026-10-23) | AGPL-3.0 |
| khoj-ai/khoj | 38k | v2.0.0-beta.28 (Mar 2026); last commit Aug 2026 | AGPL-3.0 |
| neuml/txtai | 13k | v9.14.0 (2026-10-06) | Apache-2.0 |
| CaviraOSS/OpenMemory (renamed "LongMemory") | 4.5k | npm `longmemory` 1.3.3 (2026-08-31) | Apache-2.0 (per shields) |
| BAI-LAB/MemoryOS | 1.6k | V1.2 (Jul 2025) | Apache-2.0 |
| mindverse/Second-Me | 16k | v1.0.1 (May 2025); last commit Sep 2025 | Apache-2.0 |
| agiresearch/A-mem / WujiangXu/A-mem-sys | 1.2k / 404 | no releases; last commit Dec 2025 / Nov 2025 | MIT |
| kingjulio8238/Memary | 2.7k | v0.1.5 (Oct 2024), inactive | MIT |
| getmetal/motorhead | 916 | v3.0.2 (Dec 2023), DEPRECATED | Apache-2.0 |
| redis/agent-memory-server | 323 | server/v0.15.2 (2026-04-10) | Apache-2.0 per README |
| mastra-ai/mastra (`@mastra/memory`) | 29k | `@mastra/memory` 1.39.0 (2026-10-21) | Apache-2.0 + `ee/` enterprise license |
| agentscope-ai/ReMe | 3.7k | v0.4.1.13 (Oct 2026) | Apache-2.0 |
| zjunlp/LightMem | 1.2k | no releases; last commit Sep 2026 | MIT |
| microsoft/kernel-memory | 2.2k | May 2025; now "archived research project" | MIT |

Sources: [shields.io GitHub badge API](https://img.shields.io/github/stars/mem0ai/mem0) (same endpoint pattern for each repo), [PyPI mem0ai](https://pypi.org/project/mem0ai/), [npm mem0ai](https://www.npmjs.com/package/mem0ai), [PyPI langmem](https://pypi.org/project/langmem/), [PyPI graphiti-core](https://pypi.org/project/graphiti-core/), [PyPI cognee](https://pypi.org/project/cognee/), [PyPI hindsight-api](https://pypi.org/project/hindsight-api/), [npm @tencentdb-agent-memory/memory-tencentdb](https://www.npmjs.com/package/@tencentdb-agent-memory/memory-tencentdb), [PyPI memobase](https://pypi.org/project/memobase/), [npm @mastra/memory](https://www.npmjs.com/package/@mastra/memory).

#### Group 1

**Mem0 / OpenMemory (mem0ai)**
- What it is: a memory layer offered three ways: a library (Python `mem0ai`, TS `mem0ai`), a self-hosted server, and a cloud platform. A new CLI (`@mem0/cli` / `mem0-cli`) was added. — [mem0 README](https://github.com/mem0ai/mem0/blob/main/README.md)
- Memory model (OSS v3): flat natural-language memories in a vector store. Each memory is scoped by `user_id`/`agent_id`/`run_id`. A parallel `{collection}_entities` collection is used for entity linking, which needs the `mem0ai[nlp]` extra (spaCy) on Python 3.10–3.12. — [Mem0 OSS v2→v3 migration guide](https://docs.mem0.ai/migration/oss-v2-to-v3)
- Graph memory (Neo4j, Memgraph, Kuzu, Apache AGE, Neptune) was **removed from OSS** and is now Platform-only ("built in and always on, with no external graph database required"). The guide says: "OSS has no graph memory replacement." — [migration guide](https://docs.mem0.ai/migration/oss-v2-to-v3). `mem0/memory/graph_memory.py` returns 404 at HEAD — [repo](https://github.com/mem0ai/mem0)
- Write policy (v3): "Single-pass ADD-only (one LLM call, no UPDATE/DELETE)". `add()` now "Returns `ADD` only", and memories accumulate while retrieval ranks current information first. The old algorithm used 2 LLM calls: fact extraction, then an ADD/UPDATE/DELETE/NONE decision against similar memories. — [migration guide](https://docs.mem0.ai/migration/oss-v2-to-v3)
- `ADDITIVE_EXTRACTION_PROMPT` (in the source as "Ported from platform/backend/shared/core/config/prompts.py") does the following:
  - extracts from BOTH user and assistant messages;
  - takes as context a profile summary, up to 20 "Recently Extracted Memories" (the "primary deduplication reference"), "Existing Memories" (for dedup and linking only), and the last 20 messages;
  - skips facts that are "semantically equivalent to an Existing Memory with no meaningful new context";
  - returns `linked_memory_ids` for related or updated memories, including an "updated/shifted preference";
  - resolves relative dates against an "Observation Date".
  The legacy `DEFAULT_UPDATE_MEMORY_PROMPT` with ADD/UPDATE/DELETE/NONE is still in the file. — [mem0/configs/prompts.py](https://github.com/mem0ai/mem0/blob/main/mem0/configs/prompts.py)
- Retrieval: semantic + BM25 keyword + entity-match boost, fused into one score. BM25 "is a boost signal, not a recall expander". New defaults are top_k 20, threshold 0.1, rerank off. — [migration guide](https://docs.mem0.ai/migration/oss-v2-to-v3)
- Decay and temporal features appear to be Platform-only. In OSS, `decay=True` raises `ValueError(get_decay_feature_error_message(...))`. — [mem0/memory/main.py](https://github.com/mem0ai/mem0/blob/main/mem0/memory/main.py). Mem0 published posts on memory decay (8 May 2026) and temporal reasoning (12 May 2026). — [mem0.ai/research](https://mem0.ai/research)
- Storage: 15 vector stores, with pgvector among them (Python `mem0/vector_stores/pgvector.py` and TS `mem0-ts/src/oss/src/vector_stores/pgvector.ts`). — [repo files](https://github.com/mem0ai/mem0/blob/main/mem0-ts/src/oss/src/vector_stores/pgvector.ts)
- The self-hosted server's docker-compose uses only `pgvector/pgvector:pg17` (PostgreSQL 17, pgvector 0.8.0). It stores both memories and `mem0_app` auth/config in Postgres. Auth is on by default (`ADMIN_API_KEY`, admin wizard), and `AUTH_DISABLED=true` is for local dev only. — [server/README.md](https://github.com/mem0ai/mem0/blob/main/server/README.md), [server/docker-compose.yaml](https://github.com/mem0ai/mem0/blob/main/server/docker-compose.yaml)
- Breaking API changes in v3:
  - entity IDs must go inside `filters` for search/get_all;
  - `custom_fact_extraction_prompt` became `custom_instructions`, and `custom_update_memory_prompt` is deprecated;
  - the Python client lost `org_id` and `project_id` params.
  — [migration guide](https://docs.mem0.ai/migration/oss-v2-to-v3)
- OpenMemory status is uncertain: `openmemory/README.md` returns 404 at HEAD. A (possibly stale) jsDelivr file listing still showed `openmemory/api/...` files. I could not confirm whether OpenMemory was removed or moved. — [repo](https://github.com/mem0ai/mem0)
- Benchmarks (self-reported):
  - New algorithm: LoCoMo 92.5 (old 71.4), LongMemEval 94.4 (old 67.8), BEAM-1M 64.1, BEAM-10M 48.6, about 7K tokens per retrieval, p50 latency 0.88–1.09 s. The README states: "Scores reflect Mem0's managed platform, which includes proprietary optimizations not available in the open-source SDK; open-source users should expect directionally similar gains but not identical numbers." — [mem0 README](https://github.com/mem0ai/mem0/blob/main/README.md)
  - The OSS migration guide gives LoCoMo 71.4→91.6 and LongMemEval 67.8→93.4. — [migration guide](https://docs.mem0.ai/migration/oss-v2-to-v3)
  - The research page (dated 23 Oct 2026) names the 16 Apr 2026 "token-efficient algorithm" post, says extraction "collapses to one LLM call that only adds", and does not name the models used. — [mem0.ai/research](https://mem0.ai/research)
  - The eval framework is open-sourced at [mem0ai/memory-benchmarks](https://github.com/mem0ai/memory-benchmarks) (per the README).
- 2025 paper ([arXiv 2504.19413](https://arxiv.org/abs/2504.19413)): Mem0 scored 66.88% and Mem0-graph 68.44% LLM-judge J on LoCoMo, and the paper reported Zep at 65.99%. These figures are confirmed via the Zep rebuttal, [Zep blog](https://www.getzep.com/blog/lies-damn-lies-statistics-is-mem0-really-sota-in-agent-memory/).

**Zep (getzep) — commercial**
- Zep is now the managed "unified context layer for enterprises". The getzep/zep repo "is **not** Zep's product". It holds examples, integrations, the `zep-ingest` bulk ingestion pipeline (Slack, documents, email, JSON/CSV, fact triples), an ontology, and a `benchmarks/` folder (LoCoMo, LongMemEval). **Zep Community Edition is deprecated/unsupported** and lives in `legacy/`. SDKs exist for Python, TypeScript (`@getzep/zep-cloud`) and Go. — [getzep/zep README](https://github.com/getzep/zep/blob/main/README.md)
- Zep runs on "Konig", Zep's own graph database service, so no third-party graph DB is required. It is deployed "Fully managed or in your cloud (BYOC)". — [Graphiti README](https://github.com/getzep/graphiti/blob/main/README.md)
- Pricing:
  - Free: 10k credits.
  - Flex: $125/mo for 50k credits.
  - Flex Plus: $375/mo for 200k credits.
  - Enterprise: custom.
  Deployment is Cloud, Cloud+BYOK, or BYOC ("Deploy Zep inside your VPC"). **No on-premises option is mentioned.** Zep is SOC 2 Type II, and HIPAA BAAs come with Enterprise. — [Zep pricing](https://www.getzep.com/pricing)
- Paper ([arXiv 2501.13956](https://arxiv.org/abs/2501.13956), Jan 2025): temporal knowledge graph with episodes, entities, facts and communities. It reported DMR 94.8% vs MemGPT 93.4%, and LongMemEval gains of up to 18.5% with about 90% lower latency. These figures are from my background knowledge of the paper; the abstract was not re-fetched this session.

**Graphiti (getzep) — open source**
- Graphiti is a Python framework for "temporal context graphs":
  - Entities (nodes) have evolving summaries.
  - Facts (edges) carry validity windows.
  - Episodes hold raw provenance.
  - Custom Pydantic ontology is supported.
  - The design is bi-temporal: contradicted facts are "invalidated — not deleted".
  - Retrieval is hybrid: semantic + BM25 + graph traversal, without LLM summarization at query time.
  — [Graphiti README](https://github.com/getzep/graphiti/blob/main/README.md)
- Storage: Neo4j 5.26, FalkorDB 1.1.2 (also embedded `falkordblite`), or Amazon Neptune (+ OpenSearch for full text). Kuzu is **deprecated** because "upstream Kuzu project is no longer maintained". **There is no Postgres backend.** — [Graphiti README](https://github.com/getzep/graphiti/blob/main/README.md)
- Models: OpenAI by default. Anthropic, Gemini and Groq are supported, and "local servers (Ollama, vLLM, llama.cpp, LM Studio) — may be used via their OpenAI-compatible endpoints". — [Graphiti README](https://github.com/getzep/graphiti/blob/main/README.md)
- Write path per `add_episode`, from the source:
  1. `extract_nodes` (LLM)
  2. `resolve_extracted_nodes` (dedupe)
  3. `extract_edges` (LLM)
  4. `resolve_extracted_edges`, which searches related edges and invalidation candidates and then calls the LLM `resolve_edge` prompt. That prompt returns `duplicate_facts` and `contradicted_facts` and says "NEVER mark facts as contradicted unless the new fact explicitly makes the old fact false".
  5. `_apply_temporal_invalidation`, which expires contradicted edges.
  6. `extract_attributes_from_nodes` (LLM summaries/attributes)
  7. optional `update_communities`
  — [graphiti_core/graphiti.py](https://github.com/getzep/graphiti/blob/main/graphiti_core/graphiti.py), [edge_operations.py](https://github.com/getzep/graphiti/blob/main/graphiti_core/utils/maintenance/edge_operations.py), [prompts/dedupe_edges.py](https://github.com/getzep/graphiti/blob/main/graphiti_core/prompts/dedupe_edges.py)
- Tenancy and security: data is partitioned only by `group_id`. The reference MCP/REST servers "have no authentication, no authorization, and no prompt-injection protection… Any caller can read, change, or delete data in any `group_id`". For production, "Your service must supply authentication, authorization, tenant isolation, and input controls". — [Graphiti README](https://github.com/getzep/graphiti/blob/main/README.md)

**Letta (formerly MemGPT)**
- The letta-ai/letta repo now says "The current source code lives in `letta-ai/letta-code`". The **"retired Letta V1 API server"** (the Postgres-backed server) sits on an `archive` branch, and its tags remain only "for reproducibility". — [letta README](https://github.com/letta-ai/letta/blob/main/README.md)
- Letta Code (Apache-2.0, npm `@letta-ai/letta-code`) is "a stateful agent harness". It provides:
  - memory blocks;
  - **MemFS**: "All context (including memory blocks) is tracked via git", which can sync to a GitHub repo;
  - skills;
  - sleep-time compute, renamed "dreaming", plus `/reflect`;
  - `letta server` for local/self-hosted agents;
  - Letta Cloud stores memory, identity and conversations;
  - a TypeScript "Letta Agent SDK".
  — [letta-code README](https://github.com/letta-ai/letta-code/blob/main/README.md), [src/agent/memory-filesystem.ts](https://github.com/letta-ai/letta-code/blob/main/src/agent/memory-filesystem.ts) ("With git-backed memory, most sync/hash logic is removed")
- Write policy: the agent self-edits its own memory (MemGPT design, [arXiv 2310.08560](https://arxiv.org/abs/2310.08560)). Agents "programmatically rewrite their context". Background "dreaming" agents also reflect. — [letta-code README](https://github.com/letta-ai/letta-code/blob/main/README.md)
- Benchmarks: a Letta agent with only filesystem tools scored **74.0% on LoCoMo with GPT-4o mini** vs Mem0's reported 68.5% (12 Aug 2025). Letta said current memory benchmarks "may not be very meaningful" because they mostly measure retrieval. — [Letta blog](https://www.letta.com/blog/benchmarking-ai-agent-memory)

**LangMem (LangChain)**
- Python library. Memory types:
  - semantic, stored as a "collection" or a "profile";
  - episodic, as few-shot examples or summaries;
  - procedural, as prompt rules optimized with `max_reflection_steps`.
- Each operation: "Prompt an LLM to determine how to expand or consolidate the memory state". Collections must "reconcile new information… _deleting_/_invalidating_ or _updating_/_consolidating_". The guide notes that recall should combine similarity with "importance" and "strength".
- Formation can be "active" (hot path) or "background" (between interactions).
  — [LangMem conceptual guide](https://github.com/langchain-ai/langmem/blob/main/docs/docs/concepts/conceptual_guide.md)
- Storage: LangGraph `BaseStore`. Production should use `AsyncPostgresStore` (Postgres + pgvector index) — [LangMem README](https://github.com/langchain-ai/langmem/blob/main/README.md)
- Maturity: the last PyPI release is 0.0.30 (27 Oct 2025), and there are no GitHub releases. — [PyPI langmem](https://pypi.org/project/langmem/)
- The Mem0 paper reported LangMem far behind on LoCoMo latency and accuracy (about 58% J). This is from my background knowledge of [arXiv 2504.19413](https://arxiv.org/abs/2504.19413) and should be verified.

**Cognee (topoteretes)**
- "Free open-source AI memory platform" that turns "documents, code, and conversations into a self-hosted knowledge graph". It has a TypeScript SDK, an MCP server, a UI, and local Ollama support. v1.6.0 (18 Sep 2026) added "build and search text memory with local models and no cloud LLM key". v1.6.1 (24 Sep 2026) added Google Drive/Gmail connectors. Operations include add/cognify/search/`forget`. — [cognee README](https://github.com/topoteretes/cognee/blob/main/README.md)
- Write pipeline (`cognify`): classify documents → chunk → `extract_graph_and_summarize` (LLM entity/relationship extraction + summaries, ontology resolver optional) → `add_data_points`. Since 1.6.3, dates are extracted as Timestamp nodes, `temporal_cognify` is deprecated, and TEMPORAL search reranks by date. — [cognify.py](https://github.com/topoteretes/cognee/blob/main/cognee/api/v1/cognify/cognify.py)
- Postgres: "Since cognee 1.0 you can run the entire memory layer on a single Postgres instance", with a caveat: "**Using Postgres as a graph store is currently released as a demo feature. The production-ready version is available as a licensed product.**" (open-core split). — [cognee README](https://github.com/topoteretes/cognee/blob/main/README.md)
- Access control: "without [ENABLE_BACKEND_ACCESS_CONTROL=false] the API defaults to multi-tenant mode and every `/api/v1` call requires an authenticated user". — [cognee README](https://github.com/topoteretes/cognee/blob/main/README.md). The permission model has dataset permissions `["read","write","delete","share"]` plus tenant-scoped capabilities (`manage_users`, `grant_capabilities`, `revoke_capabilities`), along with principals, roles and tenants. A legacy quirk: any role named "admin" passes every capability check. — [permission_types.py](https://github.com/topoteretes/cognee/blob/main/cognee/modules/users/permissions/permission_types.py)
- Benchmarks (self-reported): BEAM 100K = 0.79 (20 questions from one held-out conversation, 4 rounds); BEAM 10M = 0.67 ("exploratory"). The README warns these use "benchmark-specific data formatting, prompts, and retrieval configuration". — [cognee README](https://github.com/topoteretes/cognee/blob/main/README.md)

**MemOS (MemTensor)**
- "Memory Operating System" with KB, multimodal, tool memory, skill memory and asynchronous ingestion via MemScheduler. There are four entry points:
  - Cloud API;
  - Self-Host, which needs **Neo4j + Qdrant**;
  - Cloud Plugin;
  - Local Plugin (SQLite, FTS5 + vector), which installs into **DeepSeek Harness**, OpenClaw or Hermes. The DSH target "installs it as an out-of-tree DSH bundle".
  License is Apache-2.0. — [MemOS README](https://github.com/MemTensor/MemOS/blob/main/README.md)
- Memory organization (tree text memory):
  - WorkingMemory (capacity 20), LongTermMemory (1500) and UserMemory (480) nodes;
  - extra types: ToolSchema, ToolTrajectory, RawFile, Skill and Preference memory;
  - similarity `threshold` 0.80 and `merged_threshold` 0.92;
  - background reorganizer modules for conflict, redundancy and relation-reasoning detection.
  — [organize/manager.py](https://github.com/MemTensor/MemOS/blob/main/src/memos/memories/textual/tree_text_memory/organize/manager.py), with file names from a jsDelivr listing of [MemOS repo](https://github.com/MemTensor/MemOS)
- Benchmarks (self-reported, 2 Jul 2026): LoCoMo 88.83, LongMemEval 89.20, PersonaMem v2 40.58, BEAM-10M 56.75. MemOS claims to lead "OmniMemEval", which MemTensor describes as covering 14 commercial memory products. — [MemOS README](https://github.com/MemTensor/MemOS/blob/main/README.md). Paper: [arXiv 2507.03724](https://arxiv.org/abs/2507.03724).

**TencentDB Agent Memory (TencentCloud)**
- MIT license ("Copyright (C) 2026 Tencent"), Node ≥ 22.16. It has three services: `memory-core` (port 8420), `memory-hub` (panel 8125) and `proxy` (8096, Anthropic/OpenAI dual protocol). Integration is "zero-code": point the agent's base URL at the proxy. **DeepSeek Harness** is listed first among supported agents, alongside Claude Code, Codex, CodeBuddy, WorkBuddy, Hermes and OpenClaw. — [README](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/main/README.md), [LICENSE](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/main/LICENSE), [INSTALL.md](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/main/INSTALL.md)
- Memory model:
  - L0 Conversation (raw) → L1 Atom (facts/preferences/constraints/events; types episodic/persona/instruction, versioned) → L2 Scenario (project/scenario knowledge files) → L3 Core/Persona (`persona.md`).
  - Plus Skills (versioned, with trigger boundaries and validation rules), Wiki (documents → structured pages with a link graph, "Inspired by Karpathy's LLM knowledge base"), and CodeGraph (symbols, call graph, impact paths).
  - Retrieval: L2/L3 bootstrap; "when specific facts are needed, BM25 + vector retrieval + RRF fall back to L1/L0", capped by count, characters and timeout.
  - Writes: an L0 write triggers an async L1 extraction pipeline, and the higher layers are refined asynchronously.
  — [README](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/main/README.md), [MemoryCore v3 API doc](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/main/MemoryCore/v3-api-memorycore-doc.md)
- Storage: "The default storage backend is sqlite". MongoDB (with mongot BM25) is "experimental, off by default", and switching backends "does not migrate existing data". **There is no Postgres backend.** — [INSTALL.md](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/main/INSTALL.md)
- Models: the memory LLM is configured via `MEMORY_LLM_BASE_URL` / `_MODEL` (OpenAI-compatible), and knowledge uses `LLM_MODE=custom` with `LLM_BASE_URL`. — [INSTALL.md](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/main/INSTALL.md)
- Access control:
  - visibility levels `private` ("not even team admins"), `team`, `restricted` (User/Role/Agent ACL) and `agent`;
  - a global System Admin plus team Admin/Member roles;
  - an asset Owner;
  - "Fixed Binding + ACL" decides which assets an agent can use.
  — [README](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/main/README.md)
- Caveat from the core API doc: delete endpoints such as `conversation/delete` and `atomic/delete` "trust Bearer + `x-tdai-service-id`, no user-level auth" (translated from Chinese). — [MemoryCore v3 API doc](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/main/MemoryCore/v3-api-memorycore-doc.md)
- Maturity:
  - Team Memory was launched 13 Aug 2026. Tencent's own press release claims 20k stars in 90 days; shields.io shows 30k now. — [press release](https://www.aap.com.au/aapreleases/cision20260813ae25659/)
  - The ROADMAP says the current release is v2.0.1-beta.1 and lists items still to come: agent templates, "Editable memories: L1 - L3", and more. — [ROADMAP.md](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/main/ROADMAP.md)
  - Its notes say "fully automated memory routing is still under iteration" and that CodeGraph "prioritizes public HTTPS repositories". — [README](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/main/README.md)
- Benchmark (self-reported): PersonaMem 48% → 76% with memory enabled. — [README](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/main/README.md)

#### Group 2 and other notable 2025–2026 systems

**Hindsight (vectorize-io)**
- MIT license, 53k stars. Memory types:
  - world facts and experiences;
  - "observations": background-consolidated, deduplicated beliefs that keep "supporting evidence with exact quotes and a proof count" and are "*refined* rather than overwritten";
  - "mental models" and knowledge pages: standing answers rewritten in the background, read without any LLM call.
- Operations are retain/recall/reflect. Retain "uses an LLM to extract key facts, temporal data, entities, and relationships" and normalizes them into canonical entities and time series. Recall runs semantic, BM25, graph and temporal retrieval in parallel, then applies RRF + a cross-encoder rerank.
- Banks are "isolated memory store[s]… strict: no cross-bank leakage". Configuration is hierarchical (global → per-tenant → per-bank), with tenant/auth/storage extension points. Memory Defense redacts PII/secrets (45 patterns).
- Storage: "PostgreSQL + pgvector, or Oracle AI Database 23ai", plus an embedded pg0 option.
- Models: 25+ LLM providers including Ollama, LM Studio, llama.cpp and "any OpenAI-compatible endpoint".
- SDKs: Python, Node/TS (`@vectorize-io/hindsight-client`), Go, CLI and MCP.
- The README claims "used in production at Fortune 500 enterprises".
  — [Hindsight README](https://github.com/vectorize-io/hindsight/blob/main/README.md)
- Benchmarks (self-reported, models and dates not shown): LongMemEval-S 94.6%, LoCoMo10 92%, PersonaMem-32K 86.6%, BEAM 100K 75%, BEAM 1M 73.9%, BEAM 10M 64.1%. — [benchmarks.hindsight.vectorize.io](https://benchmarks.hindsight.vectorize.io/). The README says results were "independently reproduced by research collaborators at the Virginia Tech Sanghani Center… and The Washington Post. Other scores are self-reported by software vendors." — [README](https://github.com/vectorize-io/hindsight/blob/main/README.md). Paper: [arXiv 2512.12818](https://arxiv.org/abs/2512.12818).

**Supermemory**
- Extracts facts, builds user profiles, "handles knowledge updates and contradictions, forgets expired information". It provides RAG, connectors and file processing, with TS/Python SDKs (`supermemory`) and Vercel AI SDK/Mastra wrappers. — [README](https://github.com/supermemoryai/supermemory/blob/main/README.md)
- Self-hosting: a single binary or Docker image (server-v0.0.9) with OpenAI-compatible LLMs and Ollama (`gpt-oss:20b`), plus local `bge-base` embeddings. — [README](https://github.com/supermemoryai/supermemory/blob/main/README.md)
- Limits of the self-hosted version: "The server binary is not open source"; it is "free within its lite license limit"; the storage is an unnamed embedded engine; connectors and MCP are platform-only; and the platform uses "proprietary long-horizon models" for extraction. — [Supermemory self-hosting docs](https://supermemory.ai/docs/self-hosting/overview)
- Benchmark claims: "#1" on LongMemEval, LoCoMo and ConvoMem, with "95% Recall@15" on LongMemEval at about 720 tokens. Note this is a recall metric, not QA accuracy. — [README](https://github.com/supermemoryai/supermemory/blob/main/README.md)

**Memobase**
- User-profile memory (topic/sub_topic profile + event timeline). Built on FastAPI + **Postgres + Redis**, with Python/Node/Go SDKs and an Ollama tutorial.
- Writes are batched: per-user buffers flush at about 1024 tokens or after 1 hour idle, so there is no hot-path memorization.
- Since v0.0.40 the "number of LLM calls in a single run [went] from approximately 3-10 times to a fixed 3 times", cutting token cost by about 40-50%.
  — [Memobase readme](https://github.com/memodb-io/memobase/blob/main/readme.md)
- The merge prompt chooses APPEND / UPDATE (on conflict, also simplifying the memo) / ABORT. — [merge_profile.py](https://github.com/memodb-io/memobase/blob/main/src/server/api/memobase_server/prompts/merge_profile.py)
- Activity: last PyPI release Nov 2025, last commit Jan 2026 (shields.io).

**MIRIX**
- Six memory components (Core, Episodic, Semantic, Procedural, Resource, Knowledge Vault), each managed by a dedicated agent, with screen capture and "PostgreSQL-native BM25 full-text search with vector similarity". Docker backend with API keys; Python client. — [MIRIX README](https://github.com/Mirix-AI/MIRIX/blob/main/README.md)
- Paper: [arXiv 2507.07957](https://arxiv.org/abs/2507.07957). The paper reports LoCoMo of about 85% with gpt-4.1-mini and a ScreenshotVQA gain; this is from background knowledge and was not re-verified this session.

**A-MEM**
- Zettelkasten-style notes (keywords, tags, context) with LLM-generated links and "memory evolution", where new notes update related notes' attributes. Stored in ChromaDB. Research code. — [A-mem README](https://github.com/agiresearch/A-mem/blob/main/README.md), [arXiv 2502.12110](https://arxiv.org/abs/2502.12110)

**Basic Memory**
- AGPL-3.0. Markdown files plus an index: "Hybrid full-text + vector ranking with FastEmbed embeddings, on SQLite or Postgres". Includes MCP, workspaces, importers (Claude/ChatGPT) and a commercial Cloud built on Neon Postgres. — [README](https://github.com/basicmachines-co/basic-memory/blob/main/README.md)

**Khoj**
- AGPL-3.0 personal "second brain" app over PDFs, Markdown, Word, Notion and org files. Last release Mar 2026, last commit Aug 2026. — [README](https://github.com/khoj-ai/khoj/blob/master/README.md)

**txtai**
- Apache-2.0 embeddings database and LLM workflow framework that embeds text, documents, audio, images and video. It is a building block, not a memory policy engine. — [README](https://github.com/neuml/txtai/blob/master/README.md)

**Motorhead**
- "DEPRECATED… Support is no longer maintained." — [README](https://github.com/getmetal/motorhead/blob/main/README.md)

**MemoryOS (BAI-LAB)**
- OS-style short-, mid- and long-term personal memory. It reports LoCoMo F1 +49.11% and BLEU-1 +46.18%. The last release was Jul 2025. — [README](https://github.com/BAI-LAB/MemoryOS/blob/main/README.md)

**Second Me**
- "Locally trained and hosted" personal AI identity (trains a personal model). Apache-2.0. Inactive since Sep 2025. — [README](https://github.com/mindverse/Second-Me/blob/master/README.md)

**Memary**
- Knowledge-graph memory on Neo4j using LlamaIndex. Inactive since Oct 2024. — [README](https://github.com/kingjulio8238/Memary/blob/main/README.md)

**Honcho (Plastic Labs)**
- Server is AGPL-3.0; SDKs are Apache-2.0 (Python, TS `@honcho-ai/sdk`).
- Data model: workspaces → peers → sessions → messages. A background "deriver" builds per-peer representations, and a chat endpoint answers natural-language queries. `session.upload_file` imports documents.
- Storage: **PostgreSQL + pgvector**, with Redis optional.
- Claims to define "the Pareto Frontier of Agent Memory" (evals page).
  — [Honcho README](https://github.com/plastic-labs/honcho/blob/main/README.md)

**MemMachine**
- Apache-2.0. Uses "Graph database (Neo4j) for episodic memory, SQL for profiles", with Python/TS SDKs, MCP and Ollama. — [README](https://github.com/MemMachine/MemMachine/blob/main/README.md)

**Memori (MemoriLabs)**
- Apache-2.0 per its README. It now centers on Memori Cloud, with separate "BYODB" docs. It reports LoCoMo 87% at 721 tokens/query ([arXiv 2603.19935](https://arxiv.org/abs/2603.19935)). TS SDK `@memorilabs/memori`. — [README](https://github.com/GibsonAI/Memori/blob/main/README.md)

**memU**
- Memory store is SQLite or `postgres` with pgvector ("concurrent access, large stores"), and it has adapters for OpenClaw and Hermes. — [README](https://github.com/NevaMind-AI/memU/blob/main/README.md)

**EverOS (formerly EverMemOS)**
- Apache-2.0. Uses "Markdown + SQLite + LanceDB; no MongoDB, Elasticsearch, or Redis required", with offline "memory evolution" and image/PDF/office ingestion. — [README](https://github.com/EverMind-AI/EverMemOS/blob/main/README.md)

**LongMemory (formerly CaviraOSS OpenMemory)**
- A TypeScript engine ("Hydrograph"):
  - storage: SQLite;
  - scopes: "project, tenant, user, team, role, agent, task, and framework scope are enforced";
  - immutable memories with deterministic decay and "reconsolidation";
  - "Strict recall" with contradiction/grounding gates;
  - connectors.
  — [README](https://github.com/CaviraOSS/OpenMemory/blob/main/README.md)

**Redis Agent Memory Server**
- Session memory with TTL, plus background extraction and promotion to long-term memory. It published a "best-effort LongMemEval comparison across a sweep of memory systems, on a shared answer model and judge". — [README](https://github.com/redis/agent-memory-server/blob/main/README.md)
- Redis's June 2026 write-up (gpt-4o answer model and judge) reports Mastra "Observational Memory" at 84.2% on LongMemEval-S and its own best configuration at 86.1%. It calls the chart "broad context rather than a controlled head-to-head ranking". — [Redis research](https://redis.github.io/redis-ai-research-public/longmemeval-agent-memory/)

**Mastra memory**
- TypeScript (`@mastra/memory`), Apache-2.0 with `ee/` source-available enterprise code. It provides conversation history and RAG context management. — [Mastra README](https://github.com/mastra-ai/mastra/blob/main/README.md)

**ReMe (AgentScope)**
- "Memory as File": Markdown with wikilinks, BM25 + optional embeddings. It ships a DeepSeek Harness plugin, `@agentscope-ai/reme-dsh-plugin`. — [README](https://github.com/agentscope-ai/ReMe/blob/main/README.md)

**Microsoft Kernel Memory**
- Now "an archived research project… No support is provided". It offered document ingestion with per-document ownership tags. — [README](https://github.com/microsoft/kernel-memory/blob/main/README.md)

**LightMem (ZJU)**
- MIT research framework. It ships the MemBase evaluation harness (Mar 2026) for Mem0, A-MEM, EverMemOS and LangMem. — [README](https://github.com/zjunlp/LightMem/blob/main/README.md)

### Inferences
- Treat the system names in older (2025) comparison articles as stale. In particular:
  - "Mem0 graph memory with Neo4j" no longer exists in OSS.
  - "Zep CE" is gone.
  - "Letta server on Postgres" is archived.
- Best architectural fits for GEM AI:
  - **Hindsight**: Postgres-only, MIT, TS client, local LLMs, observations/mental models. It is the closest match to "decide what to keep, consolidate, keep evidence".
  - **Mem0 OSS v3 server**: Postgres-only, TS SDK. But its write policy is now ADD-only, and decay/temporal ranking are platform features, so GEM AI would have to build supersession and forgetting itself.
  - **TencentDB Agent Memory**: the best product-concept fit (team memory, Wiki for documents, skills, ACLs, DSH adapter, Node 22, MIT). But it needs SQLite/Mongo, is beta, and is a separate service with its own permission model.
- A Python sidecar would be needed for Hindsight (Python API server), Mem0 server, Cognee, Graphiti, MemOS, Honcho and Memobase. TencentDB, LongMemory and Mastra are Node/TS native.

### Gaps
- I could not open the GitHub web UI or API, so issue trackers, release notes and production-user lists were not reviewed. Star counts come from shields.io only.
- Mem0's newer algorithm posts (16 Apr, 8 May, 12 May, 5 Jun 2026) were only seen as summaries on the research page. The models used for the 92.5/94.4 numbers are not stated.
- I did not verify which LLM-call counts Hindsight's retain and consolidation make per item, or whether Hindsight's per-tenant isolation includes an authentication layer.
- I did not verify txtai's pgvector support or Khoj's storage this session. My background knowledge says Khoj uses Postgres+pgvector (Django); this is unverified.
- I could not confirm whether Mem0 OpenMemory still exists.
- MIRIX, Zep-paper and LangMem numbers in this section partly rely on background knowledge of the papers. They are marked above.

## Which can run fully self-hosted with Postgres/pgvector as the only datastore and OpenAI-compatible local models?

### Takeaway
Only a handful run on Postgres/pgvector alone: Hindsight, the Mem0 OSS server/library (since v3 removed graph), Honcho (Redis optional), MIRIX, memU (Postgres mode) and LangMem via LangGraph's Postgres store. Cognee can do it only in a "demo" mode, because its production Postgres-graph is licensed. Graphiti, Zep, MemOS self-host, TencentDB, Supermemory, EverOS, MemMachine and Letta Code cannot.

### Cited Findings
- **Hindsight** can.
  - Storage: "PostgreSQL + pgvector, or Oracle AI Database 23ai"; Docker with external PostgreSQL; Helm with `postgresql.enabled`.
  - Models: "fully local (`ollama`, `lmstudio`, `llamacpp`), any OpenAI-compatible endpoint"; air-gapped setups are covered in the install guide.
  — [Hindsight README](https://github.com/vectorize-io/hindsight/blob/main/README.md)
- **Mem0 OSS** can. The server compose file contains only `pgvector/pgvector:pg17`. — [server/README.md](https://github.com/mem0ai/mem0/blob/main/server/README.md). Graph DB drivers were removed. — [migration guide](https://docs.mem0.ai/migration/oss-v2-to-v3). Two caveats:
  - The server README still asks for `OPENAI_API_KEY` by default. Whether a local OpenAI-compatible LLM and embedder are configurable there was not verified this session; the library has an OpenAI-compatibility doc (`docs/open-source/features/openai_compatibility.mdx`, file seen in the [repo listing](https://github.com/mem0ai/mem0)).
  - Entity linking needs spaCy (Python).
- **Honcho** can: "PostgreSQL with the pgvector extension… Redis is optional; caching is off by default". The README defaults to OpenAI/OpenRouter keys. — [Honcho README](https://github.com/plastic-labs/honcho/blob/main/README.md)
- **MIRIX** can: "PostgreSQL-native BM25 full-text search with vector similarity". — [MIRIX README](https://github.com/Mirix-AI/MIRIX/blob/main/README.md)
- **memU** can: the `postgres` store uses pgvector. — [memU README](https://github.com/NevaMind-AI/memU/blob/main/README.md)
- **Memobase** nearly can: it needs Postgres **and Redis**. — [Memobase readme](https://github.com/memodb-io/memobase/blob/main/readme.md)
- **LangMem** can through `AsyncPostgresStore`. — [LangMem README](https://github.com/langchain-ai/langmem/blob/main/README.md)
- **Basic Memory** indexes on "SQLite or Postgres" but stores the canonical data as Markdown files. — [README](https://github.com/basicmachines-co/basic-memory/blob/main/README.md)
- **Cognee** runs all on Postgres only as a "demo feature"; "The production-ready version is available as a licensed product". — [cognee README](https://github.com/topoteretes/cognee/blob/main/README.md)
- The rest cannot:
  - **Graphiti**: Neo4j/FalkorDB/Neptune only (Kuzu deprecated). — [Graphiti README](https://github.com/getzep/graphiti/blob/main/README.md)
  - **Zep**: Cloud/BYOC only, with no on-prem mention. — [Zep pricing](https://www.getzep.com/pricing)
  - **MemOS self-host**: "Neo4j + Qdrant". — [MemOS README](https://github.com/MemTensor/MemOS/blob/main/README.md)
  - **TencentDB Agent Memory**: SQLite default, MongoDB experimental. — [INSTALL.md](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/main/INSTALL.md)
  - **Supermemory local**: embedded engine in a closed binary. — [self-hosting docs](https://supermemory.ai/docs/self-hosting/overview)
  - **EverOS**: SQLite + LanceDB. — [README](https://github.com/EverMind-AI/EverMemOS/blob/main/README.md)
  - **MemMachine**: Neo4j + SQL. — [README](https://github.com/MemMachine/MemMachine/blob/main/README.md)
  - **LongMemory**: SQLite. — [README](https://github.com/CaviraOSS/OpenMemory/blob/main/README.md)
- Local/OpenAI-compatible model support is explicitly documented for Graphiti, Cognee (Ollama guide; keyless local mode since v1.6.0), Supermemory local (Ollama `gpt-oss:20b`), TencentDB (`MEMORY_LLM_BASE_URL`), Memobase (Ollama tutorial), MemMachine (Ollama) and Hindsight. — sources as cited in the profiles above.

### Inferences
- If GEM AI requires Postgres 16 + pgvector as the only datastore, the realistic options are Hindsight, Mem0 OSS, Honcho or MIRIX as a sidecar, or building natively in TypeScript by borrowing their algorithms.
- Note that Mem0's server image is PG17 while GEM AI runs PG16. Pointing Mem0 at GEM's existing PG16 should work (pgvector is version-agnostic), but this is untested.
- AGPL (Honcho server, Basic Memory, Khoj) matters if GEM AI is distributed to customers on-prem. MIT/Apache options (Hindsight, Mem0, MIRIX, memU) avoid that.

### Gaps
- I did not confirm Hindsight's exact pgvector/PG version requirements or extension list, or Mem0 server's local-LLM configuration knobs.

## Which have real multi-tenant/organization scoping and access control, and which need GEM AI to enforce permissions itself?

### Takeaway
Cognee, TencentDB Agent Memory and LongMemory have real ACL models. Hindsight has strict bank isolation and tenant extension points. Everything else is scope-by-ID-string: Mem0, Graphiti, LangMem, Memobase and Honcho workspaces/peers. None of them understands GEM AI's per-person/project/workspace SQL permissions, so GEM AI must enforce permissions itself in every case.

### Cited Findings
- **Cognee**: dataset-level read/write/delete/share permissions; tenants, roles and principals; tenant-scoped capabilities; multi-tenant auth on by default. The "admin" role-name legacy bypass is a known quirk. — [permission_types.py](https://github.com/topoteretes/cognee/blob/main/cognee/modules/users/permissions/permission_types.py), [cognee README](https://github.com/topoteretes/cognee/blob/main/README.md)
- **TencentDB Agent Memory**: private/team/restricted (User/Role/Agent ACL)/agent visibility; System Admin and team Admin/Member roles; asset owners. But its core API delete endpoints rely on a service key, not user-level auth. — [README](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/main/README.md), [MemoryCore v3 API doc](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/main/MemoryCore/v3-api-memorycore-doc.md)
- **LongMemory**: "project, tenant, user, team, role, agent, task, and framework scope are enforced". — [README](https://github.com/CaviraOSS/OpenMemory/blob/main/README.md)
- **Hindsight**: banks with "no cross-bank leakage"; per-tenant config; "Tenant, auth and storage extension points". Per-user isolation inside a bank is done via metadata filtering. — [Hindsight README](https://github.com/vectorize-io/hindsight/blob/main/README.md)
- **Mem0**: `user_id`/`agent_id`/`run_id` only. Identity keys in metadata are stripped ("identity fields cannot be set through metadata"). The self-hosted server has API-key auth. — [main.py](https://github.com/mem0ai/mem0/blob/main/mem0/memory/main.py), [server/README.md](https://github.com/mem0ai/mem0/blob/main/server/README.md)
- **Graphiti**: `group_id` only. Reference servers have no auth ("Any caller can read, change, or delete data in any `group_id`"). — [Graphiti README](https://github.com/getzep/graphiti/blob/main/README.md)
- **Honcho**: "Workspace… isolates data between use cases"; peers and sessions sit below that. — [Honcho README](https://github.com/plastic-labs/honcho/blob/main/README.md)
- **Memobase**: project URL + project token, with per-user profiles. — [Memobase readme](https://github.com/memodb-io/memobase/blob/main/readme.md)
- **Zep (commercial)**: projects, plus enterprise "governance" features. — [Zep pricing](https://www.getzep.com/pricing)

### Inferences
- For GEM AI, the clean design has two parts:
  - Map GEM scopes (person/project/workspace) onto the memory system's partition key: a bank, `user_id`, `group_id` or dataset.
  - Re-check permissions in GEM's SQL before injecting any memory into context, and store source document IDs on every memory so revocation propagates.
- Systems that keep memories in GEM's own Postgres (Hindsight, Mem0) make SQL-level permission joins possible. External stores (Neo4j, SQLite, Mongo) do not.

### Gaps
- I did not verify whether Honcho supports scoped JWTs or per-peer access policies, or whether Hindsight ships an auth implementation versus only extension points.

## What exact write/update algorithm does each use, and what does it cost?

### Takeaway
There are three families of write policy:
1. **LLM extract-then-reconcile**: old Mem0 (2 calls), Memobase (fixed 3 per flush), LangMem, Graphiti (multi-call with contradiction detection, bi-temporal invalidation).
2. **Append-only extraction with retrieval-time resolution**: Mem0 v3 (1 call, ADD-only, linking), Hindsight retain + background observation consolidation, TencentDB L0→L1→L2→L3.
3. **Agent self-editing**: Letta, MIRIX, A-MEM evolution.

Explicit forgetting/decay exists in Mem0 Platform (not OSS), Supermemory, LongMemory and MemOS working-memory caps. Most others never delete automatically.

### Cited Findings
- **Mem0 v3**: 1 LLM call per `add` (ADD-only). Dedup is done by the LLM against up to 20 recent and N existing memories. Related memories are linked via `linked_memory_ids`. There is no UPDATE/DELETE. — [prompts.py](https://github.com/mem0ai/mem0/blob/main/mem0/configs/prompts.py), [migration guide](https://docs.mem0.ai/migration/oss-v2-to-v3). The old v2 path was 2 LLM calls with ADD/UPDATE/DELETE/NONE. — [migration guide](https://docs.mem0.ai/migration/oss-v2-to-v3)
- **Graphiti**:
  - The steps per episode are LLM node extraction, node dedupe, LLM edge extraction, then edge resolution using the `resolve_edge` prompt (duplicates + contradictions). — [graphiti.py](https://github.com/getzep/graphiti/blob/main/graphiti_core/graphiti.py), [edge_operations.py](https://github.com/getzep/graphiti/blob/main/graphiti_core/utils/maintenance/edge_operations.py), [dedupe_edges.py](https://github.com/getzep/graphiti/blob/main/graphiti_core/prompts/dedupe_edges.py)
  - Contradiction handling: the invalidated edge gets an expiry, the edge is kept, and history is preserved. — [Graphiti README](https://github.com/getzep/graphiti/blob/main/README.md)
  - Then LLM node attribute/summary extraction runs, with optional community updates. — [graphiti.py](https://github.com/getzep/graphiti/blob/main/graphiti_core/graphiti.py)
- **Memobase**: buffer flush at about 1024 tokens or 1 hour idle; fixed 3 LLM calls per flush; merge decision APPEND/UPDATE/ABORT. — [readme](https://github.com/memodb-io/memobase/blob/main/readme.md), [merge_profile.py](https://github.com/memodb-io/memobase/blob/main/src/server/api/memobase_server/prompts/merge_profile.py)
- **LangMem**: an LLM "determine[s] how to expand or consolidate the memory state"; profile vs collection updates (insert/update/delete); hot-path or background formation. — [conceptual guide](https://github.com/langchain-ai/langmem/blob/main/docs/docs/concepts/conceptual_guide.md)
- **Cognee**: per document, classify → chunk → LLM graph extraction + summary → store data points; `forget` removes an item or dataset. — [cognify.py](https://github.com/topoteretes/cognee/blob/main/cognee/api/v1/cognify/cognify.py), [README](https://github.com/topoteretes/cognee/blob/main/README.md)
- **MemOS**: every item becomes a WorkingMemory node (capped at 20, oldest removed). Long-term and user nodes go into the graph, with similarity thresholds 0.80/0.92 used for merging. Reorganizer conflict/redundancy detectors run in the background. — [manager.py](https://github.com/MemTensor/MemOS/blob/main/src/memos/memories/textual/tree_text_memory/organize/manager.py)
- **TencentDB Agent Memory**: writing L0 asynchronously triggers L1 extraction (`notifyPipeline`). L1 atoms are versioned (`atomic/update` increments the version). L2 scenario files and the L3 `persona.md` are refined asynchronously. Skills are extracted from conversations and tool calls. — [MemoryCore v3 API doc](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/main/MemoryCore/v3-api-memorycore-doc.md), [README](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/main/README.md)
- **Hindsight**: retain is LLM extraction plus normalization. Background consolidation turns facts into observations with evidence quotes and proof counts ("strengthens, weakens or extends… instead of silently rep[lacing]"). Mental models are rewritten in the background. — [Hindsight README](https://github.com/vectorize-io/hindsight/blob/main/README.md)
- **Letta Code**: the agent rewrites memory blocks or files itself, git-tracked, with background "dreaming". — [letta-code README](https://github.com/letta-ai/letta-code/blob/main/README.md)
- **LongMemory**: "Immutable memory… not rewritten by recall or decay"; deterministic decay, reinforcement, consolidation and reconsolidation; "Historical recall preserves superseded truth". — [README](https://github.com/CaviraOSS/OpenMemory/blob/main/README.md)
- **Supermemory**: "handles knowledge updates and contradictions, forgets expired information". The algorithm is not published, and the platform uses proprietary extraction models. — [README](https://github.com/supermemoryai/supermemory/blob/main/README.md), [self-hosting docs](https://supermemory.ai/docs/self-hosting/overview)

### Inferences
- Approximate LLM calls per ingested message or chunk, inferred from the code and docs above (not measured):

  | System | LLM calls per message/chunk |
  |---|---|
  | Mem0 v3 | 1 |
  | Mem0 v2 | 2 |
  | Memobase | 3 per flush (amortized over many messages) |
  | Cognee | about 1–2 per chunk, plus classification |
  | Graphiti | roughly 3 + (#edges) + (#nodes) per episode, because edge resolution and node attribute extraction run per item |
  | Hindsight, TencentDB, MemOS | 1 extraction call plus deferred background consolidation calls |

- Graphiti is the most expensive. For document-heavy org ingestion with local models, background or batch consolidation (Hindsight, TencentDB, Memobase) is the cheaper pattern.
- The industry trend in 2026 is away from destructive UPDATE/DELETE, which proved hallucination-prone (see HaluMem below). Systems now keep append-only records with provenance and resolve current versus superseded facts at retrieval time (Mem0 v3) or via temporal invalidation (Graphiti, LongMemory). That pattern matches GEM's need for auditability.

### Gaps
- There are no published per-message token costs for most systems. Hindsight's README points to Prometheus metrics, but I found no numbers. I did not verify Graphiti's exact call count on the current version.

## Which handle documents (file ingestion) vs only conversations?

### Takeaway
Document-oriented systems: Cognee (strongest; documents, code, connectors), TencentDB (Wiki + CodeGraph), Zep (zep-ingest), Supermemory (files; connectors platform-only), EverOS (PDF/office), Honcho (`upload_file`), Basic Memory (Markdown), Khoj, txtai and Kernel Memory (archived). Conversation-centric systems: Mem0, Memobase, LangMem, A-MEM, MemoryOS and Letta. Graphiti accepts any text or JSON episodes but has no file parsing.

### Cited Findings
- **Cognee** turns "documents, code, and conversations into a self-hosted knowledge graph"; Google Drive/Gmail connectors (v1.6.1). — [cognee README](https://github.com/topoteretes/cognee/blob/main/README.md)
- **TencentDB**: "Documents & files: … Wiki automatically generates structured pages with a link graph"; codebases go to CodeGraph; past sessions go to Skills and Chat Memory. — [README](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/main/README.md)
- **Zep**: `zep-ingest` covers "Slack, documents, email, JSON/CSV, fact triples". — [getzep/zep README](https://github.com/getzep/zep/blob/main/README.md)
- **Supermemory**: file ingestion is supported self-hosted (PDF needs `GEMINI_API_KEY`); connectors are platform-only. — [self-hosting docs](https://supermemory.ai/docs/self-hosting/overview)
- **EverOS**: "[multimodal] … Image, PDF, audio, and office-file ingestion". — [README](https://github.com/EverMind-AI/EverMemOS/blob/main/README.md)
- **Honcho**: "Import documents | `session.upload_file(...)`". — [README](https://github.com/plastic-labs/honcho/blob/main/README.md)
- **MemOS**: RawFileMemory type and KB support. — [manager.py](https://github.com/MemTensor/MemOS/blob/main/src/memos/memories/textual/tree_text_memory/organize/manager.py), [README](https://github.com/MemTensor/MemOS/blob/main/README.md)
- **Mem0** extracts from conversation messages (`messages` must be a string, dict or list of dicts). — [migration guide](https://docs.mem0.ai/migration/oss-v2-to-v3)

### Inferences
- GEM AI already has a better document pipeline (versions, OCR, chunking, hybrid search, citations, SQL ACLs) than most memory frameworks. The brain should therefore consume GEM's document versions and chunks as episodes or sources, rather than letting a framework re-ingest files.
- TencentDB's "Wiki" idea (LLM-maintained pages derived from documents) and Hindsight's "knowledge pages" are the patterns worth copying for project knowledge.

### Gaps
- I did not test the document-ingestion quality of any system, or their behavior when a document version is replaced or deleted (propagating to derived memories).

## Known limitations, failure modes, criticism and benchmark disputes

### Takeaway
Vendor benchmark numbers are not comparable:
- Nearly every vendor claims #1 on LoCoMo or LongMemEval with different models, judges, metrics (QA accuracy vs Recall@k) and configurations.
- LoCoMo itself is flawed.
- Independent work (HaluMem, MemoryAgentBench, the Redis LongMemEval sweep) shows extraction and update stages hallucinate or omit heavily. Updates were the weakest point in the HaluMem results.

### Cited Findings
- **Mem0 vs Zep (May 2025)**: Zep said Mem0 misconfigured Zep by:
  - assigning "the user role to *both* participants";
  - appending timestamps instead of using `created_at`;
  - running searches sequentially.
  Zep's corrected score was **75.14% ±0.17 J** vs Mem0's reported 65.99% for Zep and Mem0-graph's 68.44%. Zep also noted that a full-context baseline (about 73%) beat Mem0, and that LoCoMo conversations (about 16k–26k tokens) fit in context. It called out LoCoMo data errors: category 5 lacks ground truth, some questions misattribute speakers, and some image questions lack the needed information. — [Zep blog, 6 May 2025, Chalef & Rasmussen](https://www.getzep.com/blog/lies-damn-lies-statistics-is-mem0-really-sota-in-agent-memory/)
- **Letta vs Mem0 (Aug 2025)**: Letta said it "could not find a way to load LoCoMo data into MemGPT/Letta without significant codebase refactoring". It said Mem0 did not explain its MemGPT numbers. Letta's own filesystem agent scored 74.0%. — [Letta blog](https://www.letta.com/blog/benchmarking-ai-agent-memory)
- **Self-reported 2026 headline numbers, mutually inconsistent**:

  | System | Claimed scores | Caveat |
  |---|---|---|
  | Mem0 | LoCoMo 92.5 / LongMemEval 94.4 | managed platform, models unstated — [README](https://github.com/mem0ai/mem0/blob/main/README.md) |
  | Hindsight | LoCoMo 92% / LongMemEval-S 94.6% | — [benchmarks](https://benchmarks.hindsight.vectorize.io/) |
  | MemOS | LoCoMo 88.83 / LongMemEval 89.20 | — [README](https://github.com/MemTensor/MemOS/blob/main/README.md) |
  | Memori | LoCoMo 87% | — [README](https://github.com/GibsonAI/Memori/blob/main/README.md) |
  | Supermemory | "#1" on all three | uses Recall@15 — [README](https://github.com/supermemoryai/supermemory/blob/main/README.md) |
  | Cognee | BEAM 0.79 | on 20 questions — [README](https://github.com/topoteretes/cognee/blob/main/README.md) |
  | TencentDB | PersonaMem 76% | — [README](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/main/README.md) |
- **HaluMem** ([arXiv 2511.03506](https://arxiv.org/abs/2511.03506), Nov 2025, revised Jan 2026): "existing memory systems tend to generate and accumulate hallucinations during the extraction and updating stages", and these errors propagate to QA. The benchmark has about 15k memory points and 3.5k questions.
  - A later paper's HaluMem-Medium table reports update correctness of 25.50% for Mem0 (74.02% omitted) and 47.28% for Zep (52.31% omitted), with QA correctness of about 53% and 55%. — [MemReader, arXiv 2604.07877](https://arxiv.org/pdf/2604.07877) (via search snippet)
  - Zep's extraction could not be evaluated because its API cannot list all memories of a session. — [search summary of HaluMem](https://huggingface.co/papers/2511.03506)
- **MemoryAgentBench** (UCSD, ICLR 2026) tests four competencies: accurate retrieval, test-time learning, long-range understanding and conflict resolution. "current methods fall short of mastering all four competencies". — [arXiv 2507.05257](https://arxiv.org/html/2507.05257v2)
- **Redis cross-system LongMemEval sweep** (shared gpt-4o answer model and judge, June 2026): Mastra Observational Memory scored 84.2% and Redis's best 86.1%. Redis itself warns "broad context rather than a controlled head-to-head ranking". — [Redis research](https://redis.github.io/redis-ai-research-public/longmemeval-agent-memory/), [agent-memory-server README](https://github.com/redis/agent-memory-server/blob/main/README.md)
- **Operational caveats**:
  - Graphiti reference servers have no auth or prompt-injection protection. — [Graphiti README](https://github.com/getzep/graphiti/blob/main/README.md)
  - Kuzu is abandoned upstream. — [Graphiti README](https://github.com/getzep/graphiti/blob/main/README.md)
  - Zep CE is deprecated. — [getzep/zep README](https://github.com/getzep/zep/blob/main/README.md)
  - Letta's V1 server is retired. — [letta README](https://github.com/letta-ai/letta/blob/main/README.md)
  - LangMem has had no release since Oct 2025. — [PyPI](https://pypi.org/project/langmem/)
  - Memobase has been inactive since Jan 2026 (shields.io last commit).
  - Motorhead is deprecated and Kernel Memory archived. — READMEs cited above
  - TencentDB is beta: backend switching does not migrate data, and "fully automated memory routing is still under iteration". — [INSTALL.md](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/main/INSTALL.md), [README](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/main/README.md)
  - Cognee's Postgres graph is demo-only. — [README](https://github.com/topoteretes/cognee/blob/main/README.md)
  - The Supermemory server is closed-source with a "lite license limit". — [docs](https://supermemory.ai/docs/self-hosting/overview)
  - Mem0 OSS lacks the platform's decay/temporal features and proprietary optimizations. — [main.py](https://github.com/mem0ai/mem0/blob/main/mem0/memory/main.py), [README](https://github.com/mem0ai/mem0/blob/main/README.md)

### Inferences
- GEM AI should not choose a framework on LoCoMo or LongMemEval headline numbers. These benchmarks are conversational and personal-assistant oriented, not organizational and document oriented, and the vendor runs use proprietary or unstated models.
- A small internal eval on GEM's own documents and decisions, run with the local models GEM will actually deploy (gpt-oss, Nemotron, Gemma), is necessary. Tests should cover:
  - supersession of decisions;
  - document version replacement;
  - permission leakage;
  - extraction omission.
- HaluMem's finding that updates mostly fail by omission argues for keeping provenance-linked, append-only memories with explicit validity windows (Graphiti/Mem0-v3/LongMemory style) rather than trusting an LLM to UPDATE/DELETE in place.
- HaluMem's authors overlap with the MemOS/MemTensor team (Zhiyu Li, Feiyu Xiong also appear on MemOS work). This is a possible conflict of interest; I inferred it from author names and did not verify affiliations.

### Gaps
- I did not obtain full HaluMem per-system tables from the original paper, or MemoryAgentBench's per-system numbers for Mem0, MemGPT or Cognee.
- No independent reproduction exists for most 2026 vendor claims. The exception is Hindsight's claimed Virginia Tech / Washington Post reproduction, whose report I did not locate.
- I found no published Mem0 response to the Zep critique.

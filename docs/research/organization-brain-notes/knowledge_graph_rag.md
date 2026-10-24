# Knowledge-Graph and Structured RAG for an "Organization Brain" (state as of 24 Oct 2026)

Research method note: repository facts (stars, releases, licences, storage options, features) come from the projects' own README/docs files on raw.githubusercontent.com, PyPI release histories (pypi.org/pypi/<pkg>/json) and shields.io star badges, all fetched on 2026-10-24. Star counts are shields.io rounded values. Benchmark numbers come from arXiv full-text HTML of each paper. GitHub's API and web UI were blocked from this sandbox, so release dates come from PyPI upload dates, not GitHub release pages.

## Q0. System profiles: pipeline, query modes, storage, updates, cost, models, licence, maturity, benchmarks

### Takeaway
By late 2026 the field has consolidated. **Microsoft GraphRAG is in maintenance mode** (bug fixes and CVE patches only). **LightRAG** (about 40k stars, MIT, active) is the most production-ready open framework, and the only one that runs fully on stock PostgreSQL + pgvector: it supports incremental insert, document deletion with knowledge-graph (KG) repair, citations and workspaces. **HippoRAG 2** has the best published multi-hop QA accuracy at about 1/10 of GraphRAG's indexing tokens, but it ships only as alpha library code. KAG, nano-graphrag, Fast GraphRAG, PathRAG and RAPTOR's reference code are stale or research-grade. Graphiti and Cognee are active but aimed at agent memory: Graphiti needs Neo4j, FalkorDB or Neptune, and Cognee's Postgres graph store is a demo, with the production version licensed.

### Cited Findings

**Maturity snapshot (2026-10-24)**
| System | Stars (approx.) | Latest release (date) | Licence | Activity |
|---|---|---|---|---|
| microsoft/graphrag | 36k | 3.3.0 (2026-10-08) | MIT | maintenance mode |
| HKUDS/LightRAG | 40k | 1.5.7 (2026-09-02) | MIT | very active (last commit Oct 2026) |
| gusye1234/nano-graphrag | 4k | 0.0.8.2 (2024-10-19) | MIT (repo) | stale |
| OSU-NLP-Group/HippoRAG | 4.1k | hipporag 2.0.0a4 (2025-06-24, alpha) | MIT | commits Oct 2026, no new PyPI release |
| OpenSPG/KAG | 9.1k | 0.8.0 (2025-06-30) | Apache-2.0 | last commit Jan 2026 |
| neo4j/neo4j-graphrag-python | 1.3k | 1.22.0 (2026-10-01) | Apache-2.0 | active, first-party |
| neo4j-labs/llm-graph-builder | 5.3k | v0.8.7 | (Labs project) | active, "experimental" |
| getzep/graphiti | 32k | graphiti-core 0.31.2 (2026-10-20) | Apache-2.0 | very active (196 releases) |
| topoteretes/cognee | 33k | 1.6.5 (2026-10-16); 1.6.6rc1 (2026-10-23) | Apache-2.0 | very active |
| circlemind-ai/fast-graphrag | 4k | 0.0.5 (2025-04-04) | MIT | last commit Nov 2025 |
| BUPT-GAMMA/PathRAG | 378 | no releases | — | last commit Dec 2025 |
| parthsarthi03/raptor | 1.8k | no releases | MIT | last commit Sep 2024 |
| apache/age | 4.9k | v1.7.0 (2026-01-21, PG18); v1.8.0 rc tags exist | Apache-2.0 | active |
| SciPhi-AI/R2R (had a Postgres-based KG) | 8k | 3.6.6 (2025-08-17) | MIT | last commit Nov 2025 |
| infiniflow/ragflow | 93k | 0.27.3 (2026-10-23); 1.0.0rc2 (2026-10-16) | Apache-2.0 | very active |

Sources for the table: shields.io star, last-commit and release badges for each repo, e.g. [graphrag](https://github.com/microsoft/graphrag), [LightRAG](https://github.com/HKUDS/LightRAG), [nano-graphrag](https://github.com/gusye1234/nano-graphrag), [HippoRAG](https://github.com/OSU-NLP-Group/HippoRAG), [KAG](https://github.com/OpenSPG/KAG), [neo4j-graphrag-python](https://github.com/neo4j/neo4j-graphrag-python), [llm-graph-builder](https://github.com/neo4j-labs/llm-graph-builder), [graphiti](https://github.com/getzep/graphiti), [cognee](https://github.com/topoteretes/cognee), [fast-graphrag](https://github.com/circlemind-ai/fast-graphrag), [PathRAG](https://github.com/BUPT-GAMMA/PathRAG), [raptor](https://github.com/parthsarthi03/raptor), [apache/age](https://github.com/apache/age), [R2R](https://github.com/SciPhi-AI/R2R), [ragflow](https://github.com/infiniflow/ragflow). PyPI histories: [graphrag](https://pypi.org/project/graphrag/#history), [lightrag-hku](https://pypi.org/project/lightrag-hku/#history), [nano-graphrag](https://pypi.org/project/nano-graphrag/#history), [hipporag](https://pypi.org/project/hipporag/#history), [openspg-kag](https://pypi.org/project/openspg-kag/#history), [neo4j-graphrag](https://pypi.org/project/neo4j-graphrag/#history), [graphiti-core](https://pypi.org/project/graphiti-core/#history), [cognee](https://pypi.org/project/cognee/#history), [fast-graphrag](https://pypi.org/project/fast-graphrag/#history), [r2r](https://pypi.org/project/r2r/#history), [ragflow-sdk](https://pypi.org/project/ragflow-sdk/#history). AGE dates: [AGE release notes](https://age.apache.org/release-notes).

**Microsoft GraphRAG (incl. FastGraphRAG, DRIFT, LazyGraphRAG)**
- Status: the README now says "This project is largely in maintenance mode, and won't be accepting new PRs or implementing new features. We'll perform bug fixes and dependency updates as appropriate, particularly to address CVEs." — [GraphRAG README](https://github.com/microsoft/graphrag/blob/main/README.md). The exact date of the notice was not determinable. The 3.1–3.3 releases (May–Oct 2026) contain only cache, storage and dependency changes — [CHANGELOG](https://github.com/microsoft/graphrag/blob/main/CHANGELOG.md).
- Version history: 1.0.0 (2024-12-11), 2.0.0 (2025-02-26), 2.7.0 (2025-10-09; LiteLLM made the default provider, so Ollama/OpenAI-compatible endpoints work), 3.0.0 (2026-01-27; monorepo split into graphrag-cache, -chunking, -llm, -storage, -vectors, etc.), 3.3.0 (2026-10-08). A separate 1.2.x line also got patch uploads up to 1.2.4 (2026-10-20); its purpose is undocumented — [PyPI](https://pypi.org/project/graphrag/#history), [CHANGELOG](https://github.com/microsoft/graphrag/blob/main/CHANGELOG.md).
- Standard indexing: per text unit, the LLM extracts entities with descriptions and relationships, plus optional claims. Descriptions are LLM-summarised per entity and per relationship. Leiden communities get LLM "community reports". "We estimate graph extraction to constitute roughly 75% of indexing cost" — [Indexing methods doc](https://github.com/microsoft/graphrag/blob/main/docs/index/methods.md).
- FastGraphRAG (`--method fast`, added in 2.0.0): noun phrases are extracted with NLTK/spaCy instead of an LLM, and relationships are co-occurrence in a text unit. The LLM is used only for community reports, and recommended chunks are small (50–100 tokens). Default extraction is "very fast but primarily suitable for English". The graph is "quite a bit noisier"; the method is recommended when the use case is mainly global summary questions — [methods doc](https://github.com/microsoft/graphrag/blob/main/docs/index/methods.md).
- Query modes: Local (entities plus their text chunks), Global (map-reduce over all community reports: "resource-intensive"), DRIFT (local search primed with community info and follow-up questions), Basic (plain vector RAG), plus question generation — [Query overview](https://github.com/microsoft/graphrag/blob/main/docs/query/overview.md).
- Storage: outputs go to `file|memory|blob|cosmosdb`; vector store `lancedb|azure_ai_search|cosmosdb` (default LanceDB). There is no Postgres/pgvector backend in the docs — [config yaml doc](https://github.com/microsoft/graphrag/blob/main/docs/config/yaml.md). In 3.0.3 the vector store API gained filtering and insert/count/remove/update operations — [CHANGELOG](https://github.com/microsoft/graphrag/blob/main/CHANGELOG.md).
- Incremental: "Add Incremental Indexing" and DRIFT both arrived in v0.4.0 (2024-11-06). Notes include "Calculate new inputs and deleted inputs on update", "naive community merge using time period", and an `update` CLI entry point (0.4.1). 2.0.0 added "children to communities to avoid re-compute" and fixed "summarization over large datasets for inc indexing" — [CHANGELOG](https://github.com/microsoft/graphrag/blob/main/CHANGELOG.md). Incremental runs write to a separate `update_output_storage` — [config doc](https://github.com/microsoft/graphrag/blob/main/docs/config/yaml.md).
- Cost warning: "GraphRAG indexing can be an expensive operation… start small." Prompt tuning is "strongly recommended" — [README](https://github.com/microsoft/graphrag/blob/main/README.md).
- Paper (arXiv 2404.16130): podcast corpus of about 1M tokens (1,669 × 600-token chunks). Indexing "took 281 minutes" using gpt-4-turbo (2M TPM) and produced 8,564 nodes / 20,691 edges. "All Graph RAG conditions outperformed naïve RAG on comprehensiveness and diversity" (LLM-judged, global sensemaking questions). Root-level community summaries need "9x-43x" fewer tokens per query — [arXiv 2404.16130](https://arxiv.org/abs/2404.16130).
- LazyGraphRAG (blog, 2024-11-25): NLP noun-phrase concept graph and community hierarchy, with "all LLM use" deferred to query time. "Indexing costs are identical to vector RAG and 0.1% of the costs of full GraphRAG". Comparable global-query quality at ">700 times lower query cost". A single "relevance test budget" parameter. Evaluated on 5,590 AP news articles with 100 synthetic queries. Editor's note (2025-06-06): integrated into Microsoft Discovery and Azure Local (public preview). The post does not say it is in the open-source library — [MSR blog](https://www.microsoft.com/en-us/research/blog/lazygraphrag-setting-a-new-standard-for-quality-and-cost/). No standalone open-source LazyGraphRAG repo was found.
- BenchmarkQED (2025-06-05): LazyGraphRAG beat vector RAG in "all 96 comparisons" (GPT-4o; 200 queries; GPT-4.1 judge). Even against vector RAG with a 1M-token window it had higher win rates, except relevance on data-local queries. The post states vector RAG "excels at local queries". DRIFT "posed the strongest challenge overall" — [MSR blog](https://www.microsoft.com/en-us/research/blog/benchmarkqed-automated-benchmarking-of-rag-systems/), [benchmark-qed repo](https://github.com/microsoft/benchmark-qed) (102 stars, PyPI 0.4.0 on 2026-05-27).

**LightRAG (HKU)**
- Pipeline: per-chunk LLM entity-relation extraction, merged into a KG with LLM-summarised descriptions, plus vectors for chunks, entities and relations. There are no community reports; "global" retrieval uses relation vectors keyed by high-level keywords — [LightRAG paper](https://arxiv.org/abs/2410.05779), [README](https://github.com/HKUDS/LightRAG/blob/main/README.md).
- Query modes: local, global, hybrid, naive, mix (default; "generally yields the most ideal query results") and bypass. A reranker has been supported since 2025-08 and is recommended (`BAAI/bge-reranker-v2-m3` locally; it adds 1–2 s) — [README](https://github.com/HKUDS/LightRAG/blob/main/README.md).
- Updates: "Incremental Updates & Selective Deletion… When a document is deleted, the system can use the LLM cache created during indexing to quickly rebuild the affected entities and relationships". Document deletion with KG regeneration was added 2025-08. There are also tools for duplicate documents claiming "the same canonical source key" and for orphan audits — [README](https://github.com/HKUDS/LightRAG/blob/main/README.md).
- Storage: the defaults are in-memory and "not suitable for production". "PostgreSQL is the recommended backend — it can serve all four storage types on its own". Graph options: NetworkX, Neo4J, **PGTableGraphStorage**, PGGraphStorage (Apache AGE), Mongo, Memgraph, OpenSearch. Vector options include PGVectorStorage, Milvus, Qdrant, Faiss, Mongo and OpenSearch — [API server doc](https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md).
- `PGTableGraphStorage` "supersedes `PGGraphStorage`". It uses plain tables (JSONB + B-tree), runs on "any stock PostgreSQL 14+", and needs only the `pgvector/pgvector:pg18` image. It was measured (PR #3103, 8k nodes / 40k edges) at `get_knowledge_graph` p50 "39 ms vs 1,099 ms (~28×)", bulk load "3.0 s vs 434 s", and throughput "1,431 vs 73 RPS" against AGE. An offline AGE→tables migration tool exists — [API server doc](https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md).
- Multi-tenancy: `WORKSPACE` "isolates data for multiple LightRAG instances on the same backend". The `/workspace` query UI is "a UX split, not a security boundary" — [API server doc](https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md).
- Provenance: citation support was added 2025-03. Entities and relations keep source `file_path`s capped by `MAX_FILE_PATHS`. Since 2025-11 the API returns retrieved contexts, and RAGAS/Langfuse are integrated — [README](https://github.com/HKUDS/LightRAG/blob/main/README.md).
- Models: extraction needs "a non-thinking model… For local deployment, Qwen3-30B-A3B-Instruct is a reasonable minimum". 2025-09 brought improved extraction "for Open-Sourced LLMs such as Qwen3-30B-A3B". Models below ~50 tok/s may time out. Local Qwen models "occasionally fall into an endless-output loop". Since 2026-05 there are role-specific LLMs (EXTRACT/QUERY/KEYWORDS/VLM), a merged RAG-Anything multimodal pipeline (MinerU/Docling) and four chunking strategies — [README](https://github.com/HKUDS/LightRAG/blob/main/README.md).
- Language: `SUMMARY_LANGUAGE` sets the language of entity names and summaries. The docs recommend `BAAI/bge-m3` as the local embedding model and stress choosing a multilingual one — [README](https://github.com/HKUDS/LightRAG/blob/main/README.md).
- Self-reported benchmark: LLM-judge win rates vs NaiveRAG, RQ-RAG, HyDE and GraphRAG on UltraDomain (agriculture, CS, legal, mix) — [README](https://github.com/HKUDS/LightRAG/blob/main/README.md), [arXiv 2410.05779](https://arxiv.org/abs/2410.05779). Independent evaluations are much less favourable (see Q4).

**nano-graphrag**
- A small, hackable GraphRAG re-implementation. Storage: networkx or Neo4j for the graph; nano-vectordb, hnswlib, milvus-lite or faiss for vectors; Ollama examples included. It supports incremental insert, "However, each time you insert, the communities of graph will be re-computed and the community reports will be re-generated". No deletion is documented — [README](https://github.com/gusye1234/nano-graphrag). Last PyPI release 2024-10-19 — [PyPI](https://pypi.org/project/nano-graphrag/#history).

**HippoRAG 2 (OSU)**
- Pipeline: LLM NER + OpenIE triples per passage. The KG contains phrase nodes, passage nodes and synonym edges. At query time, query-to-triple matching and an LLM "recognition memory" triple filter seed **Personalized PageRank**. The KG is used "to aid in the retrieval process rather than to expand the retrieval corpus", which introduces "less LLM-generated noise" — [arXiv 2502.14802](https://arxiv.org/abs/2502.14802) (ICML '25).
- Results (Llama-3.3-70B reader and extractor, NV-Embed-v2), average F1 across NQ, PopQA, MuSiQue, 2Wiki, HotpotQA, LV-Eval and NarrativeQA: HippoRAG 2 **59.8**, NV-Embed-v2 dense retrieval 57.0, HippoRAG 53.1, GraphRAG 49.6, RAPTOR 48.8, BM25 47.7, LightRAG 6.6. MuSiQue F1 48.6 vs dense 45.7; 2Wiki 71.0 vs 61.5; HotpotQA 75.5 vs 75.3; NQ 63.3 vs 61.9 — [arXiv 2502.14802 Table 2](https://arxiv.org/html/2502.14802).
- Library: OpenAI-compatible endpoints (vLLM/local) are supported. There is an MCP server with `delete` ("Remove passages by exact text or by `source_id`"), and integration tests cover "incremental updates, and deletion". The MCP HTTP server "has no authentication" — [README](https://github.com/OSU-NLP-Group/HippoRAG). The only PyPI release is the alpha 2.0.0a4 (2025-06-24) — [PyPI](https://pypi.org/project/hipporag/#history).

**KAG (OpenSPG / Ant Group)**
- Built on the OpenSPG engine. Features: schema-constrained and schema-free extraction, mutual indexing between graph and text chunks, and a logical-form solver with planning, reasoning and retrieval operators (retrieval, KG reasoning, language reasoning, numerical calculation) — [KAG README](https://github.com/OpenSPG/KAG).
- Stack: the Docker compose runs openspg-server, MySQL, **Neo4j** and MinIO — [openspg docker-compose](https://github.com/OpenSPG/openspg/blob/master/dev/release/docker-compose-west.yml).
- Paper: relative F1 gains of 19.6% (HotpotQA) and 33.5% (2Wiki) "compared to HippoRAG" (v1). Deployed in Ant Group E-Government and E-Health Q&A — [arXiv 2409.13731](https://arxiv.org/abs/2409.13731).
- Latest release 0.8.0 (2025-06-27); no release since — [README](https://github.com/OpenSPG/KAG), [PyPI](https://pypi.org/project/openspg-kag/#history).

**Neo4j GraphRAG Python package and LLM Graph Builder**
- `neo4j-graphrag` is the first-party library ("long-term support… directly from Neo4j"). It provides `SimpleKGPipeline` for KG construction, retrievers (VectorRetriever, VectorCypherRetriever, hybrid and Text2Cypher variants), Ollama support and an "Experimental namespace". It requires a Neo4j instance — [README](https://github.com/neo4j/neo4j-graphrag-python). Version 1.22.0 was released 2026-10-01 — [PyPI](https://pypi.org/project/neo4j-graphrag/#history).
- LLM Graph Builder is "an experimental Neo4j Labs project and not part of Neo4j's supported product lineup". It requires Neo4j 5.23+ with APOC, uses LangChain, offers Ollama (dev deployment) and tracks per-user token usage — [README](https://github.com/neo4j-labs/llm-graph-builder).

**Graphiti (Zep)**
- A temporal "context graph". Facts carry validity windows and are "invalidated — not deleted". Episodes give provenance: "Every entity and relationship traces back to the episodes". Graph construction is incremental, "without batch recomputation". You must build "ingestion, tenancy, access control, and operations" yourself — [README](https://github.com/getzep/graphiti).
- Databases: Neo4j 5.26, FalkorDB, or Amazon Neptune + OpenSearch Serverless. Kuzu is deprecated because "the upstream Kuzu project is no longer maintained". No Postgres backend — [README](https://github.com/getzep/graphiti).
- Models: "Graphiti works best with LLM services that support Structured Output… This is particularly problematic when using smaller models". Ollama, vLLM and others work via `OpenAIGenericClient`. The MCP server does not authenticate callers: "Any caller can read, change, or delete data in any `group_id`" — [README](https://github.com/getzep/graphiti).
- Zep paper: DMR 94.8% vs MemGPT's 93.4%; LongMemEval accuracy gains "up to 18.5%" with 90% lower latency. This is conversation-memory benchmarking, not document QA — [arXiv 2501.13956](https://arxiv.org/abs/2501.13956).

**Cognee**
- A graph + vector memory layer ("cognify" pipeline), with `forget` to remove an item or dataset. A GLiNER local extractor works without an LLM, but "The bundled GLiNER extractor is a demo"; the production version is commercial — [README](https://github.com/topoteretes/cognee).
- Postgres: "Since cognee 1.0 you can run the entire memory layer on a single Postgres instance", but "⚠️ Using Postgres as a graph store is currently released as a demo feature. The production-ready version is available as a licensed product" — [README](https://github.com/topoteretes/cognee).
- Permissions: `ENABLE_BACKEND_ACCESS_CONTROL` (multi-user by default), with per-dataset graph and vector engines and dataset-level isolation — [Cognee permissions docs](https://docs.cognee.ai/setup-configuration/permissions), [README](https://github.com/topoteretes/cognee). Paper: [arXiv 2505.24478](https://arxiv.org/abs/2505.24478).

**Fast GraphRAG (Circlemind)**
- Uses PageRank-based exploration (cites HippoRAG) and claims incremental updates. It reports costs of "$0.08 vs. graphrag $0.48 — a 6x costs saving" on *The Wizard of Oz*. MIT licence — [README](https://github.com/circlemind-ai/fast-graphrag). The last PyPI release is 0.0.5 (2025-04-04) — [PyPI](https://pypi.org/project/fast-graphrag/#history).

**PathRAG**
- Built on the LightRAG-style graph. It argues the problem is "redundancy of the retrieved information, rather than its insufficiency", and uses flow-based path pruning plus path-based prompting. It claims gains over baselines on six datasets (LLM-judged) — [arXiv 2502.14902](https://arxiv.org/abs/2502.14902). The repo (378 stars) uses NetworkX/NanoVectorDB "for development/demo" and Ollama/vLLM backends — [README](https://github.com/BUPT-GAMMA/PathRAG).

**RAPTOR**
- Recursively clusters chunks (UMAP + GMM) and summarises them into a tree, then retrieves from the collapsed tree. With GPT-4 it gave "+20% in absolute accuracy" on QuALITY and state-of-the-art results on NarrativeQA and QASPER — [arXiv 2401.18059](https://arxiv.org/abs/2401.18059). The reference repo is MIT and has had no commits since Sep 2024 — [repo](https://github.com/parthsarthi03/raptor).

**Other approaches prominent by late 2026**
- **LinearRAG** (ICLR'26, released 2025-10-27): a "relation-free" graph built from entity recognition (spaCy `en_core_web_trf`) and semantic linking, with "Zero LLM token consumption" for construction — [LinearRAG repo](https://github.com/DEEP-PolyU/LinearRAG), [arXiv 2510.10114](https://arxiv.org/abs/2510.10114).
- **Youtu-GraphRAG** (Tencent, ICLR 2026): schema-bounded extraction agent, a community/"knowledge tree" hierarchy and an agentic retriever. It claims "up to 90.71% saving of token costs and 16.62% higher accuracy". MIT licence, 1.3k stars. An enterprise edition is on Tencent Cloud ADP (2026-02) — [arXiv 2508.19855](https://arxiv.org/abs/2508.19855), [repo](https://github.com/TencentCloudADP/youtu-graphrag).
- **KET-RAG**: retrieval quality "comparable or superior" to GraphRAG while "reducing indexing costs by over an order of magnitude" — [arXiv 2502.09304](https://arxiv.org/abs/2502.09304).
- **MiniRAG** (HKU): a heterogeneous chunk+entity graph designed for small language models, using "25% of the storage space". Supports Neo4j, PostgreSQL, TiDB and others. Last commit Oct 2025 — [README](https://github.com/HKUDS/MiniRAG).
- **NodeRAG**: heterogeneous graph with incremental updates; v0.1.0 (2025-03), inactive since Mar 2025 — [README](https://github.com/Terry-Xu-666/NodeRAG).

### Inferences
- For a TypeScript/Postgres platform the realistic shortlist is: (a) LightRAG as a Python sidecar on the same Postgres (PGKV/PGVector/PGTableGraph/PGDocStatus), (b) HippoRAG-2-style PPR re-implemented over Postgres tables, or (c) a "lazy" approach (Microsoft LazyGraphRAG-style or LinearRAG-style NLP graph, with LLM work deferred to query time). Microsoft GraphRAG's maintenance-mode status, Azure-centric storage and community-report rebuilding make it a poor base for a living corpus. It remains a useful reference design.
- HippoRAG 2's design (graph only *routes* to original passages; answers cite passages) fits GEM AI's existing chunk/citation/permission model better than designs whose answers are built from LLM-written entity or community summaries.

### Gaps
- Exact date the GraphRAG "maintenance mode" notice was added (GitHub history was not reachable).
- Whether Fast GraphRAG supports deletion, and what its persistence layer is (not documented in its README).
- KAG's incremental update and deletion semantics, and its behaviour with ≤30B models (not found).
- Neo4j LLM Graph Builder licence and deletion behaviour (not confirmed in the fetched README).

## Q1. Which approaches handle incremental updates and deletion (documents replaced by new versions) well enough for a living corpus?

### Takeaway
Only **LightRAG** (insert, delete with KG repair using the cached extractions, source-key duplicate handling), **HippoRAG 2** (insert, delete by `source_id`), **Graphiti** (episode-based incremental updates with temporal invalidation) and **Cognee** (`forget`) document both adding and removing content. Community-summary systems (Microsoft GraphRAG, nano-graphrag) either recompute communities and reports or use approximate merges, so version churn either degrades the summaries or causes expensive regeneration. RAPTOR trees are not designed for in-place updates.

### Cited Findings
- LightRAG: selective deletion rebuilds "affected entities and relationships" from the LLM cache; deletion with automatic KG regeneration since 2025-08 — [LightRAG README](https://github.com/HKUDS/LightRAG/blob/main/README.md). Tools exist to list documents "that claim the same canonical source key" and demote duplicates, and to audit orphans so "delete/retry can discover them again" — same source.
- LightRAG paper: new documents go through the same pipeline and are merged "without the need to rebuild the entire index" — [arXiv 2410.05779](https://arxiv.org/abs/2410.05779).
- LightRAG operational caveat: the embedding model cannot be changed without re-embedding everything (there is a `lightrag-rebuild-vdb` tool), and storage backends cannot be switched after ingest (except AGE→tables) — [README](https://github.com/HKUDS/LightRAG/blob/main/README.md), [API server doc](https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md).
- Microsoft GraphRAG: incremental indexing since v0.4.0 with "new inputs and deleted inputs" detection and "naive community merge using time period"; 2.0.0 added community children "to avoid re-compute" — [CHANGELOG](https://github.com/microsoft/graphrag/blob/main/CHANGELOG.md).
- nano-graphrag: incremental insert re-computes communities and regenerates all community reports on each insert — [README](https://github.com/gusye1234/nano-graphrag).
- HippoRAG 2: `delete` "Remove passages by exact text or by `source_id`"; tests cover "incremental updates, and deletion" — [README](https://github.com/OSU-NLP-Group/HippoRAG). The paper frames the method as "non-parametric continual learning" — [arXiv 2502.14802](https://arxiv.org/abs/2502.14802).
- Graphiti: "New data integrates immediately without batch recomputation"; old facts are "invalidated — not deleted"; episodes can be added, retrieved and deleted — [README](https://github.com/getzep/graphiti).
- Cognee: `forget` removes "a specific item or dataset" — [README](https://github.com/topoteretes/cognee).
- Fast GraphRAG claims "Incremental Updates: Supports real-time updates" — [README](https://github.com/circlemind-ai/fast-graphrag). NodeRAG also claims incremental updates — [README](https://github.com/Terry-Xu-666/NodeRAG).
- LazyGraphRAG has indexing "identical to vector RAG" (NLP only), so updates cost only re-chunking and re-embedding plus NLP graph changes — [MSR blog](https://www.microsoft.com/en-us/research/blog/lazygraphrag-setting-a-new-standard-for-quality-and-cost/).

### Inferences
- A new document version is best treated as "delete old `source_id`, insert new". This requires every derived object (entity mentions, relation mentions, summaries) to carry `document_version_id` provenance so deletion can subtract exactly that version's contributions. LightRAG and HippoRAG 2 track this; designs that store only merged descriptions cannot.
- Merged entity descriptions (LightRAG) must be re-summarised whenever a contributing chunk disappears. This is LLM cost on every replace, which LightRAG reduces with its extraction cache. Designs that keep *mentions* (entity → chunk links) and summarise lazily at query time avoid this cost entirely.
- Global community summaries are the hardest artefact to keep correct under churn. Rebuilding them on a schedule (e.g. nightly), or generating them lazily at query time, is more robust than incremental patching.

### Gaps
- No independent study was found that measures answer quality drift after many incremental updates or deletes, for any system.
- How GraphRAG's `update` handles *modified* documents (delete + re-add vs merge) is not spelled out in the docs reviewed.

## Q2. Which can run on Postgres only (pgvector + AGE or plain tables), and which need a graph database? State of Apache AGE and other Postgres graph options

### Takeaway
**LightRAG is the only mainstream framework with a production-recommended all-Postgres mode**, and it now recommends **plain tables over Apache AGE** (about 28× faster on its benchmark, no extension needed). Cognee's Postgres graph mode is a demo; the production version is licensed. Graphiti, KAG, both Neo4j projects and nano-graphrag (optionally) need a graph database. Microsoft GraphRAG uses files/LanceDB/Azure. HippoRAG and LinearRAG-style methods keep small in-process graphs that are easy to port to Postgres tables. Apache AGE is alive (1.6.0 for PG17, Sep 2025; 1.7.0 for PG18 with row-level security, Jan 2026) but is rarely offered on managed Postgres. **SQL/PGQ was committed to PostgreSQL 19 in March 2026 and then rolled back.** It is not in the PG19 release notes as of RC1 (2026-10-15).

### Cited Findings
- LightRAG on Postgres: PGKVStorage, PGVectorStorage, PGTableGraphStorage/PGGraphStorage and PGDocStatusStorage give one backend for all four storage types. `PGTableGraphStorage` "runs on any stock PostgreSQL 14+", stores `lightrag_graph_nodes` / `lightrag_graph_edges` tables, and was measured at 39 ms vs 1,099 ms p50 graph fetch and 1,431 vs 73 RPS against AGE — [LightRAG API server doc](https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md).
- The same doc says AGE "most managed PostgreSQL services (Amazon RDS, Cloud SQL, Supabase, Neon) do not offer". It also documents an AGE quirk: AGE "enumerates edges with `SELECT DISTINCT`", so byte-identical parallel edges collapse — [API server doc](https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md).
- Cognee: Postgres-only mode exists, but "Using Postgres as a graph store is currently released as a demo feature" — [README](https://github.com/topoteretes/cognee).
- Graphiti: Neo4j / FalkorDB / Neptune (Kuzu deprecated) — [README](https://github.com/getzep/graphiti). KAG: Neo4j + MySQL + MinIO + openspg-server — [compose file](https://github.com/OpenSPG/openspg/blob/master/dev/release/docker-compose-west.yml). Neo4j GraphRAG / LLM Graph Builder: Neo4j (5.23+ with APOC for Graph Builder) — [neo4j-graphrag README](https://github.com/neo4j/neo4j-graphrag-python), [Graph Builder README](https://github.com/neo4j-labs/llm-graph-builder).
- Microsoft GraphRAG: storage `file|memory|blob|cosmosdb`; vectors `lancedb|azure_ai_search|cosmosdb` — [config doc](https://github.com/microsoft/graphrag/blob/main/docs/config/yaml.md).
- nano-graphrag: networkx (built-in) or Neo4j — [README](https://github.com/gusye1234/nano-graphrag). MiniRAG supports PostgreSQL among "10+ heterogeneous graph databases" — [README](https://github.com/HKUDS/MiniRAG).
- Apache AGE: an openCypher + SQL extension. Releases: 1.5.0 (2024-01-10, PG11–16), **1.6.0 (2025-09-22, PG17/PG16)** with operators in Cypher and NetworkX support in the Python driver, and **1.7.0 (2026-01-21, PG18)** with "Row Level Security support" and an "index on id columns" — [AGE release notes](https://age.apache.org/release-notes). The README badge shows v1.8.0 / PostgreSQL 18, and `PG*/v1.8.0-rc0` tags exist (an official 1.8.0 release date was not found) — [AGE README](https://github.com/apache/age). About 4.9k stars, commits in Oct 2026 — [repo](https://github.com/apache/age). EDB ships AGE 1.7.0.1 (2026-03-20) for PG17/18 — [EDB release notes](https://www.enterprisedb.com/docs/pg_extensions/apache_age/rel_notes/apache_age_1.7.0.1_rel_notes).
- SQL/PGQ: Peter Eisentraut committed SQL/PGQ (GRAPH_TABLE, CREATE PROPERTY GRAPH) on 16 Mar 2026. The post now carries "Important update: This change has been rolled back" — [depesz](https://www.depesz.com/?p=4467), [CommitFest 4904](https://commitfest.postgresql.org/58/4904). The PostgreSQL 19 release notes (as of 2026-10-09; RC1 released 2026-10-15) list REPACK, pg_plan_advice and others, with no property graph feature — [PG19 release notes](https://www.postgresql.org/docs/19/release-19.html).

### Inferences
- GEM AI does not need a graph database. The graph operations used by these methods (1–2 hop neighbourhood expansion, entity lookup by name or embedding, PPR over a sparse graph with tens to hundreds of thousands of nodes) are all feasible with plain `entities`, `mentions` (entity↔chunk), `relations` and `relation_mentions` tables plus pgvector, recursive CTEs, or an in-memory PPR in the sidecar or Node. LightRAG's own move from AGE to plain tables is strong evidence for this.
- AGE adds operational risk (extension packaging per PG major, lagging releases, absent on managed services) for little gain at this scale. Its 1.7.0 RLS support is notable but untested in this context.
- Waiting for SQL/PGQ is not viable for 2026–27 planning. It missed PG19, so the earliest is PG20 (~late 2027) if it is re-landed (speculative).

### Gaps
- No independent benchmark of AGE vs plain-table graph queries beyond LightRAG's PR #3103 numbers.
- Whether Cognee's licensed Postgres graph product is available for on-prem India deployments, and at what price.

## Q3. Real indexing cost for ~10,000 pages with an open model, and query latency

### Takeaway
Per unit of text, LLM-extraction graph indexing costs roughly **5–12× the corpus tokens (GraphRAG ≈ 12×, LightRAG ≈ 8.5×, HippoRAG 2 ≈ 6×) and RAPTOR ≈ 2×**, while NLP-built graphs (LazyGraphRAG, FastGraphRAG extraction, LinearRAG) cost almost nothing at indexing. On an 11.7k-passage corpus with Llama-3.3-70B on 4×H100, indexing took about 4.6 h (GraphRAG), 3.9 h (LightRAG), 1.7 h (HippoRAG 2) vs 12 min for dense embeddings. Per-query time was about 11–13 s for GraphRAG/LightRAG vs about 1.2 s for HippoRAG 2 and 0.3 s for dense retrieval.

### Cited Findings
- HippoRAG 2 paper, Table 12 (MuSiQue corpus, 11,656 passages, Llama-3.3-70B via vLLM on 4×H100):

  | | Input tokens | Output tokens | Indexing time | QA time/query |
  |---|---|---|---|---|
  | GraphRAG | 115.5M | 36.1M | 277 min | 10.7 s |
  | LightRAG | 68.5M | 18.3M | 235 min | 13.3 s |
  | HippoRAG 2 | 9.2M | 3.0M | 99.5 min | 1.2 s |
  | RAPTOR | 1.7M | 0.2M | 100.5 min | 0.6 s |
  | NV-Embed-v2 (dense) | – | – | 12.1 min | 0.3 s |

  Source: [arXiv 2502.14802, Appendix F](https://arxiv.org/html/2502.14802).
- GraphRAG-Bench (arXiv 2506.05690) Table 10, one novel of about 56k tokens, GPT-4o-mini: total indexing tokens were MS-GraphRAG 654,673 (292 s); LightRAG 474,172 (710 s); HippoRAG2 329,993 (97 s); Fast-GraphRAG 251,817; HippoRAG 177,961; RAPTOR 115,541; KET-RAG 517,551; "LAZY-GraphRAG" 591,150 — [arXiv 2506.05690](https://arxiv.org/html/2506.05690). The LazyGraphRAG figure conflicts with Microsoft's claim that LazyGraphRAG indexing equals vector RAG — [MSR blog](https://www.microsoft.com/en-us/research/blog/lazygraphrag-setting-a-new-standard-for-quality-and-cost/). The benchmark used its own implementation, and its token count may include steps Microsoft defers to query time.
- Original GraphRAG: about 1M tokens indexed in 281 min with gpt-4-turbo (2M TPM) — [arXiv 2404.16130](https://arxiv.org/abs/2404.16130).
- Unified-framework study: tree (RAPTOR) graphs need the fewest tokens, rich KGs (with descriptions) the most, "up to 40× more tokens than trees"; passage graphs "no token cost" — [arXiv 2503.04338](https://arxiv.org/abs/2503.04338). The same study had to swap RAPTOR's GMM clustering for K-means on its three largest datasets because GMM "fails to finish within two days" — same source.
- RAG vs GraphRAG study: construction time of 135 s for RAG, 7,702 s for KG-GraphRAG and 5,560 s for Community-GraphRAG on its dataset — [arXiv 2502.11371](https://arxiv.org/abs/2502.11371).
- KET-RAG cuts indexing cost "by over an order of magnitude" vs GraphRAG at comparable retrieval quality — [arXiv 2502.09304](https://arxiv.org/abs/2502.09304). LinearRAG uses "Zero LLM token consumption" for graph construction — [LinearRAG repo](https://github.com/DEEP-PolyU/LinearRAG). Youtu-GraphRAG claims up to 90.71% token savings — [arXiv 2508.19855](https://arxiv.org/abs/2508.19855).
- LightRAG operational guidance: models below about 50 tok/s risk extraction timeouts. Size `max_output_tokens < LLM_TIMEOUT × tokens_per_second`. Reranking adds 1–2 s per query. `mix` mode "takes slightly longer than naive" — [README](https://github.com/HKUDS/LightRAG/blob/main/README.md).
- Global search is "resource-intensive" (map-reduce over all community reports) — [GraphRAG query docs](https://github.com/microsoft/graphrag/blob/main/docs/query/overview.md). LazyGraphRAG reaches similar global quality at ">700 times lower query cost" — [MSR blog](https://www.microsoft.com/en-us/research/blog/lazygraphrag-setting-a-new-standard-for-quality-and-cost/).

### Inferences
- Estimate for 10,000 engineering pages, assuming about 500 extracted-text tokens per page (about 5M corpus tokens; real documents with tables and drawings vary from 300 to 1,000+):

  | Method | Indexing tokens (per-token ratio) | Indexing tokens (per-passage rate) | Output tokens |
  |---|---|---|---|
  | GraphRAG-style | ≈ 60M | ≈ 130M+ | ≈ 30M |
  | LightRAG | ≈ 40M | ≈ 75M | ≈ 15M |
  | HippoRAG 2 | ≈ 30M | ≈ 10M | ≈ 2–3M |
  | RAPTOR | ≈ 10M | — | small |

  The per-token column uses the GraphRAG-Bench ratios. The per-passage column uses the MuSiQue rates; MuSiQue passages are shorter than pages, so that column is a lower bound. Output tokens dominate wall-clock time on self-hosted models.
- Wall-clock example: a self-hosted 20–30B MoE (gpt-oss-20B, Qwen3-30B-A3B class) serving about 1–3k output tok/s aggregate with batching would need about 3–10 h for LightRAG-scale output and about 0.3–1 h for HippoRAG-2-scale output. On Ollama Cloud, rate limits will dominate. This is an extrapolation, not a measurement.
- Every document version replacement re-incurs extraction for that document (about 5–12× its tokens). Under heavy churn, cheap-to-index designs (OpenIE triples, NLP graphs, lazy summaries) compound their advantage.
- Query latency: PPR/graph-routing methods (HippoRAG 2) add about 1 s over dense retrieval. Description-heavy methods (LightRAG/GraphRAG local) add about 10 s, mostly from longer LLM contexts. Global map-reduce is the slowest unless done lazily with a budget.

### Gaps
- No published measurement of any of these systems on gpt-oss-20B/120B, Nemotron or Gemma; Ollama Cloud throughput limits are unknown.
- The token cost of GraphRAG-Bench's LazyGraphRAG run vs Microsoft's claim is unresolved (different implementations).

## Q4. Where does graph RAG measurably help, and where is hybrid RAG + reranking as good or better?

### Takeaway
Independent, controlled studies converge on four points. (1) **Plain RAG (especially with reranking) matches or beats graph RAG on single-hop, detail-oriented fact questions**. (2) Graph methods help on **multi-hop reasoning** and **corpus-level summarisation/global questions**. (3) Many headline gains (especially LightRAG-style LLM-judge win rates) shrink or vanish under unbiased evaluation. (4) **HippoRAG 2 is the only method that beats a strong dense retriever across simple *and* multi-hop QA** in its authors' test. The best practical pattern is routing or integration: hybrid RAG by default, graph or lazy-global modes for multi-hop and "whole-corpus" questions.

### Cited Findings
- RAG vs GraphRAG (Han et al., v3 2026-03-04): "RAG performs better on single-hop and detail-oriented factual queries, whereas GraphRAG is more effective on multi-hop, reasoning-intensive questions". "KG-based GraphRAG generally underperforms on QA due to limited graph coverage". RAG still wins single-hop "even when equipped with reranking or iterative retrieval". Selection and integration strategies give "consistent performance improvements". LLM-as-judge summarisation evaluation is "highly sensitive to the presentation order" — [arXiv 2502.11371](https://arxiv.org/abs/2502.11371). Example F1 on NQ / HotpotQA: RAG 64.78 / 60.04; Community-GraphRAG (Local) 63.01 / 61.66; Community-GraphRAG (Global) 54.48 / 45.16; HippoRAG2 61.03 / 63.01; KG-GraphRAG (triplets only) 34.28 / 25.02 — same source.
- GraphRAG-Bench (ICLR'26), GPT-4o-mini, novel corpus, fact retrieval accuracy: RAG with rerank **60.92** vs MS-GraphRAG 49.29, HippoRAG2 60.14, LightRAG 58.62, LazyGraphRAG 51.65, RAPTOR 49.25. Complex reasoning: RAG with rerank 42.93 vs HippoRAG2 **53.38**, MS-GraphRAG 50.93. Contextual summarisation: RAG with rerank 51.30 vs MS-GraphRAG **64.40**, HippoRAG2 64.10. On the medical corpus RAG with rerank is strong (fact 64.73; MS-GraphRAG 38.63; HippoRAG2 66.28). "Basic RAG Matches GraphRAG in simple fact retrieval" — [arXiv 2506.05690](https://arxiv.org/html/2506.05690), [GraphRAG-Bench repo](https://github.com/GraphRAG-Bench/GraphRAG-Benchmark). The paper cites prior work showing GraphRAG "13.4% lower accuracy on Natural Question" than vanilla RAG — same source.
- Unbiased evaluation study (Zeng et al., v2 2026-08-13): win-rate evaluations suffer position bias ("win rates can differ by over 30%") and length bias (a 25-token gap can swing win rate "over 50%"). After debiasing, gains of three GraphRAG methods are "much more moderate or even vanish", and "existing GraphRAG researches are overly optimistic" — [arXiv 2506.06331](https://arxiv.org/abs/2506.06331).
- HippoRAG 2 (Llama-3.3-70B): avg F1 59.8 vs dense NV-Embed-v2 57.0. GraphRAG (49.6), RAPTOR (48.8) and LightRAG (6.6) fall *below* dense retrieval. GraphRAG is notably worse on simple QA (NQ 46.9 vs 61.9) — [arXiv 2502.14802](https://arxiv.org/html/2502.14802).
- Unified framework study (Llama-3-8B): graph methods such as HippoRAG and RAPTOR "typically exhibit higher accuracy than VanillaRAG", and "RAPTOR often achieves the best performance among most datasets, especially for simple questions" — [arXiv 2503.04338](https://arxiv.org/abs/2503.04338). This partly conflicts with HippoRAG 2's finding that RAPTOR trails dense retrieval with a 70B model and strong 7B embedder. Baseline strength (retriever quality) appears to drive the disagreement.
- Microsoft's own evaluations: GraphRAG beats naïve RAG on comprehensiveness and diversity for global sensemaking — [arXiv 2404.16130](https://arxiv.org/abs/2404.16130). LazyGraphRAG beats vector RAG even with a 1M-token window, but "Vector RAG excels at local queries" — [BenchmarkQED blog](https://www.microsoft.com/en-us/research/blog/benchmarkqed-automated-benchmarking-of-rag-systems/). These are LLM-judged, a method flagged as biased by [arXiv 2506.06331](https://arxiv.org/abs/2506.06331).
- KAG reports F1 gains of 19.6% and 33.5% over HippoRAG(1) on HotpotQA and 2Wiki — [arXiv 2409.13731](https://arxiv.org/abs/2409.13731). RAPTOR +20% on QuALITY with GPT-4 — [arXiv 2401.18059](https://arxiv.org/abs/2401.18059). Both are author-reported.

### Inferences
- For an engineering corpus, most daily questions are local and detail-oriented ("rated current of motor X", "clause 7.3 of spec Y"). The existing hybrid FTS + pgvector stack, plus a cross-encoder reranker if not already present, will likely match or beat graph RAG there. Graph structure pays off for: cross-document multi-hop ("which projects used the inverter model that failed in site Z's report?"), entity-centric aggregation ("everything about customer/vendor/part number X"), and global or thematic questions ("main recurring failure modes across all commissioning reports").
- A query router (local → hybrid RAG; multi-hop/entity → graph-expanded retrieval/PPR; global → lazy map-reduce) is supported by the RAG-vs-GraphRAG integration results. Domain entities (part numbers, standards such as IEC/IS, project codes, customers) are better extracted with schema-guided, regex or dictionary extractors than with open LLM extraction, an approach in the spirit of KAG's and Youtu-GraphRAG's schema-bounded extraction.
- Any adoption should be validated on a GEM AI test set with exact-match or claim-level scoring, not only LLM-judge win rates.

### Gaps
- No benchmarks were found on engineering or technical corpora (datasheets, specs, test reports) or on table-heavy documents.
- No head-to-head comparison against *hybrid BM25 + vector + reranker* with modern embedders across all graph systems; most baselines are dense-only.

## Q5. Quality with small/local open models (7B–30B) and Hindi/multilingual support

### Takeaway
LLM-extraction frameworks degrade with small models. LightRAG's own minimum for local extraction is about 30B (Qwen3-30B-A3B), and Graphiti warns about structured-output failures with smaller models. Retrieval-routing designs (HippoRAG 2, Fast-GraphRAG-style PPR, RAPTOR trees) hold up better with 8–14B models in independent tests. No Hindi-specific GraphRAG benchmark exists. The NLP-based "cheap" extractors (FastGraphRAG/LazyGraphRAG noun phrases, LinearRAG spaCy) are English-oriented by default.

### Cited Findings
- LightRAG: "Qwen3-30B-A3B-Instruct is a reasonable minimum" for local extraction; a non-thinking model is "strongly recommended"; local Qwen models can loop endlessly — [README](https://github.com/HKUDS/LightRAG/blob/main/README.md). Graphiti: Structured Output is needed, "particularly problematic when using smaller models" — [README](https://github.com/getzep/graphiti).
- GraphRAG-Bench with Qwen2.5-14B (novel corpus), fact retrieval accuracy: RAG with rerank 46.74 vs Fast-GraphRAG 60.08, HippoRAG2 54.79, LightRAG 44.00, MS-GraphRAG (local) 39.89. Contextual summarisation: MS-GraphRAG local 65.28 vs RAG 51.55 — [arXiv 2506.05690 Table 7](https://arxiv.org/html/2506.05690). The paper also evaluates Qwen 3B–14B scaling (Table 11) — same source.
- Llama-3-8B as default LLM: HippoRAG and RAPTOR beat VanillaRAG; RAPTOR is often best — [arXiv 2503.04338](https://arxiv.org/abs/2503.04338). RAG vs GraphRAG also reports Llama 3.1-8B/70B results — [arXiv 2502.11371](https://arxiv.org/abs/2502.11371).
- HippoRAG 2 experiments use Llama-3.3-70B for extraction (OpenIE results also released for gpt-4o-mini) — [README](https://github.com/OSU-NLP-Group/HippoRAG), [paper](https://arxiv.org/abs/2502.14802). MiniRAG targets small language models specifically — [README](https://github.com/HKUDS/MiniRAG).
- Multilingual: GraphRAG `prompt-tune --language` defaults to auto-detection; "If it is different from the inputs' language, the LLM will translate" — [auto prompt tuning doc](https://github.com/microsoft/graphrag/blob/main/docs/prompt_tuning/auto_prompt_tuning.md). FastGraphRAG's default NLTK extraction is "primarily suitable for English"; spaCy models are configurable — [methods doc](https://github.com/microsoft/graphrag/blob/main/docs/index/methods.md). LightRAG `SUMMARY_LANGUAGE` with a multilingual embedder (bge-m3) — [README](https://github.com/HKUDS/LightRAG/blob/main/README.md). LinearRAG uses `en_core_web_trf` — [repo](https://github.com/DEEP-PolyU/LinearRAG).
- The only Hindi-related KG-extraction work found was outside GraphRAG: DBpedia Hindi chapter GSoC projects on small-model Hindi OpenIE, which note that prompt-only LLM triple extraction "often suffers from inconsistency" — [DBpedia forum](https://forum.dbpedia.org/t/dbpedia-hindi-chapter-2026-fine-tuning-indic-models-for-hindi-relational-triple-extraction-human-in-the-loop-feedback-gsoc-2026/4788). This is low-authority evidence.

### Inferences
- gpt-oss-120B or a 30B-class MoE should be the extraction model if LLM extraction is used. 20B-class models are borderline for LightRAG-style rich descriptions but adequate for HippoRAG-style short triples/NER, especially with JSON-schema-constrained output.
- For Hindi or mixed Hindi-English (often Hinglish/Devanagari plus English technical terms), keep canonical entity names in their original script plus an English alias. Use multilingual embeddings (bge-m3) for entity linking, and avoid English-only NLP noun-phrase extractors. Most engineering documents in these sectors are likely English-dominant, which reduces the risk (an assumption to verify).

### Gaps
- No evaluation of any graph RAG system on Hindi or Indic corpora was found.
- No published results for gpt-oss, Nemotron or Gemma as KG extractors in these frameworks.

## Q6. How can permissions be kept when summaries or communities mix content from documents with different access?

### Takeaway
None of the open frameworks implement per-document ACL filtering inside graph retrieval. They offer only coarse isolation: LightRAG `WORKSPACE`, Graphiti `group_id` (unauthenticated MCP), Cognee dataset-level permissions, AGE 1.7 row-level security. Merged entity descriptions and community reports structurally mix sources, and research shows graph RAG leaks structured information. Safe designs keep **derived artefacts permission-homogeneous** (partition by project/ACL scope), **keep provenance on every node and edge** (mention → chunk → document version), **filter at query time in SQL**, and **defer summarisation to query time over only permitted chunks** (LazyGraphRAG-style).

### Cited Findings
- LightRAG: `WORKSPACE` "isolates data for multiple LightRAG instances on the same backend". The query UI split is "not a security boundary" — [API server doc](https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md). Entity and relation records accumulate source `file_path`s (capped by `MAX_FILE_PATHS`), i.e. one merged entity spans many documents — [README](https://github.com/HKUDS/LightRAG/blob/main/README.md).
- Graphiti: users must build "tenancy, access control"; the MCP server lets "Any caller… read, change, or delete data in any `group_id`" — [README](https://github.com/getzep/graphiti).
- Cognee: `ENABLE_BACKEND_ACCESS_CONTROL` gives multi-user mode with per-dataset graph and vector engines — [permissions docs](https://docs.cognee.ai/setup-configuration/permissions).
- Apache AGE 1.7.0 adds "Row Level Security support" — [AGE release notes](https://age.apache.org/release-notes). The (rolled-back) PG SQL/PGQ design had property graphs acting like "security invoker" views — [depesz](https://www.depesz.com/?p=4467).
- GraphRAG community reports summarise all entities and relationships in a community across text units, and global search map-reduces over "all AI-generated community reports" — [GraphRAG query docs](https://github.com/microsoft/graphrag/blob/main/docs/query/overview.md), [methods doc](https://github.com/microsoft/graphrag/blob/main/docs/index/methods.md).
- Security research: one study (per its abstract excerpt) says Graph RAG may reduce raw text leakage but is "significantly more vulnerable to the extraction of structured entity and relationship information" — [arXiv 2508.17222](https://arxiv.org/pdf/2508.17222v1). A Feb-2026 paper demonstrates "practical subgraph reconstruction attacks on defended Graph RAG" — [arXiv 2602.06495](https://arxiv.org/pdf/2602.06495). Both were seen only via search snippets, not fully read. Practitioner guidance on permission-aware retrieval (lineage, query-time authorisation, propagating revocations to derived artefacts) — [DZone](https://dzone.com/articles/build-secure-permission-aware-retrieval) (practitioner source, lower authority).

### Inferences
- Mapping to GEM AI's per-project permission checks in SQL:
  - **Store mentions, not just merged facts.** Store `entity_mentions(entity_id, chunk_id, doc_version_id)` and `relation_mentions(...)`. At query time, join to the existing chunk permission predicate, so an entity or edge is visible only if at least one permitted mention supports it. Show the permitted mentions' text, not a global merged description.
  - **Scope summaries.** Build summaries (entity descriptions, communities, RAPTOR-style trees) per permission scope, e.g. per project plus a "company-wide public" scope. Never mix scopes in one LLM summary. Cross-project global questions then map-reduce over the scopes the user can access.
  - **Prefer lazy summaries.** Generate summaries at query time from permitted chunks only, as LazyGraphRAG does. They are naturally permission-correct and need no regeneration on ACL changes, at the price of query-time LLM cost.
  - **Treat precomputed summaries as derived documents.** Give each summary an ACL equal to the intersection (or exact set) of its sources' scopes, and invalidate it when any source is deleted, re-versioned or re-permissioned.
  - **Consider entity names themselves sensitive.** The existence of an edge such as "Project A — supplier — Vendor B" can leak information, so edges need the same mention-level filtering.
- A single global graph like LightRAG's merged-entity graph is only safe if all users can see everything, or if one LightRAG workspace is used per permission scope. That multiplies indexing and storage and breaks cross-scope linking.

### Gaps
- No open framework was found with built-in document-level ACL filtering of graph retrieval. Neo4j Enterprise fine-grained access control was not verified in this research.
- No empirical study of the quality cost of permission-partitioned communities vs global communities.

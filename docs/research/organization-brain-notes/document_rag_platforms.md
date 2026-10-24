# Document ingestion and enterprise RAG platforms and libraries for the GEM AI "organization brain" (as of 24 Oct 2026)

How the data was collected: GitHub stars, license, latest release and last commit come from the shields.io badge API (`img.shields.io/github/{stars,license,v/release,release-date,last-commit}/<repo>`), queried on 2026-10-24. README and LICENSE text comes from raw.githubusercontent.com, and package versions come from the PyPI JSON API. Relative dates are converted as follows: "yesterday" = 2026-10-23 and "last thursday" = 2026-10-22. A month name with no year means 2026. Star counts are rounded by shields (for example "33k"). The direct GitHub API and github.com HTML were blocked from this sandbox, so some claims rest on README text rather than release pages.

---

## Q1. Which platforms offer document-level permission sync from sources, and is it open source or paid?

### Takeaway
Only two self-hostable products have real source-ACL sync. **Onyx** has the broadest coverage (14 connectors), but it is in the paid Enterprise Edition. **PipesHub** is the only one that claims permission-aware search in a fully Apache-2.0 open-source product, but it is young (3.8k stars) and its sync mechanics are thinly documented. RAGFlow, Dify, Open WebUI, AnythingLLM, Kotaemon, Khoj, R2R and Airweave sync content but not source ACLs. They use their own workspace, team or group permissions instead.

### Cited Findings
**Onyx (formerly Danswer)**
- Connectors have three access types: Private, Public and "Auto Sync Permissions". With Auto Sync, "Onyx will maintain an access control list from the source and restrict users to only see data they have access to." — [Onyx connectors overview](https://docs.onyx.app/admins/connectors/overview.md)
- Permission sync covers Confluence, Jira, Google Drive and Gmail (service account or Workspace Admin OAuth required), Slack (federated), Salesforce, GitHub, Box, Canvas, SharePoint (certificate auth required), Microsoft Teams, Outlook, Zoom and YouTrack. The same page says: "Permission-syncing connectors are an Enterprise Edition feature." — [Onyx connectors overview](https://docs.onyx.app/admins/connectors/overview.md)
- Defaults: content refresh every 30 minutes, and pruning of deleted source content every 30 days. — [Onyx connectors overview](https://docs.onyx.app/admins/connectors/overview.md)
- The EE feature list includes OIDC/SAML SSO, Permission Sync Connectors ("Automatically inherit user permissions from external systems"), whitelabeling, user groups and RBAC, group-based permissions for connectors, document sets and agents (v4.7+), usage analytics, encrypted secrets, EE APIs and hook extensions. The page gives no self-hosted price; it says "contact us … for a free self-hosted trial". — [Onyx Enterprise Edition](https://docs.onyx.app/admins/getting_started/enterprise_edition)
- License split: code under `ee` directories is under the "Onyx Enterprise License"; everything else is MIT. Community Edition "covers all of the core features for RAG, AI Chat, Agents, and Actions". — [Onyx LICENSE](https://raw.githubusercontent.com/onyx-dot-app/onyx/main/LICENSE), [Onyx README](https://github.com/onyx-dot-app/onyx)
- Onyx's MCP server gives external agents "company context with the same access controls as the person running them". — [Onyx README](https://github.com/onyx-dot-app/onyx)

**PipesHub**
- PipesHub describes itself as "fully open-source (Apache 2.0)". Its "Permission-Aware Search" "enforces source-level access controls so users only see what they're authorized to". It has 50+ connectors (Slack, Google Drive, Gmail, Jira, Confluence, SharePoint, Microsoft 365, Notion, GitHub and others), with "real-time and scheduled indexing". — [PipesHub README](https://github.com/pipeshub-ai/pipeshub-ai), [PipesHub docs index](https://docs.pipeshub.com/llms.txt)
- The connector docs say syncing is periodic ("Data is synced on a schedule, not in real-time"). Users are matched by email: "use the same email address as your PipesHub account. Using a different email will cause permission issues". To remove a connector's records, you delete the connector instance. — [PipesHub connectors overview](https://docs.pipeshub.com/connectors/overview.md)
- SharePoint and OneDrive need admin consent from a Global or Application Administrator. — [PipesHub OneDrive docs](https://docs.pipeshub.com/connectors/microsoft-365/one-drive.md) (via search summary)
- The README wording conflicts with the docs: "real-time and scheduled indexing" versus "periodic syncing … not in real-time". — [README](https://github.com/pipeshub-ai/pipeshub-ai) vs [connectors overview](https://docs.pipeshub.com/connectors/overview.md)

**Products without source-ACL sync** (no ACL sync found in their docs or READMEs)
- **RAGFlow** has 25+ data-source connectors with incremental and deletion sync (details in Q4). The only "permission" items in its release notes are its internal **Team/Me** sharing model: 1.0.0-rc1 listed it as "not yet supported", and 1.0.0-rc2 re-added it. — [RAGFlow release notes](https://raw.githubusercontent.com/infiniflow/ragflow/main/docs/release_notes.md)
- **Open WebUI** has internal "Granular RBAC & User Groups" and per-user/group access to knowledge and models, LDAP/AD and SCIM 2.0. It offers Google Drive and OneDrive/SharePoint *file picking*, and a separate `oikb` tool to "Feed your Knowledge Bases from 45+ sources … continuously in sync". No source-ACL mirroring is stated. — [Open WebUI README](https://github.com/open-webui/open-webui)
- **Airweave** (MIT) syncs 50+ sources into Postgres plus Vespa for agents. Its docs index lists syncs, webhooks and token injection, but no permission or ACL pages. — [Airweave README](https://github.com/airweave-ai/airweave), [Airweave llms.txt](https://docs.airweave.ai/llms.txt)
- **Dify**: SSO and RBAC are part of "Dify Enterprise". Its data-source plugins (Notion, Confluence, GitHub, Google Drive, OneDrive, Box, S3…) import content, and no ACL sync is mentioned. — [Dify README](https://github.com/langgenius/dify), [Dify knowledge-pipeline blog](https://www.dify.ai/blog/knowledge-pipeline-plugin-ecosystem-co-build-enterprise-grade-rag-with-global-partners)
- **Quivr V2** (Go rewrite, in evaluation): "Every hit is rehydrated from canonical storage and re-authorized." This is a design pattern, not source-ACL sync. — [Quivr README](https://github.com/QuivrHQ/quivr)

### Inferences
- If GEM AI wants Drive, SharePoint or Confluence ACLs honoured, the realistic paths are: (a) build ACL sync into its own connectors, storing principal lists per document and filtering in the existing SQL permission checks; (b) license Onyx EE; or (c) evaluate PipesHub's Apache-2.0 implementation as reference code. Onyx's model (email-based user matching, a 30-minute refresh, a separate prune job, and sync-owned ACLs that admins cannot edit) is a good blueprint for (a).
- GEM AI's per-project SQL permission checks are already stronger than what most open-source platforms offer. Most of them only have workspace or knowledge-base-level sharing.

### Gaps
- PipesHub's exact ACL model (group expansion, latency, which connectors carry ACLs) is not documented in the pages I could fetch.
- I found no official Onyx EE price for self-hosting.
- Airweave permission support: no documentation found either way.

---

## Q2. Which parsers give the best results on scanned engineering PDFs and tables, self-hosted?

### Takeaway
As of Oct 2026, small open "document VLMs" lead the public benchmarks. On OmniDocBench v1.6 the leaders are PaddleOCR-VL-1.6 at 96.3, MinerU2.5-Pro at 95.8 and TeleOCR/OvisOCR2 at about 96–97, well ahead of pipeline tools such as MinerU-Pipeline (86.5) and Marker (78.4). On olmOCR-bench, Chandra 2 scores 85.8 and dots.ocr 1.5 scores 83.9. For GEM AI the practical self-hosted choices are:
- **MinerU 4** (Apache-2.0 plus thresholds that GEM AI will never hit; CPU-capable tiers; Office formats; stable page/block locators).
- **PaddleOCR-VL** (Apache-2.0, top of OmniDocBench).
- **Docling** (MIT, broadest format coverage including XLSX, DOCX and EML/MSG, but weaker scores on scans).

Marker, Surya and Chandra are excellent, but their weights are restricted for commercial use above $2M–$5M funding or revenue. No benchmark covers engineering drawings.

### Cited Findings
**Benchmarks**
- OmniDocBench formula: Overall = ((1 − text edit distance)×100 + table TEDS + formula CDM)/3. Version history: v1.5 (2025-09-25), v1.6 (2026-04-10), v1.7 (2026-04-30); latest leaderboard additions 2026-09-11. — [OmniDocBench README](https://github.com/opendatalab/OmniDocBench)
- OmniDocBench v1.6 end-to-end leaderboard (Overall / TableTEDS):

  | Model | Overall | TableTEDS | Size |
  |---|---|---|---|
  | TeleOCR | 96.91 | 96.8 | 1.2B |
  | OvisOCR2 | 96.47 | 94.6 | 0.8B |
  | PaddleOCR-VL-1.6 | 96.34 | 94.8 | 0.9B |
  | MinerU2.5-Pro | 95.75 | 93.4 | 1.2B |
  | GLM-OCR | 95.22 | — | — |
  | PaddleOCR-VL-1.5 | 94.93 | — | — |
  | MinerU-2.5 | 93.04 | 87.9 | — |
  | Gemini 3 Pro | 92.91 | 89.2 | — |
  | dots.ocr | 90.77 | — | — |
  | DeepSeek-OCR 2 | 90.25 | — | — |
  | Qwen3-VL-235B | 89.78 | — | — |
  | GPT-5.2 | 86.59 | — | — |
  | MinerU-Pipeline | 86.47 | 81.9 | — |
  | olmOCR (7B) | 85.74 | — | — |
  | Mistral OCR | 85.66 | — | — |
  | Marker (1.8.2) | 78.44 | 65.8 | — |

  Docling (heron layout) and Unstructured 0.16.23 are listed among evaluated tools, but they do not appear in the v1.6 table. — [OmniDocBench README](https://github.com/opendatalab/OmniDocBench)
- olmOCR-bench (1,403 PDFs, about 8,400 unit tests; scores reported by the Chandra repo):

  | Model | Overall | Tables | Old scans |
  |---|---|---|---|
  | Datalab API | 86.7 | 90.7 | 54.6 |
  | Chandra 2 | 85.8 | 92.1 | 51.1 |
  | dots.ocr 1.5 | 83.9 | 90.7 | 48.2 |
  | Chandra 1 | 83.1 | — | — |
  | olmOCR 2 | 82.4 | 84.9 | 47.7 |
  | Marker v1.10 | 76.5 | — | — |
  | DeepSeek-OCR | 75.4 | — | — |
  | Mistral OCR API | 72.0 | — | — |
  | Qwen3-VL-8B | 64.6 | — | — |

  "Old scans" is the hardest category for every model (best is about 55). — [Chandra README](https://github.com/datalab-to/chandra)
- Marker's own (vendor-run) olmOCR-bench comparison of pipeline tools, with throughput on one B200:

  | System | Overall | Born-digital | Throughput |
  |---|---|---|---|
  | Marker 2.0 balanced | 76.0 | 83.5 | 2.9 pg/s |
  | MinerU pipeline | 72.7 | — | 0.54 pg/s |
  | Marker fast | 66.6 | — | — |
  | Docling | 50.3 | 64.0 | 2.1 pg/s |
  | LlamaIndex LiteParse | 22.4 | — | — |

  The Marker README itself says MinerU's VLM backend scores higher than these pipelines. — [Marker README](https://github.com/datalab-to/marker)
- Hindi and Indic OCR (Datalab's internal 43-language benchmark; vendor-run):

  | Language | Chandra 2 | Gemini 2.5 Flash |
  |---|---|---|
  | Hindi | 78.4% | 82.7% |
  | Marathi | 75.0% | — |
  | Tamil | 77.7% | — |
  | Bengali | 72.8% | — |
  | Gujarati | 70.8% | — |
  | Telugu | 58.6% | — |
  | Punjabi | 48.3% | — |

  — [Chandra README](https://github.com/datalab-to/chandra), [Chandra FULL_BENCHMARKS](https://raw.githubusercontent.com/datalab-to/chandra/master/FULL_BENCHMARKS.md)

**Parser profiles**
- **MinerU 4.0** (opendatalab; 82k stars; mineru 4.0.12 on 2026-10-11)
  - Four tiers: Flash, Basic, Standard and Advanced.
  - Inputs: PDF, images, DOC/DOCX, PPT/PPTX, XLS/XLSX, RTF, ODF, EPUB, OFD, HTML and CSV.
  - Runtime: small models on ONNX CPU, and the VLM on llama.cpp/Vulkan, vLLM or LMDeploy. The `basic` tier runs on CPU with about 2 GB RAM; `standard`/`advanced` with ONNX + llama.cpp work on CPU, with Vulkan recommended.
  - Outputs: Markdown, HTML, LaTeX, DOCX, JSON content lists, plus stable `doc/tier/page/block` citation locators.
  - License: "MinerU Open Source License" = Apache 2.0 plus (1) a commercial license required above 100M MAU or US$20M monthly revenue, and (2) an attribution obligation for online services. The license was AGPL-3.0 in earlier versions.
  - Sources: [MinerU README](https://github.com/opendatalab/MinerU), [MinerU LICENSE](https://raw.githubusercontent.com/opendatalab/MinerU/master/LICENSE.md), [PyPI mineru](https://pypi.org/pypi/mineru/json)
- **Docling** (IBM → docling-project; MIT; 69k stars; v2.142.1 on 2026-10-23; docling-serve v1.38.1)
  - Formats: PDF, DOCX, PPTX, XLSX, HTML, EPUB, EML/MSG email, images, LaTeX, ODF, audio and video.
  - PDF handling: layout, reading order, table structure, formulas and charts-to-tables.
  - VLMs including GraniteDocling-258M; "Local execution … air-gapped".
  - Integrations: MCP server, API server, and LangChain, LlamaIndex and Haystack.
  - The Docling v1 tech report (arXiv 2408.09869, Aug–Dec 2024) uses DocLayNet layout and TableFormer models.
  - Sources: [Docling README](https://github.com/docling-project/docling), [Docling tech report](https://arxiv.org/abs/2408.09869)
- **Marker 2.0** (Datalab; 41k stars; v2.0.0 in July 2026)
  - Code is now Apache 2.0 (it was GPL). Weights use a "modified AI Pubs Open Rail-M license (free for research, personal use, and startups under $5M funding/revenue)".
  - Layout, OCR and tables go through one Surya VLM served by vLLM or llama.cpp. `--use_llm` can call Ollama or OpenAI-compatible models. A table-only `TableConverter` is included.
  - — [Marker README](https://github.com/datalab-to/marker)
- **Surya 2**: Apache-2.0 code, with the same weight restrictions as Marker. Scores 83.3% on olmOCR-bench ("top under 3B params") and 87.2% on Datalab's internal 91-language set. — [Surya README](https://github.com/datalab-to/surya)
- **Chandra 2** (March 2026; 90+ languages, handwriting, forms with checkboxes): weights are modified OpenRAIL-M, "free for … startups under $2M funding/revenue, cannot be used competitively with our API"; "Commercial self-hosting requires a license". — [Chandra README](https://github.com/datalab-to/chandra)
- **Unstructured** (Apache-2.0; v0.27.34 on 2026-10-22; 16k stars)
  - The open-source library uses Tesseract for OCR.
  - Unstructured's own claim is that its paid Transform v2 API reaches "2x table content accuracy, 58% less invented content, 0.878 text accuracy (vs. 0.715)" compared with the open-source library.
  - It sends telemetry by default.
  - — [Unstructured README](https://github.com/Unstructured-IO/unstructured)
- **Apache Tika**: the current release is 4.1.0 (4.x line), and 3.3.3 is a support release.
  - 4.0.0 "switches the default output to Markdown, moves parsing into crash-isolated forked processes".
  - 4.1.0 selects OCR engines by name via "text-recognizers".
  - — [tika.apache.org](https://tika.apache.org/)
- **OCRmyPDF** (MPL-2.0; v17.13.0 on 2026-09-28; 35k stars)
  - Adds a Tesseract text layer to produce PDF/A, with deskew, rotate and clean options. Tesseract supports 100+ languages, including Hindi.
  - It is a pre-processor, not a layout or table parser.
  - — [OCRmyPDF README](https://github.com/ocrmypdf/OCRmyPDF), [PyPI](https://pypi.org/pypi/ocrmypdf/json)
- **PaddleOCR** (Apache-2.0; 92k stars; v3.7.0 in June 2026). PaddleOCR-VL is integrated as an extraction engine by Open WebUI and RAGFlow ("Self-hosted PaddleOCR-VL deployment support", RAGFlow v0.27.2, Sep 2026). — [PaddleOCR repo](https://github.com/PaddlePaddle/PaddleOCR), [RAGFlow release notes](https://raw.githubusercontent.com/infiniflow/ragflow/main/docs/release_notes.md), [Open WebUI README](https://github.com/open-webui/open-webui)
- **LlamaIndex LiteParse**: an open-source, local, npm-installable parser announced in LlamaIndex's 24 Mar 2026 newsletter; LlamaParse remains the paid hosted product. LiteParse scores low on olmOCR-bench in Datalab's test (22.4). — [LlamaIndex newsletter](https://www.llamaindex.ai/blog/llamaindex-newsletter-2026-03-24), [Marker README](https://github.com/datalab-to/marker)

### Inferences
- For GEM AI's scanned datasheets, test reports and registers, a reasonable Python sidecar would be:
  - **MinerU 4 (standard tier) or PaddleOCR-VL** for scanned and complex pages and tables.
  - **Docling** for Office and email formats and as a fast path for born-digital PDFs.
  - **OCRmyPDF** to produce searchable archival PDFs.
  - All of these are permissively licensed for GEM AI's scale.
- Marker, Surya and Chandra need a paid license once a GEM AI customer or GEM AI itself exceeds $2M–5M revenue or funding. Treat them as benchmarks, not components.
- Hindi: Chandra 2 (78%) and Gemini (83%) are the only Hindi numbers found. The VLM parsers (PaddleOCR-VL, MinerU) should be validated on GEM AI's own Hindi and Devanagari samples before committing.

### Gaps
- No public benchmark covers engineering drawings (title blocks, dimensions, GD&T, BOM tables). OmniDocBench and olmOCR-bench cover papers, books, forms and old scans. GEM AI will need its own evaluation set.
- No current OmniDocBench score was found for Docling.
- No Hindi OCR scores were found for MinerU or PaddleOCR-VL.
- No independent (non-vendor) replication of the Datalab throughput numbers was found.

---

## Q3. Which retrieval techniques give measurable gains over GEM AI's current hybrid (Postgres FTS + pgvector) search?

### Takeaway
In the published evidence, the biggest gains come from (1) **adding a cross-encoder reranker** and (2) **contextual retrieval**: prepending an LLM-written 50–100-token context to each chunk before embedding and BM25 indexing. Anthropic measured top-20 retrieval failures falling from 5.7% to 2.9% with contextual embeddings plus contextual BM25 (−49%), and to 1.9% when reranking was added (−67%). Smaller but cheap gains:
- **Late chunking**: about +1.5 to +1.9 nDCG@10 points on BEIR subsets.
- **True BM25** in Postgres (ts_rank is not BM25).

ColPali-style page-image retrieval gives large gains on visually rich pages (ViDoRe nDCG@5 81.3 vs 66.1 for OCR + BGE-M3), but costs about 30× more storage per page.

### Cited Findings
- **Contextual retrieval** (Anthropic, Sept 2024)
  - Metric: 1 − recall@20. Baseline 5.7%; contextual embeddings 3.7% (−35%); plus contextual BM25 2.9% (−49%); plus reranking 1.9% (−67%).
  - Setup: retrieve top-150, rerank (Cohere), pass top-20 to the model. Context is 50–100 tokens, generated with Claude 3 Haiku. One-time cost is about $1.02 per million document tokens with prompt caching.
  - Domains: codebases, fiction, arXiv and science papers.
  - — [Anthropic: Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval)
- **Late chunking** (Jina; arXiv 2409.04701, v3 July 2025)
  - Method: embed the whole document with a long-context model, then mean-pool token embeddings per chunk. No training needed.
  - Results with fixed 256-token chunks: average nDCG@10 52.2 → 54.0. Relative gains: +3.63% (sentence boundaries), +3.46% (fixed), +2.70% (semantic).
  - Biggest single gains: NFCorpus with jina-v2-small, 23.5 → 30.0; TREC-COVID with jina-v3, 73.0 → 77.2.
  - Requires an embedding model that exposes token embeddings (not just an OpenAI-compatible `/embeddings` endpoint).
  - — [Late Chunking paper (HTML v3)](https://arxiv.org/html/2409.04701v3)
- **ColPali** (ICLR 2025; arXiv 2407.01449)
  - ViDoRe average nDCG@5: ColPali 81.3, Unstructured + OCR + BGE-M3 66.1, Unstructured + captioning + BGE-M3 67.0, BM25 + OCR 65.5.
  - Indexing: 0.39 s/page vs 7.22 s/page for the OCR + captioning pipeline.
  - Storage: about 257.5 KB/page (float16 multi-vector) vs 8.6 KB/page for BGE-M3.
  - — [ColPali paper](https://arxiv.org/html/2407.01449v6)
- ColPali tooling: the `illuin-tech/colpali` library (MIT; v0.3.18 in Aug 2026). — [colpali repo](https://github.com/illuin-tech/colpali)
- Postgres support for multi-vector search: VectorChord 0.3 (Apr 2025) added multi-vector MaxSim support "like ColBERT, ColPali, and ColQwen", and its docs recommend sentence-level ANN followed by token-level late-interaction rerank. — [VectorChord ColBERT rerank docs](https://docs.vectorchord.ai/vectorchord/use-case/colbert-rerank.html), [VectorChord repo](https://github.com/tensorchord/VectorChord)
- Morphik Core also uses ColPali, but it is BSL 1.1, with production use allowed only under US$2,000/month attributable revenue (change date 2029-06-18). — [Morphik LICENSE](https://raw.githubusercontent.com/morphik-org/morphik-core/main/LICENSE)
- **Rerankers** (scores from the Qwen model card, reranking top-100 from Qwen3-Embedding-0.6B; authors' own runs). MMTEB-R is multilingual.

  | Model | License | MTEB-R | MMTEB-R | MLDR |
  |---|---|---|---|---|
  | Qwen3-Reranker-0.6B | Apache-2.0 | 65.80 | 66.36 | 67.28 |
  | Qwen3-Reranker-4B | Apache-2.0 | 69.76 | 72.74 | — |
  | Qwen3-Reranker-8B | Apache-2.0 | 69.02 | 72.94 | — |
  | bge-reranker-v2-m3 | — | 57.03 | 58.36 | 59.51 |
  | gte-multilingual-reranker-base | — | 59.51 | — | — |
  | jina-multilingual-reranker-v2-base | — | 58.22 | — | — |

  — [Qwen3-Reranker-0.6B model card](https://huggingface.co/Qwen/Qwen3-Reranker-0.6B). The bge-reranker-v2-m3 license is reported inconsistently (Apache-2.0 vs MIT) by secondary sources. — [search summary](https://benchmarklist.com/models/bge-reranker-v2-m3/)
- Rerank serving for a Node API: Hugging Face TEI (Apache-2.0; v1.9.4 in Sep 2026) and Infinity (MIT; v0.0.78 on 2026-10-19) are maintained self-hosted embedding and rerank servers. — [TEI repo](https://github.com/huggingface/text-embeddings-inference), [Infinity repo](https://github.com/michaelfeil/infinity)
- **BM25 inside Postgres**
  - **pg_textsearch** (Timescale/Tiger Data): PostgreSQL license; v1.5.1 in Oct 2026; 4k stars. "BM25 ranking with configurable k1 and b", Block-Max WAND top-k, and it reuses Postgres text-search configs (partial index per language). **It supports PostgreSQL 17 and 18 only.** — [pg_textsearch README](https://github.com/timescale/pg_textsearch)
  - **ParadeDB pg_search** (AGPL-3.0; v0.26.3 on 2026-10-22; 9.4k stars): Tantivy-based BM25, hybrid search, facets and joins, with a Drizzle integration. Recent READMEs state support from PostgreSQL 15. Managed services (RDS) cannot install it. — [ParadeDB README](https://github.com/paradedb/paradedb), [pg_search README on PGXN](https://pgxn.org/dist/pg_search/pg_search/README.html)
  - **VectorChord-bm25**: v0.3.0, Dec 2025; last commit Apr 2026. — [repo](https://github.com/tensorchord/VectorChord-bm25)
- PostgreSQL 16's built-in Snowball stemmers include `hindi` (alongside `nepali` and `tamil`), so a native Hindi FTS config exists. — [postgres snowball_create.pl (REL_16_STABLE)](https://github.com/postgres/postgres/blob/REL_16_STABLE/src/backend/snowball/snowball_create.pl)
- **Query decomposition / agentic retrieval** is now standard in the platforms:
  - RAGFlow "breaks it down, retrieves knowledge, and verifies evidence" across multiple rounds — [RAGFlow README](https://github.com/infiniflow/ragflow)
  - Onyx has "Agentic RAG" and "Deep Research" — [Onyx README](https://github.com/onyx-dot-app/onyx)
  - LlamaIndex's `LLMSynonymRetriever` generates keyword and synonym expansions — [LlamaIndex PropertyGraphIndex guide](https://developers.llamaindex.ai/python/framework/module_guides/indexing/lpg_index_guide/)

### Inferences
- Priority order for GEM AI, by expected gain per effort:
  1. A reranker (Qwen3-Reranker-0.6B, or bge-reranker-v2-m3 for lower latency) on the top 50–150 hybrid candidates.
  2. Contextual chunk headers using GEM AI's own Ollama models: document title, section path, equipment or tag IDs, revision. Feed them into both the embedding and the tsvector.
  3. A true BM25 (pg_search on PG16, or pg_textsearch after upgrading to PG17+) with RRF fusion.
  4. Optional ColPali/ColQwen page embeddings only for drawings and datasheet pages, given the storage cost.
- Hindi: Postgres's `hindi` config plus a multilingual embedder and a multilingual reranker (Qwen3 MMTEB-R 66–73) gives a fully self-hosted Hindi path.

### Gaps
- No published benchmark measures these techniques on engineering corpora or Hindi/English mixed documents.
- The Anthropic and ColPali numbers come from 2024 and 2025 models and datasets.
- No benchmark was found on query decomposition gains over plain hybrid search, beyond vendor claims.
- MTEB leaderboard numbers for bge-reranker-v2-m3 vs Qwen3 come only from Qwen's own runs.

---

## Q4. Is any platform better adopted wholesale than extended in GEM AI, and what would GEM AI lose?

### Takeaway
No. Every mature full platform would replace GEM AI's single Postgres with a multi-store stack:
- Onyx: Postgres + OpenSearch + Redis + MinIO.
- RAGFlow: MySQL + Elasticsearch/Infinity + MinIO + NATS + Kvrocks, now in Go.
- Dify: multiple stores, with a non-OSI license restricting multi-tenant use.
- PipesHub: Neo4j/ArangoDB + Qdrant + MongoDB + Redis/Kafka.

Adopting any of them would break GEM AI's per-project SQL permission checks, numbered citations and versioning, and Hindi handling would also have to be re-validated in the new stack. The one platform built on Postgres + pgvector, R2R, is effectively unmaintained. The best path is to keep GEM AI's Knowledge module and borrow components (parsers, reranker, BM25 extension) and ideas (Onyx ACL sync, RAGFlow chunk templates and deletion snapshots, MinerU locators, Quivr's re-authorize-on-read).

### Cited Findings

#### Full platforms
- **Onyx**
  - Maturity: 33k stars; v4.9.4 on 2026-10-22; last commit 2026-10-23. — [Onyx repo](https://github.com/onyx-dot-app/onyx)
  - Features: "50+ applications"; agentic RAG on a hybrid index; deep research; MCP server; Slack/Discord bots. Supports Ollama, LiteLLM and vLLM. Air-gappable. — [Onyx README](https://github.com/onyx-dot-app/onyx)
  - Storage: "as of v3, Onyx uses both Vespa and OpenSearch"; "v4 … uses OpenSearch entirely without Vespa". The standard deployment adds Redis and MinIO. — [OpenSearch migration doc](https://docs.onyx.app/admins/advanced_configs/opensearch_document_index_migration.md), [README](https://github.com/onyx-dot-app/onyx)
  - License: MIT CE + EE (permission sync, SSO, RBAC are EE). — see Q1
- **RAGFlow** (InfiniFlow)
  - Maturity: Apache-2.0; 93k stars; v1.0.0-rc2 in Oct 2026; last commit 2026-10-23. — [RAGFlow repo](https://github.com/infiniflow/ragflow)
  - Architecture: 1.0.0-rc1 (2026-09-29) is "a comprehensive rewrite of RAGFlow in Go". The queue moved from Redis to NATS, and Kvrocks serves as cache. Base services are Elasticsearch (or Infinity/OpenSearch), MySQL (OceanBase alternative), MinIO, NATS and Kvrocks.
  - Known issues in rc1: "DeepDoc currently supports CPU environments only" and the Team/Me permission model was not yet supported.
  - rc2: unified the 12 built-in parsers with pipeline parsers, and added MinerU 4.
  - — [RAGFlow release notes](https://raw.githubusercontent.com/infiniflow/ragflow/main/docs/release_notes.md), [README](https://github.com/infiniflow/ragflow)
  - Features: DeepDoc (layout, OCR, table recognition), template-based chunking, Knowledge Compilation (2026-08-19: wikis, graphs, trees, PageIndex, mind maps, timelines), agentic retrieval, "multiple recall paired with fused re-ranking", grounded citations, and memory APIs (Dec 2025 onward; user-level memory in Apr 2026). — [README](https://github.com/infiniflow/ragflow), [release notes](https://raw.githubusercontent.com/infiniflow/ragflow/main/docs/release_notes.md)
  - Connectors: S3, Google Drive, Notion, Confluence and Discord (Nov 2025); Jira and S3-compatible; Gmail and Dropbox; Outlook, OneDrive, Teams, Slack, SharePoint, Salesforce and Azure Blob (Jun 2026); BigQuery with incremental sync; IMAP; GitHub; Bitbucket; Airtable; WebDAV; Azure DevOps; Sitemap; and a generic REST connector.
  - Sync details: deleted-file sync via a snapshot mechanism (Apr–May 2026), and S3 ETag incremental sync. — [release notes](https://raw.githubusercontent.com/infiniflow/ragflow/main/docs/release_notes.md)
- **Dify**
  - Maturity: 159k stars; v1.18.0 on 2026-10-23. — [Dify repo](https://github.com/langgenius/dify)
  - License: "Dify Open Source License", a modified Apache 2.0. You "may not use the Dify source code to operate a multi-tenant environment" (tenant = workspace) without written authorization, and may not remove the logo or copyright from the frontend. — [Dify LICENSE](https://raw.githubusercontent.com/langgenius/dify/main/LICENSE)
  - Knowledge pipeline: data-source plugins introduced in v1.9.0 (Notion, Confluence, GitHub, OneDrive, Google Drive, Box, S3, Jina Reader, Firecrawl). Vector stores include pgvector, Qdrant, Weaviate, Milvus and OpenSearch. — [Dify datasource plugin docs](https://docs.dify.ai/zh/develop-plugin/dev-guides-and-walkthroughs/datasource-plugin.md), [Dify blog](https://www.dify.ai/blog/knowledge-pipeline-plugin-ecosystem-co-build-enterprise-grade-rag-with-global-partners)
- **AnythingLLM** (Mintplex)
  - Maturity: MIT; 67k stars; v1.18.0 in Oct 2026; active. **Node.js** server and "collector" document parser.
  - Storage and models: LanceDB by default, with PGVector support. Ollama, LiteLLM and generic OpenAI-compatible embeddings.
  - Multi-user permissions in the Docker version only. Memories, scheduled tasks, MCP.
  - — [AnythingLLM README](https://github.com/Mintplex-Labs/anything-llm)
- **Kotaemon** (Cinnamon)
  - Maturity: Apache-2.0; 26k stars; v0.12.0 in May 2026, also the last commit (slowing).
  - Gradio UI; hybrid full-text + vector with reranking; citations in a PDF viewer with highlights; multi-user private/public collections; GraphRAG (MS GraphRAG, nano-graphrag, LightRAG); Ollama support. Uses Unstructured for non-PDF formats.
  - — [Kotaemon README](https://github.com/Cinnamon/kotaemon)
- **R2R** (SciPhi)
  - Maturity: MIT; 8k stars. Last GitHub release v3.6.5 in Jun 2025; last commit Nov 2025; PyPI r2r 3.6.6 on 2025-08-17. Effectively dormant.
  - Features: hybrid search, knowledge graphs, a Deep Research API. Quickstart uses `OPENAI_API_KEY`; Docker "full" mode with a `postgres` profile.
  - — [R2R README](https://raw.githubusercontent.com/SciPhi-AI/R2R/main/py/README.md), [PyPI r2r](https://pypi.org/pypi/r2r/json)
- **Weaviate Verba**: "Project Discontinued — Repository Archived." Last release v2.1.3 in Jul 2025. — [Verba README](https://github.com/weaviate/Verba)
- **Open WebUI**
  - Maturity: 157k stars; v0.12.3 in Oct 2026.
  - License: Open WebUI License (BSD-3 plus a branding clause). Altering the "Open WebUI" branding is prohibited unless the deployment has ≤50 end users in a rolling 30-day window, or written permission or an enterprise license is obtained.
  - RAG: 9 vector DBs including PGVector; extraction via Tika, Docling, Document Intelligence, Mistral OCR or PaddleOCR-VL; hybrid BM25 + vector with reranking; SQLite or PostgreSQL.
  - — [Open WebUI README](https://github.com/open-webui/open-webui), [Open WebUI LICENSE](https://raw.githubusercontent.com/open-webui/open-webui/main/LICENSE)
- **PrivateGPT** (Zylon)
  - Maturity: Apache-2.0; 58k stars; v1.0.1 in Jun 2026; active.
  - Repositioned as "the open-source API layer that turns local models into production AI applications", following the Claude API model. It provides ingestion, retrieval with citations and agentic RAG over any OpenAI-compatible server (Ollama, llama.cpp, vLLM), and powers Zylon's on-prem product.
  - — [PrivateGPT README](https://github.com/zylon-ai/private-gpt)
- **Quivr**
  - Status: V2 is a full rewrite at "evaluation stage … Do not run it in production". Last classic release core-0.0.33 in Feb 2025.
  - Stack: Go monolith, PostgreSQL 17 catalog, S3/SeaweedFS, Temporal, Weaviate (lexical + vector), TEI with multilingual-e5-small.
  - Ideas worth borrowing: idempotency keys, immutable versions, rebuildable indexes, and re-authorizing every hit on read.
  - — [Quivr README](https://github.com/QuivrHQ/quivr)
- **Khoj**
  - Maturity: AGPL-3.0; 38k stars. Latest GitHub release v2.0.0-beta.28 in Mar 2026; last commit Aug 2026; PyPI khoj 1.42.10 in Jul 2025. The team has shifted focus to "Pipali".
  - Positioned as a personal "AI second brain"; enterprise version available.
  - — [Khoj README](https://github.com/khoj-ai/khoj), [PyPI khoj](https://pypi.org/pypi/khoj/json)
  - It uses a pgvector database (third-party deploy template, not official docs). — [Railway template](https://railway.com/deploy/khoj-ai-second-brain)
- **Glean-like alternatives**
  - PipesHub: Apache-2.0; 3.8k stars; v0.10.0 in Oct 2026. Node.js API plus Python connector, indexing and query services. Storage: Neo4j/ArangoDB, Qdrant, MongoDB, Redis/Kafka. Parsing with Docling + pdfplumber, or a VLM for scans. Ollama supported. — [PipesHub README](https://github.com/pipeshub-ai/pipeshub-ai)
  - Airweave: MIT; 6.6k stars; v0.9.73 in Jun 2026; last commit Jun 2026. Postgres metadata + Vespa vectors; TS and Python SDKs; MCP. — [Airweave README](https://github.com/airweave-ai/airweave)
  - SWIRL: Apache-2.0; v4.5.0.7 in Jun 2026. — [SWIRL repo](https://github.com/swirlai/swirl-search)
  - Morphik: BSL 1.1. — [Morphik LICENSE](https://raw.githubusercontent.com/morphik-org/morphik-core/main/LICENSE)

#### Libraries and frameworks
- **LlamaIndex** (Python)
  - Maturity: MIT; 53k stars; llama-index-core 0.14.25 on 2026-09-21. — [PyPI](https://pypi.org/pypi/llama-index-core/json), [repo](https://github.com/run-llama/llama_index)
  - PropertyGraphIndex: extractors (SimpleLLMPath, Implicit, DynamicLLMPath, SchemaLLMPath) and retrievers (LLMSynonym, VectorContext, TextToCypher, CypherTemplate). Graph stores are Neo4j, Nebula, TiDB, FalkorDB or in-memory; no Postgres graph store is listed. — [PropertyGraphIndex guide](https://developers.llamaindex.ai/python/framework/module_guides/indexing/lpg_index_guide/)
  - **LlamaIndex.TS is "deprecated and no longer maintained"**. — [LlamaIndexTS README](https://github.com/run-llama/LlamaIndexTS)
- **Haystack** (deepset)
  - Maturity: Apache-2.0; 27k stars; haystack-ai 3.4.1 on 2026-10-21 (major version 3.x).
  - Pipelines and agents with hooks; Hayhooks serves pipelines as REST, MCP or OpenAI-compatible endpoints; the paid Enterprise Platform adds governance and access controls.
  - — [Haystack README](https://github.com/deepset-ai/haystack), [PyPI](https://pypi.org/pypi/haystack-ai/json)
- **LangChain / LangGraph**
  - Maturity: MIT; langchain-core 1.7.0 on 2026-10-22; LangGraph v1.2.17 on 2026-10-24; langchainjs is active; langchain-postgres 0.0.19 on 2026-10-06. — [langchain repo](https://github.com/langchain-ai/langchain), [langgraph repo](https://github.com/langchain-ai/langgraph), [PyPI langchain-postgres](https://pypi.org/pypi/langchain-postgres/json)
  - The indexing API (RecordManager) hashes documents to skip unchanged content. Cleanup modes: `None`, `incremental`, `full` (the only mode that deletes removed sources; it needs the full dataset) and `scoped_full`. It requires a vector store with add and delete by ID. — [LangChain indexing how-to](https://python.langchain.com/docs/how_to/indexing), [JS version](https://js.langchain.com/docs/how_to/indexing)
- **txtai** (NeuML)
  - Maturity: Apache-2.0; 13k stars; v9.14.0 on 2026-10-06.
  - "Embeddings database" combining sparse and dense indexes, graph and relational DB, with SQL queries; RAG; smolagents-based agents; LiteLLM and llama.cpp support.
  - — [txtai README](https://github.com/neuml/txtai)

### Inferences
- **What GEM AI would lose by adopting a platform wholesale:**
  - Its single-database property: every candidate needs OpenSearch, ES, Qdrant, Weaviate, Neo4j or Mongo.
  - Its per-project SQL permission checks, which would be replaced by coarser workspace, team or group models. Onyx EE and PipesHub add source ACLs, but in their own stores.
  - Its numbered-citation and version model.
  - Its TypeScript/Node codebase: Onyx, RAGFlow, Dify and Kotaemon are Python or Go.
  - Its license freedom: Dify forbids multi-tenant use; Open WebUI restricts branding above 50 users; Onyx keeps permission sync in EE.
- **Closest "embed as component" fits:**
  - Docling-serve, MinerU and PaddleOCR-VL as a Python parsing sidecar.
  - TEI or Infinity for reranking.
  - pg_search (PG16-compatible, AGPL) or pg_textsearch (needs PG17+, PostgreSQL license) for BM25.
  - The LangChain.js RecordManager pattern for incremental sync and deletes.
- **Ideas to take:**
  - Onyx: ACL-sync connectors, refresh/prune split, sync-owned ACLs.
  - RAGFlow: chunk templates per document type, deletion snapshots, ETag-incremental sync, knowledge-compilation artifacts (wikis and timelines per dataset), and memory APIs.
  - MinerU: page/block locators for citations.
  - Quivr V2: re-authorize every hit on read; rebuildable indexes.
  - Kotaemon: citation highlighting in a PDF viewer.
- **TS ecosystem:** LlamaIndex.TS is deprecated and LangChain.js remains maintained. GEM AI's own TS implementation is the safer long-term base, and Python libraries should stay behind a sidecar.

### Gaps
- No independent head-to-head RAG-quality benchmark of Onyx vs RAGFlow vs Dify vs Open WebUI was found.
- I did not verify which Onyx, RAGFlow or Dify components handle Hindi tokenization: ES/OpenSearch analyzers vs Postgres `hindi`.
- I could not confirm R2R's official status (archived or pivoted). Only the release and commit dates show dormancy.
- Exact Onyx EE pricing and PipesHub production references were not found.

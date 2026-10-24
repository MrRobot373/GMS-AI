# Postgres-native and open-model building blocks for an "organization brain" in GEM AI (state as of 24 Oct 2026)

Scope: what can be built inside GEM AI's existing TypeScript (Node 22, Fastify, Drizzle) + Postgres 16 + pgvector stack, using open models served locally or through OpenAI-compatible endpoints. Version numbers and dates come from primary sources: GitHub raw changelogs and READMEs, PGXN, the npm and PyPI registries, Hugging Face model cards and postgresql.org, all fetched on 2026-10-24. Vendor benchmarks are flagged **[VENDOR]**.

Note on method: github.com HTML pages and the GitHub API were blocked from this environment. Release data therefore comes from raw.githubusercontent.com files, PGXN, npm, PyPI and Docker Hub. Where a release date could not be confirmed, it is listed under Gaps.

---

## Key question 1: Can one Postgres (pgvector + full text or a BM25 extension + optional AGE) run the brain at 100k pages and millions of memory items with permission filters? Which indexes and settings?

### Takeaway
Yes, comfortably at this scale, with caveats.

- **Scale.** 100k pages is roughly 0.3–1M chunks. Add a few million memory items and the total is about 1–10M vectors. Published Postgres vector benchmarks run at 10M to 50M+ vectors on one node.
- **What it needs:**
  - pgvector ≥0.8 with iterative index scans turned on. Permission predicates are post-filters on HNSW.
  - `halfvec` storage or expression indexes.
  - Partitioning or partial indexes for very selective tenant or project filters.
  - A real BM25 index in place of `ts_rank`.
  - Edge tables with recursive CTEs as the default graph layer. Apache AGE stays optional.
  - A Postgres-backed job queue (pg-boss or graphile-worker).
- **The hard constraint is version, not scale.** GEM is on PG16. The best permissively licensed BM25 extension, pg_textsearch, needs PG17 or PG18. Native temporal constraints need PG18. PostgreSQL 19 is at RC1, so planning a jump to PG18 now makes sense.

### Cited Findings

**Postgres versions (timing context)**
- Current supported minors on postgresql.org: 18.6, 17.11, 16.15. "October 15, 2026: PostgreSQL 19 RC 1 Released!" PG19 GA was not yet announced on the versioning page — [PostgreSQL versioning policy](https://www.postgresql.org/support/versioning/)
- PG18 added:
  - an asynchronous I/O subsystem (`io_method`) for sequential scans, bitmap heap scans and vacuums
  - B-tree skip scan
  - `uuidv7()`
  - virtual generated columns
  - `OLD`/`NEW` in `RETURNING`
  - temporal constraints: `WITHOUT OVERLAPS` for PRIMARY KEY/UNIQUE and `PERIOD` for foreign keys

  Source: [PostgreSQL 18 release notes](https://www.postgresql.org/docs/release/18.0/)
- PG19 release notes include:
  - "Improve NOTIFY to only wake up backends that are listening to specified notifications (Joel Jacobson)"
  - an EXPLAIN ANALYZE `IO` option
  - a new documentation section on temporal tables

  No `FOR PORTION OF` temporal UPDATE/DELETE and no SQL/PGQ `GRAPH_TABLE` entry was found in the notes — [PostgreSQL 19 release notes (devel docs)](https://www.postgresql.org/docs/19/release-19.html)

**pgvector (core vector search)**
- **Versions and dates:**

  | Version | Date | Key changes |
  |---|---|---|
  | 0.8.7 | 2026-10-01 | Fixed an IVFFlat build buffer overflow |
  | 0.8.6 | 2026-07-29 | |
  | 0.8.5 | 2026-07-08 | |
  | 0.8.4 | 2026-06-30 | Fixed "hnsw graph not repaired" error in HNSW vacuuming |
  | 0.8.3 | 2026-06-17 | Fixed possible index corruption in HNSW vacuuming |
  | 0.8.2 | 2026-02-25 | Fixed buffer overflow in parallel HNSW build |
  | 0.8.1 | 2025-09-04 | PG18 support |
  | 0.8.0 | 2024-10-30 | Iterative index scans; better cost estimation for filtering; faster HNSW scans and inserts |
  | 0.9.0 | unreleased | Drops PG13 and PG14 |

  Sources: [pgvector CHANGELOG](https://github.com/pgvector/pgvector/blob/master/CHANGELOG.md); release dates confirmed on [PGXN vector](https://pgxn.org/dist/vector/)
- **0.7.0 (2024-04-29)** added `halfvec`, `sparsevec`, `bit` indexing, `binary_quantize`, Hamming/Jaccard distances and `subvector`. **0.6.0** added parallel HNSW builds — [pgvector CHANGELOG](https://github.com/pgvector/pgvector/blob/master/CHANGELOG.md)
- **Index dimension limits:** `vector` up to 2,000 dims; `halfvec` up to 4,000; `bit` up to 64,000; `sparsevec` up to 1,000 non-zero elements — [pgvector README](https://github.com/pgvector/pgvector)
- **Storage per vector:** `vector` is 4×dims+8 bytes; `halfvec` is 2×dims+8 bytes — [pgvector README](https://github.com/pgvector/pgvector)
- **Filtering is applied after the approximate index scan.** "If a condition matches 10% of rows, with HNSW and the default `hnsw.ef_search` of 40, only 4 rows will match on average." The fix is iterative scans:
  - `SET hnsw.iterative_scan = strict_order | relaxed_order`
  - `hnsw.max_scan_tuples` (default 20,000)
  - `hnsw.scan_mem_multiplier` (multiple of work_mem)
  - `ivfflat.iterative_scan`, `ivfflat.max_probes`

  Source: [pgvector README – filtering / iterative index scans](https://github.com/pgvector/pgvector#iterative-index-scans)
- **pgvector's own guidance for filters:**
  - partial indexes when filtering on a few distinct values
  - partitioning when filtering on many values
  - "For tenant isolation, use list partitioning or separate tables"

  Source: [pgvector README – filtering](https://github.com/pgvector/pgvector#filtering)
- **Build tuning:** builds are much faster when the graph fits in `maintenance_work_mem` (e.g. `SET maintenance_work_mem='8GB'`). Use `max_parallel_maintenance_workers` (default 2) for parallel builds. A non-partitioned table is capped at 32 TB by default — [pgvector README](https://github.com/pgvector/pgvector)
- **[VENDOR: AWS] pgvector 0.8.0 benchmark.** Setup: 10M products, 384-dim, Aurora db.r8g.4xlarge.
  - One filtered query's p99 fell from 123.3 ms (0.7.4, ef_search=40) and 394.1 ms (0.7.4, ef_search=200) to 13.1 ms (0.8.0, ef_search=40, relaxed_order). That is 9.4x faster.
  - Category-filtered queries went from >120 ms to ~70 ms.
  - Result completeness improved "up to 100 times" for selective filters.
  - AWS claims relaxed_order "typically" keeps 95–99% of result quality vs strict ordering.

  Source: [AWS Database Blog – pgvector 0.8.0 on Aurora](https://aws.amazon.com/blogs/database/supercharging-vector-search-performance-and-relevance-with-pgvector-0-8-0-on-amazon-aurora-postgresql/)

**pgvectorscale (StreamingDiskANN)**
- pgvectorscale adds three things:
  - a StreamingDiskANN index (inspired by Microsoft's DiskANN)
  - Statistical Binary Quantization (SBQ)
  - label-based filtered search based on Microsoft's Filtered DiskANN

  Labels are declared in the index and stored as a `SMALLINT[]` column. It is written in Rust/PGRX and installs pgvector via CASCADE — [pgvectorscale README](https://github.com/timescale/pgvectorscale)
- The main branch is at `0.9.2-dev` — [pgvectorscale Cargo.toml](https://github.com/timescale/pgvectorscale/blob/main/pgvectorscale/Cargo.toml)
- A third-party blog reports 0.9.0 (Nov 2025):
  - parallel index builds, which require SBQ storage, cannot be used with labels, and kick in by default at ≥65,536 vectors
  - PG18 support

  Source: [thebuild.com – on pgvectorscale and hybrid search](https://thebuild.com/blog/on-pgvectorscale-and-hybrid-search-without-an-elasticsearch-sidecar/). Not confirmed against official release notes.
- **[VENDOR: Tiger Data/Timescale] 50M Cohere 768-dim vectors, unfiltered ANN only, AWS r6id.4xlarge (16 vCPU, 128 GB RAM, NVMe):**

  | At 99% recall | pgvector + pgvectorscale | Qdrant |
  |---|---|---|
  | Throughput | 471.57 QPS | 41.47 QPS (11.4x lower) |
  | p50 latency | 31.07 ms | 30.75 ms |
  | p95 latency | 60.42 ms | 36.73 ms |
  | p99 latency | 74.60 ms | 38.71 ms |

  Qdrant builds indexes faster. Tiger admits it struggled to tune Qdrant's HNSW parameters. "The queries did not involve filtering." Source: [Tiger Data – pgvector vs Qdrant](https://www.tigerdata.com/blog/pgvector-vs-qdrant)

**VectorChord**
- VectorChord (vchord) uses RaBitQ quantization plus reranking. It is compatible with pgvector types and syntax, and depends on pgvector. It supports prefiltering ("Prefilter" doc) and offers 4-bit and 8-bit RaBitQ types; the claim is "<1% recall loss" for RaBitQ8.
- **[VENDOR]** claims:
  - 100M × 768-dim vectors on an AWS i4i.xlarge ($247/mo)
  - indexing 100M vectors in 20 minutes
  - 1B scale on PostgreSQL
- License: dual **AGPLv3 or Elastic License v2**.

  Source: [VectorChord README](https://github.com/tensorchord/VectorChord)
- Versions: 1.1.1 (2026-02-28), 1.1.0 (2026-02-11), 1.0.0 (2025-11-12). Docker image `ghcr.io/tensorchord/vchord-postgres:pg18-v1.1.1` — [PGXN vchord](https://pgxn.org/dist/vchord/); [VectorChord README](https://github.com/tensorchord/VectorChord)

**When to leave Postgres (dedicated vector DBs)**
- **Qdrant** combines vector and payload indexes. Payload indexes are also used "to accurately estimate the filter cardinality, which helps the query planning choose a search strategy" — [Qdrant docs – Indexing](https://qdrant.tech/documentation/concepts/indexing/). Latest tag v1.20.0, published to Docker Hub 2026-10-21 — [Docker Hub qdrant/qdrant tags](https://hub.docker.com/r/qdrant/qdrant/tags)
- **Weaviate** pre-filters with an inverted index next to HNSW. "Starting in v1.34, Weaviate uses the ACORN filter strategy as the default" for low-correlation filters — [Weaviate docs – Filtering](https://docs.weaviate.io/weaviate/concepts/filtering)
- **Tiger's own benchmark** concedes that Qdrant has better tail latency and horizontal scale-out — [Tiger Data – pgvector vs Qdrant](https://www.tigerdata.com/blog/pgvector-vs-qdrant)

**Keyword / BM25 inside Postgres**
- **Built-in `ts_rank` versus BM25.** `ts_rank` has:
  - no inverse document frequency
  - no term-frequency saturation
  - no efficient top-k path ("scoring requires touching every matching row")

  Source: **[VENDOR: Tiger]** [Tiger Data – pg_textsearch blog](https://www.tigerdata.com/blog/pg-textsearch-bm25-full-text-search-postgres)
- **pg_textsearch (Tiger Data)**
  - Licensed under the PostgreSQL License — [pg_textsearch LICENSE](https://github.com/timescale/pg_textsearch/blob/main/LICENSE)
  - v1.0 GA announced on postgresql.org. The announcement says ParadeDB "has a much more restrictive license (AGPL)" — [PostgreSQL news – pg_textsearch v1.0](https://www.postgresql.org/about/news/pg_textsearch-v10-3264/). The GA date of 3 April 2026 comes from a search-result summary and was not seen on the page itself.
  - Features:
    - BM25 with configurable k1 and b
    - Block-Max WAND top-k
    - expression, partial and partitioned indexes
    - parallel builds
    - uses Postgres `text_config` (any text search configuration, e.g. one partial index per language)
    - `<@>` operator returns negative scores
    - WAL-logged memtable plus segments, with inline, background or manual compaction
  - **Supports PostgreSQL 17 and 18 only.** PG19 is best-effort.
  - Main branch is at `1.6.0-dev`.

  Sources: [pg_textsearch README](https://github.com/timescale/pg_textsearch); [pg_textsearch.control](https://github.com/timescale/pg_textsearch/blob/main/pg_textsearch.control)
- **[VENDOR: Tiger] pg_textsearch vs ParadeDB v0.21.6 on MS-MARCO v2 (138M passages):**
  - 2.4x–6.5x faster for 2–4-term queries; 8.7x higher concurrent throughput
  - index 17 GB vs 23 GB
  - **build time 17 min 37 s vs ParadeDB's 8 min 55 s**

  Limitations at 1.0:
  - no phrase queries (no positions stored)
  - OR-only semantics
  - no highlighting
  - partition-local IDF
  - `shared_preload_libraries` required
  - PL/pgSQL needs explicit index names
  - no fuzzy matching
  - warm-cache benchmarks; write-heavy workloads not benchmarked

  Source: [Tiger Data – pg_textsearch blog](https://www.tigerdata.com/blog/pg-textsearch-bm25-full-text-search-postgres). The current README now documents expression indexes and background compaction, so some 1.0 limitations have since been lifted — [pg_textsearch README](https://github.com/timescale/pg_textsearch)
- **ParadeDB pg_search**
  - A Tantivy-based BM25 index with filters, facets, aggregations and joins.
  - "ParadeDB Community is licensed under the GNU Affero General Public License v3.0". ParadeDB Enterprise is commercially licensed.

  Sources: [ParadeDB README](https://github.com/paradedb/paradedb); [ParadeDB LICENSE](https://github.com/paradedb/paradedb/blob/main/LICENSE)
  - Latest release pg_search 0.26.3 (2026-10-22); 0.26.2 (2026-10-16) — [PGXN pg_search](https://pgxn.org/dist/pg_search/)
  - ICU tokenizer (UAX #29 word boundaries) "can be used to tokenize most languages". Syntax: `USING paradedb (id, (description::pdb.icu))` — [ParadeDB docs – ICU tokenizer](https://www.paradedb.com/docs/documentation/tokenizers/available-tokenizers/icu)
- **VectorChord-bm25 + pg_tokenizer (TensorChord)**
  - BM25 via Block-WeakAnd. Tokenization comes from the separate pg_tokenizer extension, which supports:
    - pre-trained model tokenizers such as BERT or llmlingua2
    - custom models with `unicode_segmentation` (UAX #29) and NFKD normalization
    - jieba for Chinese

  Sources: [VectorChord-bm25 README](https://github.com/tensorchord/VectorChord-bm25); [pg_tokenizer README](https://github.com/tensorchord/pg_tokenizer.rs)

**Hindi / Devanagari lexical search**
- **PG16 has a built-in `hindi` Snowball configuration.** Languages in `snowball_create.pl` for REL_16_STABLE: arabic, armenian, basque, catalan, danish, dutch, english, finnish, french, german, greek, **hindi**, hungarian, indonesian, irish, italian, lithuanian, **nepali**, norwegian, portuguese, romanian, russian, serbian, spanish, swedish, **tamil**, turkish, yiddish.
- The file maps `'hindi' => 'english'`. In that script, the second value names the stemmer used for ASCII (Latin-script) words in a non-Latin-script configuration — [PostgreSQL source – snowball_create.pl (REL_16_STABLE)](https://github.com/postgres/postgres/blob/REL_16_STABLE/src/backend/snowball/snowball_create.pl). The interpretation comes from the script's structure.
- Snowball's Hindi stemmer implements the "Lightweight Stemmer for Hindi" (Ramanathan & Rao, 2003) — [Snowball – Hindi stemmer](https://snowballstem.org/algorithms/hindi/stemmer.html)
- pg_trgm "ignores non-word characters (non-alphanumerics) when extracting trigrams" — [PostgreSQL 16 docs – pg_trgm](https://www.postgresql.org/docs/16/pgtrgm.html)

**Hybrid fusion**
- Supabase's reference SQL fuses `ts_rank_cd` full-text rank and pgvector rank:
  - weighted RRF: `1/(rrf_k + rank) * weight`
  - defaults `full_text_weight=1`, `semantic_weight=1`, `rrf_k=50`
  - "ts_rank_cd is not indexable"

  Source: [Supabase docs – Hybrid search](https://supabase.com/docs/guides/ai/hybrid-search)
- Bruch et al. found:
  - RRF is "sensitive to its parameters"
  - a tuned convex combination (CC) of normalized scores "outperforms RRF in in-domain and out-of-domain settings"
  - CC is sample efficient (one parameter, few labelled examples)

  Source: [An Analysis of Fusion Functions for Hybrid Retrieval (arXiv 2210.11934)](https://arxiv.org/abs/2210.11934)

**Graph in Postgres**
- **Apache AGE:**
  - 1.8.0 release notes ("for master branch (currently PG18)")
  - the README badge shows v1.8.0 / PostgreSQL 18
  - supports PG 11–18
  - openCypher plus SQL hybrid querying, with property indexes on vertices and edges

  Sources: [Apache AGE RELEASE file](https://github.com/apache/age/blob/master/RELEASE); [Apache AGE README](https://github.com/apache/age)
- AGE's FAQ:
  - "Apache AGE uses relational models under the hood. Some limitations of relation model applies to AGE, for example large amount of table joins"
  - it sometimes uses a custom scan node
  - properties are stored as `agtype` and are indexable with B-tree, hash or GIN

  Source: [Apache AGE FAQ](https://age.apache.org/faq) (as summarized by search; page fetched)
- Azure Database for PostgreSQL documents AGE as a supported extension — [Microsoft Learn – Apache AGE on Azure PostgreSQL](https://learn.microsoft.com/en-us/azure/postgresql/azure-ai/generative-ai-age-overview)
- PGXN's ApacheAGE listing is stale (1.4.0, 2023-12-19), so get AGE from the Apache releases, not PGXN — [PGXN ApacheAGE](https://pgxn.org/dist/ApacheAGE/)
- **Kùzu (embedded graph DB) has been archived:**
  - the repo is archived with a final 0.11.3 release
  - per news coverage, Apple agreed on 9 Oct 2025 to acquire Kùzu; it became public Feb 2026

  Sources: [Kuzu README](https://github.com/kuzudb/kuzu); [BetaKit](https://betakit.com/apple-strikes-deal-to-acquire-canadian-database-software-startup-kuzu/); [University of Waterloo news](https://uwaterloo.ca/computer-science/news/waterloo-based-graph-database-start-up-kuzu-acquired-apple)
- **Licenses:**
  - FalkorDB: Server Side Public License v1 — [FalkorDB LICENSE](https://github.com/FalkorDB/FalkorDB/blob/master/LICENSE.txt)
  - Memgraph: Business Source License 1.1 plus Memgraph Enterprise License — [Memgraph LICENSE](https://github.com/memgraph/memgraph/blob/master/LICENSE)

**Background jobs and change processing (TypeScript)**
- **pg-boss** 12.38.0 (2026-10-13), MIT.
  - Majors: v11.0.0 2025-09-26; v12.0.0 2025-11-09 — [npm pg-boss](https://www.npmjs.com/package/pg-boss)
  - Requires Node ≥22.12 (or Bun) and PostgreSQL ≥13. Uses `SKIP LOCKED`.
  - Features:
    - cron and RRULE scheduling
    - queue policies for rate limiting, debouncing and concurrency
    - priority queues and dead-letter queues with redrive
    - retries with exponential backoff
    - pub/sub fan-out
    - SQL support for non-Node runtimes
    - dashboard package

  Source: [pg-boss README](https://github.com/timgit/pg-boss)
- **graphile-worker** 0.18.0 (2026-09-08), MIT — [npm graphile-worker](https://www.npmjs.com/package/graphile-worker)
  - `job_key` with `job_key_mode` = `replace` (default), `preserve_run_at` (fixed-window batching/debounce) or `unsafe_dedupe` — [Graphile Worker – Job key](https://worker.graphile.org/docs/job-key)
  - **[VENDOR/self-benchmark]** ~183,000 jobs executed/s; ~202,000 jobs queued/s from one `add_jobs` batch; average add_job→start latency 4.16 ms (max 13.84 ms) — [Graphile Worker – Performance](https://worker.graphile.org/docs/performance)
- **BullMQ** 6.4.1 (2026-10-23), MIT. Major v6.0.0 on 2026-07-30. It is Redis-based, so it adds a system — [npm bullmq](https://www.npmjs.com/package/bullmq)
- **LISTEN/NOTIFY at scale.** Recall.ai: NOTIFY in a transaction "acquires a global lock on the entire database ... during the commit phase ... effectively serializing all commits". This caused three outages in March 2025 under tens of thousands of concurrent writers. Their later update says a Postgres core commit (282b1cd) "eliminated the bottleneck" — [Recall.ai – Postgres LISTEN/NOTIFY does not scale](https://www.recall.ai/blog/postgres-listen-notify-does-not-scale); [postgres commit 282b1cd](https://github.com/postgres/postgres/commit/282b1cde9dedf456ecf02eb27caf086023a7bb71)
- **Logical decoding/CDC from Node:** pg-logical-replication 2.6.0 (2026-10-14) — [npm pg-logical-replication](https://www.npmjs.com/package/pg-logical-replication)

**Temporal, audit and permission enforcement**
- PG18 provides `WITHOUT OVERLAPS` (PK/UNIQUE) and `PERIOD` (FK) for temporal constraints — [PostgreSQL 18 release notes](https://www.postgresql.org/docs/release/18.0/)
- On PG16 the standard equivalent is a GiST exclusion constraint over a range column using btree_gist — [PostgreSQL 16 docs – btree_gist](https://www.postgresql.org/docs/16/btree-gist.html)
- **RLS and LEAKPROOF.** Security-policy conditions are enforced "before any user-supplied conditions from the query itself that contain non-leakproof functions". Only leakproof functions and operators may run before them. Only a superuser can set LEAKPROOF — [PostgreSQL 16 docs – CREATE FUNCTION](https://www.postgresql.org/docs/16/sql-createfunction.html)
- **Supabase's RLS performance guidance:**
  - wrap per-request functions as `(select auth.uid())` so they are evaluated once
  - index every column a policy filters on (as the leading column of a B-tree)
  - beware that views bypass RLS by default (security definer)

  Source: [Supabase docs – Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)

### Inferences
- **Sizing.**
  - Using pgvector's storage formula, 5M memory items + 1M chunks at 1024 dims is about 6M × 2,056 B ≈ 12 GB as `halfvec`, or about 24.6 GB as `vector`, before HNSW index overhead.
  - At this size a single well-provisioned node (≥64–128 GB RAM, NVMe) can keep the hot HNSW indexes in memory. This is far below the 50M-vector scale of the Tiger and Qdrant benchmarks and the 10M scale of the AWS benchmark.
  - pgvectorscale and VectorChord are worth adopting only if RAM becomes the constraint.
- **Permission filters.**
  - GEM's per-project SQL permission checks behave exactly like a WHERE filter applied after HNSW traversal. So does RLS.
  - Recommended settings:
    - `SET LOCAL hnsw.iterative_scan = relaxed_order` (re-sort by distance in an outer query)
    - `hnsw.ef_search` around 100–200
    - raise `hnsw.max_scan_tuples` for selective users
  - For tenants or projects with small corpora, use exact search instead: a B-tree prefilter plus a sequential distance computation over ≤50k rows is fast and gives 100% recall.
  - Use LIST partitioning by tenant or installation, which gives per-partition HNSW indexes. Within a tenant, use partial indexes for very large projects only.
  - Pin these settings per query in a transaction (`SET LOCAL`) through Drizzle's `sql` escape hatch.
- **RLS.** Use it as defense in depth: policies on `tenant_id` and `project_id`, with B-tree indexes and `(select current_setting(...))`-style initPlan wrapping. Keep the explicit SQL permission predicate as well, so the planner can use B-tree indexes and partition pruning. Do not create views over brain tables without `security_invoker`.
- **BM25 path.**
  - **Stay on PG16:** keep built-in FTS with `ts_rank_cd`, using the `hindi` config for Hindi rows and `english` for English rows (store `lang` per chunk and keep one tsvector per row). Accept that ranking is not true BM25. Alternatively use ParadeDB pg_search, but only after legal sign-off on AGPL for an on-prem product you distribute.
  - **Move to PG18 (recommended):** pg_textsearch, which is PostgreSQL-licensed and accepts `text_config='hindi'` through a partial index per language. Note no phrase queries; OR-only semantics at 1.0. It is the cleanest permissive BM25.
- **Hindi tokenization.** Built-in `hindi` and pg_textsearch reuse Snowball's light Hindi stemmer. The `'hindi' => 'english'` mapping suggests Latin-script technical terms inside Hindi text are stemmed as English. That helps mixed Hindi/English engineering documents. Romanized Hindi ("Hinglish") will not be stemmed as Hindi.
- **Fusion.** Start with RRF (k≈60, or 50 as in Supabase), because it needs no score normalization. Once a small labelled query set from GEM users exists, switch to a tuned convex combination (per Bruch et al.). Always follow with a cross-encoder reranker on the top 50–100 fused candidates.
- **Graph.**
  - At org-brain scale (entities and edges in the millions), typical traversals are 1–3 hops from seed entities found by vector or BM25 search. Plain `entities`/`edges` tables with B-tree indexes on `(src_id, type)` and `(dst_id, type)` plus `WITH RECURSIVE` handle this with full permission filtering and Drizzle support.
  - AGE 1.8 adds Cypher, but it inherits relational join costs and keeps properties in `agtype`, which Drizzle does not support. Consider it optional and later.
  - A separate graph DB is justified only for deep or variable-length path analytics or graph algorithms (PageRank, community detection) run online at high QPS. Even then, licenses matter: FalkorDB is SSPL, Memgraph is BSL, and Kùzu is archived.
- **Jobs.**
  - pg-boss: Node 22 native, rich policies.
  - graphile-worker: SQL `add_job` callable from triggers in the same transaction as a new document version, with `job_key` dedupe and debounce.
  - Both avoid Redis. graphile-worker is best when "enqueue on commit from SQL" matters. pg-boss is best for cron, dead-letter queues, throttling and a dashboard.
  - Make re-processing idempotent:
    - key jobs by `(document_id, version_id, pipeline_step, content_sha256)`
    - upsert derived rows on natural keys
    - mark old-version chunks and memory provenance as superseded rather than deleting them
  - Avoid heavy NOTIFY fan-out on PG16. It is not needed with SKIP LOCKED polling.
- **Temporal model.**
  - Memory items carry `valid_from`/`valid_to` (valid time) and `recorded_at`/`superseded_at` (transaction time), plus `superseded_by` and a provenance link table (`memory_id → source_chunk_id/doc_version_id/chat_message_id/task_id`, extractor model and prompt version, confidence).
  - On PG16, enforce non-overlap with btree_gist EXCLUDE; on PG18, use `WITHOUT OVERLAPS`.
  - An append-only audit table written in the same transaction, or a trigger, covers history. `uuidv7()` (PG18) gives time-ordered keys.

### Gaps
- No independent (non-vendor) benchmark was found of pgvector HNSW with **highly selective permission predicates** (≤1% selectivity) at 1–10M vectors. AWS's numbers are vendor and Aurora-specific. GEM should benchmark its own permission shapes.
- pgvectorscale's official 0.9.x release notes and license were not retrievable here; the license was believed to be PostgreSQL but is unverified. Label filtering uses `SMALLINT[]`, so check that permission labels fit.
- Apache AGE 1.8.0's release date and current project-health indicators (committer activity) could not be retrieved, because GitHub was blocked. No 2026 independent AGE performance benchmark was found.
- Milvus docs could not be fetched (redirect). No first-hand Milvus figures are included.
- Whether pg_trgm treats Devanagari combining vowel signs (matras) as word characters depends on the locale (libc vs ICU). No source was found; test it on the target build.
- Neo4j's current version and licensing were not researched in this pass.
- Whether pg_textsearch has a PG16 backport: the README says PG17/18 only.

---

## Key question 2: What is the best open embedding + reranker combination for English + Hindi technical content, self-hosted?

### Takeaway
Pick by GPU budget:

- **Tight GPU budget:** bge-m3 (568M, 1024-d, 8k context, MIT) or Qwen3-Embedding-0.6B (Apache-2.0, 32k context, MRL dims 32–1024). Pair with bge-reranker-v2-m3 (Apache-2.0, XLM-R based, served by TEI) or Qwen3-Reranker-0.6B.
- **Comfortable GPU budget:** Qwen3-Embedding-4B/8B, truncated via MRL to ≤2,000 dims (`vector`) or ≤4,000 (`halfvec`) so pgvector can index it. Pair with Qwen3-Reranker-4B, served by vLLM's `/rerank`.

Things to avoid:
- jina-embeddings-v3 and jina-reranker-v2 are CC-BY-NC-4.0.
- jina-embeddings-v4 is under the Qwen Research License.
- EmbeddingGemma is gated under the Gemma license.

No public Hindi-specific leaderboard ranks all of these head-to-head. GEM should run a small Hindi + English eval on its own engineering documents.

### Cited Findings

**Embedding models**

| Model | Params | Dims | Context | License | Benchmark notes |
|---|---|---|---|---|---|
| bge-m3 | ~568M | 1024 | 8192 | MIT | 100+ languages; dense, sparse and ColBERT multi-vector outputs |
| Qwen3-Embedding 0.6B / 4B / 8B (June 2025) | 0.6B / 4B / 8B | up to 4096, MRL 32–4096 | 32k | Apache-2.0 | 100+ languages; instruction-aware (+1–5%) |
| multilingual-e5-large-instruct | 560M | 1024 | 512 | — | XLM-R based |
| EmbeddingGemma-300m | 308M | 768, MRL to 512/256/128 | 2K | Gemma (gated) | MTEB(Multilingual,v2) 61.15 at 768d, 58.23 at 128d |
| nomic-embed-text-v2-moe | 475M total / 305M active (MoE) | 768, Matryoshka | — | Apache-2.0 | ~100 languages; BEIR 52.86, MIRACL 65.80 |
| jina-embeddings-v3 | — | — | — | CC-BY-NC-4.0 | — |
| jina-embeddings-v4 | 3B (Qwen2.5-VL-3B base) | 2048, MRL to 128; 128 multi-vector | 32,768 | Qwen Research License | 30+ languages; multimodal |

Details and sources:
- **bge-m3.** Bitext mining is strong on MMTEB (79.11) but retrieval is weaker. Sources: [BAAI/bge-m3 model card](https://huggingface.co/BAAI/bge-m3); size from the [TEI README model table](https://github.com/huggingface/text-embeddings-inference)
- **Qwen3-Embedding.** "The 8B size embedding model ranks No.1 in the MTEB multilingual leaderboard (as of June 5, 2025, score 70.58)" — [Qwen/Qwen3-Embedding-8B model card](https://huggingface.co/Qwen/Qwen3-Embedding-8B); [Qwen3 Embedding paper (arXiv 2506.05176)](https://arxiv.org/abs/2506.05176). **[VENDOR]** scores on MMTEB, Mean(Task) / Retrieval:

  | Model | Mean (Task) | Retrieval |
  |---|---|---|
  | Qwen3-Embedding-8B | 70.58 | 70.88 |
  | Qwen3-Embedding-4B | 69.45 | 69.60 |
  | Qwen3-Embedding-0.6B | 64.33 | 64.64 |
  | multilingual-e5-large-instruct | 63.22 | 57.12 |
  | BGE-M3 | 59.56 | 54.60 |

- **multilingual-e5-large-instruct.** Qwen's MMTEB table above; architecture and size from the [TEI README](https://github.com/huggingface/text-embeddings-inference); context per the Hindi-BEIR paper ("mE5 has a context length of 512 tokens") — [arXiv 2409.05401 (HTML)](https://arxiv.org/html/2409.05401)
- **EmbeddingGemma.** Trained on 100+ languages — [Google AI – EmbeddingGemma model card](https://ai.google.dev/gemma/docs/embeddinggemma/model_card). Gated, `license:gemma`, Hugging Face repo created 2025-07-17 — [HF API google/embeddinggemma-300m](https://huggingface.co/google/embeddinggemma-300m). The paper claims state of the art among models <500M params on MTEB — [arXiv 2509.20354](https://arxiv.org/abs/2509.20354)
- **nomic-embed-text-v2-moe** — [nomic-ai/nomic-embed-text-v2-moe](https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe)
- **jina-embeddings-v3** — [jinaai/jina-embeddings-v3](https://huggingface.co/jinaai/jina-embeddings-v3)
- **jina-embeddings-v4.** "Initially released under cc-by-nc-4.0 due to an error. The correct license is the Qwen Research License" — [jinaai/jina-embeddings-v4](https://huggingface.co/jinaai/jina-embeddings-v4)
- **Hindi-specific evidence.**
  - Hindi-BEIR has 15 datasets across 7–8 tasks. Baselines: BGE-M3, mE5-Base/Large, LASER, LaBSE, BM25.
  - NLLB-E5 (trained only on English data) beat them on average.
  - mE5 "specifically struggles in fact-checking datasets, while BGE-M3 and NLLB-E5 ... fare better".
  - All models drop sharply in finance and climate domains and perform poorly on SCIDOCS.
  - BM25 fails on cross-lingual English-query/Hindi-corpus retrieval (CC News).

  Sources: [Acharya et al., arXiv 2409.05401](https://arxiv.org/html/2409.05401); [Hindi-BEIR, arXiv 2408.09437](https://arxiv.org/abs/2408.09437)

**Rerankers (Qwen-published table, [VENDOR])**

| Model | Params | MTEB-R | MMTEB-R | MLDR | MTEB-Code |
|---|---|---|---|---|---|
| Qwen3-Reranker-0.6B | 0.6B | 65.80 | 66.36 | 67.28 | 73.42 |
| Qwen3-Reranker-4B | 4B | 69.76 | 72.74 | 69.97 | 81.20 |
| Qwen3-Reranker-8B | 8B | 69.02 | 72.94 | 70.19 | 81.22 |
| BGE-reranker-v2-m3 | 0.6B | 57.03 | 58.36 | 59.51 | 41.38 |
| jina-multilingual-reranker-v2-base | 0.3B | 58.22 | 63.73 | 39.66 | — |
| gte-multilingual-reranker-base | 0.3B | 59.51 | 59.44 | 66.33 | — |

- Qwen3-Reranker is Apache-2.0 with a 32k context. The table above uses retrieval subsets of each benchmark. Source: [Qwen/Qwen3-Reranker-8B model card](https://huggingface.co/Qwen/Qwen3-Reranker-8B)
- bge-reranker-v2-m3 is Apache-2.0, built on bge-m3, multilingual, "lightweight ... fast inference", with fp16 recommended — [BAAI/bge-reranker-v2-m3](https://huggingface.co/BAAI/bge-reranker-v2-m3)
- jina-reranker-v2-base-multilingual is **CC-BY-NC-4.0** ("research and evaluation purposes"). Context is 1024 tokens with sliding windows — [jinaai/jina-reranker-v2-base-multilingual](https://huggingface.co/jinaai/jina-reranker-v2-base-multilingual)

**Serving**

- **Hugging Face TEI 1.9** (images `cpu-1.9`, `1.9`, `86-1.9`, `hopper-1.9`, `turing-1.9` experimental).
  - Embedding architectures: Nomic, BERT, XLM-RoBERTa, JinaBERT, Mistral, GTE, Qwen2, ModernBERT, **Qwen3, Gemma3**.
  - Supported embedding models listed include Qwen3-Embedding-0.6B/4B/8B, multilingual-e5-large-instruct, embeddinggemma-300m and nomic-embed-text-v2-moe.
  - Rerankers are limited to XLM-RoBERTa, CamemBERT, GTE and ModernBERT sequence classification (e.g. bge-reranker-*, gte-multilingual-reranker-base).
  - Token-based dynamic batching; SPLADE pooling.
  - Needs CUDA ≥12.2.

  Source: [TEI README](https://github.com/huggingface/text-embeddings-inference)
- **vLLM** 0.32.0 (2026-10-18) — [PyPI vllm](https://pypi.org/project/vllm/)
  - Pooling models include cross-encoder/reranker ("classify") models, served through a Score API (`/score`, `/v1/score`) and a Cohere-compatible Rerank API (`/rerank`, `/v1/rerank`, `/v2/rerank`) — [vLLM docs – Pooling models](https://github.com/vllm-project/vllm/blob/main/docs/models/pooling_models/README.md)
- **Ollama.**
  - `/api/embed` endpoint, with examples using `embeddinggemma` — [Ollama docs – Embeddings](https://github.com/ollama/ollama/blob/main/docs/capabilities/embeddings.mdx)
  - The API reference contains no rerank endpoint ("rerank" does not appear) — [Ollama API docs](https://github.com/ollama/ollama/blob/main/docs/api.md)
- **Infinity** (embeddings, rerank, CLIP, ColPali) 0.0.78 (2026-10-19). Its Python packages are MIT, but "Infinity V3 uses the Infinity Restricted MIT License 1.0". Some Docker images are "not build via CI/CD" — [Infinity README](https://github.com/michaelfeil/infinity); [PyPI infinity-emb](https://pypi.org/project/infinity-emb/)

### Inferences
- **Dimension constraint.** Qwen3-Embedding-8B's native 4096 dims exceed pgvector's HNSW limits: 2,000 for `vector`, 4,000 for `halfvec`. Truncate with MRL (e.g. 1024 or 2048) and re-normalize, or index `binary_quantize` and rerank. The bge-m3, e5 and Qwen3-0.6B families at 1024 dims fit plain `vector`.
- **Recommended self-hosted pairs:**
  - **Default, low GPU:** Qwen3-Embedding-0.6B (truncated to 1024 or 768 via MRL, with an English instruction prefix on queries) or bge-m3. Plus bge-reranker-v2-m3 on TEI. All three fit on one 16–24 GB GPU or can run on CPU for small batches.
    - Qwen3-0.6B has better MMTEB retrieval (64.6 vs 54.6, vendor-reported) and a 32k context.
    - bge-m3 has independent Hindi-BEIR evidence and a sparse-vector output that could feed pgvector `sparsevec`.
  - **Quality tier:** Qwen3-Embedding-4B, truncated to ≤2000 dims, plus Qwen3-Reranker-4B on vLLM. Qwen3-Reranker-0.6B beats bge-reranker-v2-m3 by about 8 MMTEB-R points at the same size (vendor-reported), so it is the stronger small reranker if vLLM is already deployed.
- **Ollama limits.** Ollama can host the embedder (e.g. `qwen3-embedding`, `bge-m3`, `embeddinggemma` tags) but not the reranker. Plan TEI or vLLM as a second local service, or a reranker on Ollama Cloud if it exists (unverified).
- **Re-embedding cost.** Changing embedding model means re-embedding everything. Store `embedding_model` and `embedding_dim` per row, and use a side table or column per model version so migrations can be done online with a background job.

### Gaps
- No public MMTEB or Indic leaderboard snapshot was retrieved comparing Qwen3-Embedding, bge-m3, EmbeddingGemma and mE5 **on Hindi retrieval specifically**. Also missing: the Hindi-BEIR per-model numeric nDCG table (the paper's table text was not extracted).
- No independent latency or throughput benchmarks for bge-reranker-v2-m3 or Qwen3-Reranker on specific GPUs (e.g. ms per 100 pairs on L4/A10/H100) were found.
- Whether Ollama (or Ollama Cloud) added a native rerank API after the fetched docs is unverified.
- Newer 2026 open embedding releases (e.g. successors to Qwen3-Embedding) were not systematically surveyed. A BentoML "2026" guide exists but was not read in detail — [BentoML – open-source embedding models](https://www.bentoml.com/blog/a-guide-to-open-source-embedding-models)

---

## Key question 3: What are the concrete risks (filtered recall loss, AGE maturity, BM25 licensing, extraction quality) and the mitigations?

### Takeaway
The biggest practical risks:

1. Silent recall loss when permission filters are applied after HNSW traversal.
2. License exposure from AGPL BM25 extensions (ParadeDB) and AGPL/ELv2 VectorChord in a distributed on-prem product.
3. The version mismatch between PG16 and the best permissive extensions (pg_textsearch needs PG17 or 18).
4. Dependency on less-mature graph tooling (AGE; Kùzu archived).
5. Unmeasured extraction accuracy of open 20B–120B models on GEM's own documents.

Each has a concrete mitigation, listed under Inferences.

### Cited Findings

**Filtered recall**
- With approximate indexes, "filtering is applied after the index is scanned". Iterative scans stop at `hnsw.max_scan_tuples` (20,000 default) or `ivfflat.max_probes`. Results may also be cut short by dead tuples — [pgvector README](https://github.com/pgvector/pgvector#iterative-index-scans)
- Recent pgvector fixes concern HNSW vacuum corruption and repair (0.8.3 "possible index corruption with HNSW vacuuming"; 0.8.4 "hnsw graph not repaired" error) and an IVFFlat build buffer overflow (0.8.6, 0.8.7). Patch currency matters — [pgvector CHANGELOG](https://github.com/pgvector/pgvector/blob/master/CHANGELOG.md)

**Licensing**
- ParadeDB Community is AGPL-3.0 and Enterprise is commercial — [ParadeDB README](https://github.com/paradedb/paradedb)
- VectorChord is AGPLv3 or ELv2 — [VectorChord README](https://github.com/tensorchord/VectorChord)
- pg_textsearch is under the PostgreSQL License — [pg_textsearch LICENSE](https://github.com/timescale/pg_textsearch/blob/main/LICENSE)
- FalkorDB is SSPLv1 — [FalkorDB LICENSE](https://github.com/FalkorDB/FalkorDB/blob/master/LICENSE.txt)
- Memgraph is BSL 1.1 plus MEL — [Memgraph LICENSE](https://github.com/memgraph/memgraph/blob/master/LICENSE)
- jina-reranker-v2 and jina-embeddings-v3 are CC-BY-NC-4.0 — [jina-reranker-v2](https://huggingface.co/jinaai/jina-reranker-v2-base-multilingual); [jina-embeddings-v3](https://huggingface.co/jinaai/jina-embeddings-v3)
- EmbeddingGemma is gated under the Gemma license — [HF google/embeddinggemma-300m](https://huggingface.co/google/embeddinggemma-300m)

**Version compatibility and operations**
- pg_textsearch supports PostgreSQL 17 and 18. It requires `shared_preload_libraries` (server restart). It has partition-local IDF statistics. Its benchmarks were warm-cache only, with write-heavy workloads not benchmarked — [pg_textsearch README](https://github.com/timescale/pg_textsearch); [Tiger Data blog](https://www.tigerdata.com/blog/pg-textsearch-bm25-full-text-search-postgres)
- pgvector 0.9.0 (unreleased) drops PG13/14 — [pgvector CHANGELOG](https://github.com/pgvector/pgvector/blob/master/CHANGELOG.md)

**Graph maturity**
- AGE inherits relational join limits — [Apache AGE FAQ](https://age.apache.org/faq)
- Kùzu is archived; its last release is 0.11.3 — [Kuzu README](https://github.com/kuzudb/kuzu)

**Queue and notification scaling**
- LISTEN/NOTIFY serialized commits under heavy concurrent writes (global lock at commit), per Recall.ai. Recall says this is fixed upstream, and PG19 improves NOTIFY wakeups — [Recall.ai](https://www.recall.ai/blog/postgres-listen-notify-does-not-scale); [PG19 release notes](https://www.postgresql.org/docs/19/release-19.html)

**Structured extraction with open models**
- **Ollama** enforces a JSON schema passed in the `format` field ("Structured outputs let you enforce a JSON schema on model responses") — [Ollama docs – Structured outputs](https://github.com/ollama/ollama/blob/main/docs/capabilities/structured-outputs.mdx)
- **vLLM:**
  - structured outputs use the xgrammar or guidance backends (default `auto`)
  - the legacy `guided_json` and related fields were **removed in v0.12.0**; replaced by `{"structured_outputs": {"json": ...}}` or `response_format: {type: "json_schema"}`
  - structured outputs work with reasoning parsers, with caveats for some models (e.g. `--structured-outputs-config.enable_in_reasoning=True` for Qwen3 Coder)

  Source: [vLLM docs – Structured outputs](https://github.com/vllm-project/vllm/blob/main/docs/features/structured_outputs.md)
- Library versions: xgrammar 0.2.8 (2026-09-24); outlines 1.3.3 (2026-08-06) — [PyPI xgrammar](https://pypi.org/project/xgrammar/); [PyPI outlines](https://pypi.org/project/outlines/)
- **gpt-oss.**
  - gpt-oss-120b: 117B params, 5.1B active, fits a single 80 GB GPU (H100/MI300X) thanks to MXFP4.
  - gpt-oss-20b: 21B params, 3.6B active, runs within 16 GB.
  - Apache-2.0. "Should only be used with the harmony format". Supports Structured Outputs.

  Source: [openai/gpt-oss-120b model card](https://huggingface.co/openai/gpt-oss-120b)
- **Evidence on extraction accuracy.** The only gpt-oss extraction study found is a career-trajectory extraction task, not KG/RE. There, gpt-oss-120b (high reasoning) scored highest (83.9%, 86.2%, 88.0% across three baselines) vs gpt-oss-20b, Llama-3.3-70B and Gemma-2 (per search summary) — [STEP, arXiv 2607.11722](https://arxiv.org/abs/2607.11722). Another 2026 paper using gpt-oss-120b for ontology-constrained KG querying reported it hallucinated the most among the models tested (per search summary) — [arXiv 2609.17107](https://arxiv.org/pdf/2609.17107)
- **Ollama Cloud pricing:**
  - Free ($0, pay-as-you-go usage credits)
  - Pro ($20/mo or $200/yr, includes $60 of usage credits/month, larger "pro" models)
  - Max ($100/mo)

  No per-token prices were visible on the page — [Ollama pricing](https://ollama.com/pricing)

### Inferences
- **Mitigation: filtered recall.**
  - Always run brain retrieval with `SET LOCAL hnsw.iterative_scan = relaxed_order` and an outer `ORDER BY distance`.
  - Measure recall@k against exact search (`SET enable_indexscan=off`) for real permission shapes in CI. Add a recall regression test.
  - Route small permitted corpora to exact search, chosen by row-count estimate.
  - Partition by tenant.
  - Over-fetch (k×3–5) before fusion and rerank.
  - Run `VACUUM`/`REINDEX` hygiene and stay on the latest 0.8.x patch (≥0.8.4 because of the HNSW vacuum fixes).
- **Mitigation: licensing.**
  - Prefer permissive components: pgvector (PostgreSQL license), built-in FTS, pg_textsearch, graphile-worker/pg-boss (MIT), Qwen3 models and bge-reranker-v2-m3 (Apache-2.0), bge-m3 (MIT).
  - Treat ParadeDB, VectorChord, FalkorDB, Memgraph and jina-v2/v3 as needing legal review or a commercial license before shipping in customer installations.
- **Mitigation: PG16 lock-in.** Plan a PG18 upgrade. It brings pg_textsearch, temporal constraints, `uuidv7()` and async I/O. PG19 is at RC1, so early adopters can wait for 19.1. In the meantime, keep `ts_rank_cd` plus the `hindi`/`english` configs behind a retrieval interface, so the BM25 backend can be swapped without schema churn.
- **Mitigation: graph.** Model the graph as relational edge tables first: portable, permission-filterable, Drizzle-friendly. Add AGE only if Cypher authoring by power users is a product requirement, and pin to the AGE release that matches the PG major.
- **Mitigation: extraction quality and cost.**
  - Use schema-constrained decoding (Ollama `format` or vLLM `structured_outputs`) for syntactic validity. This does not guarantee factual correctness.
  - Add evidence spans (chunk ID + character offsets) per extracted fact, validated by string match.
  - Use a second-pass verifier with a larger model for low-confidence items.
  - Batch per chunk.
  - Rough cost model: about 1.5–2.5M tokens per 1,000 pages (assumption: ~600 tokens of text per page + ~1,000 tokens of prompt/schema per call + ~300–500 output tokens). gpt-oss-20b handles this on a single 16–24 GB GPU; gpt-oss-120b needs an 80 GB GPU. Measure real tokens/s on GEM hardware before committing to SLAs.
- **Mitigation: job pipeline.**
  - Use graphile-worker `job_key` or pg-boss singleton/debounce policies, keyed by document version.
  - Write derived data with upserts and content hashes, so re-runs are idempotent.
  - Avoid high-fan-out NOTIFY on PG16.

### Gaps
- No published entity/relation-extraction F1 for gpt-oss-20b/120b, Nemotron 3 or Gemma 4 on standard RE benchmarks (e.g. SciERC, Re-TACRED, DocRED) or on Hindi text was found. GEM needs an in-house gold set (e.g. 200–500 annotated chunks in English and Hindi).
- No measured self-hosted throughput (tokens/s) for gpt-oss-20b/120b under vLLM on specific GPUs was retrieved. The cost per 1,000 pages above is a modeled estimate, not a measured figure. Ollama Cloud per-token rates were not visible.
- The exact content and target release of the Postgres commit cited by Recall.ai (282b1cd) could not be checked (GitHub blocked). It is unclear whether the global NOTIFY commit lock is fixed in PG19 or only on master.
- Whether pgvector's distance operators are marked LEAKPROOF, and the resulting RLS and index interaction, was not confirmed from a primary source. GEM should check with `EXPLAIN` on its own schema.

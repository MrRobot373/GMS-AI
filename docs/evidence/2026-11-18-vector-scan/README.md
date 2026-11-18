# Vector search at 10,000 pages (database side), 18 Nov 2026

Question (P0 #5, KNW-21): is the untyped, unindexed `document_chunk.embedding` column fast enough at 10,000 pages, or does it
need a type and an HNSW index?

## Method

A scratch Postgres 16 with pgvector and the real schema (all migrations). 1,000 ready documents of 10 pages, 4 chunks per
page: **40,000 chunks of 768-dimension random vectors** (the size of EmbeddingGemma's output), spread over 10 projects
(100 documents, 1,000 pages, 4,000 chunks each). Table plus indexes: 182 MB. The query is the one `retrieve()` and
`retrieveKnowledge()` run: join to `document`, filter by project or workspace and by the embedding model, order by
`embedding <=> query` with `limit 12`, with the exact (sequential) scan and no vector index. Eight different query vectors
each, `\timing` in psql, same machine as the other tests (2 cores, shared).

## Results

| Scope | Chunks scanned | Pages | Time per query (8 runs) |
|---|---|---|---|
| One project | 4,000 | 1,000 | **18–20 ms** (first run 36 ms) |
| The whole workspace (library search, or one project holding everything) | 40,000 | 10,000 | **127–151 ms** |

Exact search grows linearly, so 10,000 pages in one scope costs about 140 ms of database time per question, well under the
cost of the embedding call and the model's answer. **No vector index is needed to meet the 10,000-page criterion.**

## If a deployment is much larger

An expression index per embedding size works with the untyped column (the dimension is fixed in the expression, so one
index per model):

```sql
create index concurrently chunk_embedding_768_hnsw on document_chunk
  using hnsw ((embedding::vector(768)) vector_cosine_ops) where vector_dims(embedding) = 768;
```

On the same data it answered in **1.5 ms** (index build 5.8 s for 40,000 chunks; raise `maintenance_work_mem` for more). The
query must then order by `embedding::vector(768) <=> $1::vector(768)` and include `vector_dims(embedding) = 768`; the app
doesn't do that today, so it would need that change in `services/documents.ts` and `services/knowledge.ts`. Do it when
exact search passes about 300 ms (roughly 20,000 pages in one scope), not before.

## What this does not cover

Ingest throughput (pages per minute), embedding time, and time to the first answer with a real model: those need the
corpus and the embedding server. Use `scripts/knowledge-ingest.mjs` (it reports pages per minute) and
`scripts/knowledge-eval.mjs` (p50 / p95 time to first answer, rank checks, `--min-pass 24`).

# Memory Write Policies for LLM Systems (what to keep, discard, merge, update, supersede, forget; how to evaluate)

Research date: 24 October 2026. Every result is dated by its arXiv submission or post date. Labels used:
- **[peer-reviewed / academic preprint]**: arXiv paper (most are preprints; venue given only where the page confirmed it).
- **[vendor claim]**: number reported by the company that sells the system, usually not independently reproduced.

Context for the reader: GEM AI wants an "organization brain" on Postgres + pgvector with open models (gpt-oss 20B/120B, Nemotron, Gemma). The inferences below are written for that setup.

---

## Q1. Which concrete write policy gives the best accuracy/cost trade-off with open 20B–120B models?

### Takeaway
The best-supported policy is **"keep everything raw, extract selectively, update asynchronously"**: store every source (chat turn, document chunk, agent trace) losslessly with timestamps and provenance; run a cheap, batched background LLM pass that extracts atomic facts and links them to the raw source; resolve each new fact against the top-k similar existing facts (ADD / UPDATE / INVALIDATE / NOOP), and never physically delete (mark invalid with dates instead). Answer from extracted facts first, and fall back to the raw source when detail matters. Per-message hot-path LLM writes (Mem0 2025 style) are the expensive part. Batched or offline consolidation (LightMem, sleep-time compute, Mastra-style observation logs) cuts token and API cost by one to two orders of magnitude with equal or better accuracy. Small open models can do the memory operations if the prompts are well designed (A-MEM, Hindsight) or the model is fine-tuned (Memory-R1). Temporal parsing and long retrieved contexts are where smaller models break.

### Cited Findings

**Extract-then-update (Mem0, April 2025) [academic preprint by vendor]**
- Extraction input = an asynchronously refreshed conversation summary S, plus the last m=10 messages, plus the new message pair. An LLM extracts candidate facts. For each fact, the top s=10 similar memories are retrieved by embedding, and the LLM picks ADD / UPDATE / DELETE / NOOP through a tool call. UPDATE replaces a memory only when the new fact carries more information. — [Mem0 paper, arXiv 2504.19413](https://arxiv.org/html/2504.19413v1)
- Mem0g (graph variant): an LLM entity extractor and relationship generator feed Neo4j; a conflict detector flags conflicting relations; an LLM update resolver marks obsolete relations **invalid rather than deleting them**, so temporal reasoning still works. All operations used GPT-4o-mini. — [arXiv 2504.19413](https://arxiv.org/html/2504.19413v1)
- LoCoMo LLM-judge (J) overall: full-context 72.90%, Mem0g 68.44%, Mem0 66.88%, Zep 65.99%, best RAG (k=2, 256-token chunks) 60.97%, LangMem 58.10%, OpenAI memory 52.90%, A-Mem 48.38%. p95 latency: full-context 17.117 s with about 26k tokens; Mem0 1.440 s with 1,764 memory tokens; Mem0g 2.590 s with 3,616 tokens. Memory store per conversation: about 7k tokens (Mem0), about 14k (Mem0g), over 600k (Zep). Note that **full-context beat every memory system on accuracy**; the memory systems won on cost and latency. — [arXiv 2504.19413](https://arxiv.org/html/2504.19413v1)
- Dispute: Zep says Mem0 misconfigured Zep (both speakers assigned the user role, timestamps appended to the text instead of `created_at`, searches run one after another), and reports a corrected LoCoMo J of 75.14% ± 0.17, later "80%" at under 200 ms. **[vendor claim]**, dated 6 May 2025, page updated June 2026. — [Zep blog](https://www.getzep.com/blog/lies-damn-lies-statistics-is-mem0-really-sota-in-agent-memory/)
- By 2026 Mem0 changed its own algorithm (April 2026): **single-pass hierarchical extraction with "ADD-only" writes**, agent-generated facts stored alongside user facts, multi-signal retrieval (semantic + BM25 + entity matching fused in parallel), and built-in entity linking in place of an external graph DB. Self-reported results: LoCoMo 92.5, LongMemEval 94.4, BEAM-1M 64.1, BEAM-10M 48.6, at about 6.7k–7k tokens per retrieval call. **[vendor claim]**, post dated 1 Apr 2026, updated 10 Oct 2026. Mem0 itself says memory staleness, meaning high-relevance facts that go out of date, is still an open problem. — [Mem0 "State of AI Agent Memory 2026"](https://mem0.ai/blog/state-of-ai-agent-memory-2026)

**Cost-focused write pipelines**
- LightMem (submitted 21 Oct 2025, revised Feb 2026; listed as ICLR 2026): an Atkinson-Shiffrin-style pipeline. (1) A "sensory" stage uses lightweight compression to filter irrelevant tokens and groups the rest by topic. (2) A topic-aware short-term stage consolidates and summarizes. (3) A long-term stage uses **sleep-time (offline) update**, which separates consolidation from online inference. On LongMemEval and LoCoMo with GPT and Qwen backbones: accuracy up to +7.7% / +29.3%, total tokens down up to 38x / 20.9x, API calls down up to 30x / 55.5x, and online-only tokens down up to 106x / 117x. — [LightMem, arXiv 2510.18866](https://arxiv.org/abs/2510.18866)
- Sleep-time compute (Letta/UC Berkeley, 17 Apr 2025): offline reasoning over a context before any query arrives reaches the same accuracy with about **5x less test-time compute** (Stateful GSM-Symbolic, Stateful AIME). Scaling sleep-time compute adds up to 13% / 18% accuracy, and amortizing it over related queries lowers cost per query by 2.5x. Efficacy correlates strongly with **how predictable the queries are**. — [arXiv 2504.13171](https://arxiv.org/abs/2504.13171)
- Letta sleep-time agents (21 Apr 2025): a primary agent cannot edit core memory; a background sleep-time agent holds the memory-editing tools, rewrites the shared memory blocks into "learned context", and processes uploaded data sources asynchronously. Run frequency is configurable: more frequent runs cost more tokens. — [Letta blog](https://www.letta.com/blog/sleep-time-compute)
- Mastra "Observational Memory" (page updated 17 Feb 2026): when raw history passes a token threshold, an Observer agent compresses it into dated, prioritized observations and drops the raw messages; a Reflector condenses observations when they pass a second threshold. There is **no vector retrieval**, so the stable prefix gets prompt caching (4–10x cheaper). Compression is 3–6x on text. LongMemEval-S: 84.23% (gpt-4o), 93.27% (gemini-3-pro-preview), 94.87% (gpt-5-mini). Knowledge-update 85.9% / 94.9% / 96.2%. **[vendor claim]** — [Mastra research](https://mastra.ai/research/observational-memory)
- LangChain guidance: writing memories "in the hot path" makes them available immediately but adds latency and splits the agent's attention. Writing "in the background" removes the latency, but you must choose when to trigger it (for example, after a quiet period with rescheduling, which amounts to debouncing). A **collection** of narrow memories "tends to lead to higher recall downstream" but models may "over-insert" or "over-update". A single **profile** document becomes "error-prone as the profile gets larger". — [LangChain memory concepts](https://docs.langchain.com/oss/python/concepts/memory)

**Open / small models doing memory operations**
- Hindsight (14 Dec 2025): memory organized as four networks (world facts, agent experiences, synthesized entity summaries, evolving beliefs) with retain / recall / reflect operations. With an **open-source 20B backbone**, accuracy rose from 39% (full-context, same backbone) to 83.6%, beating full-context GPT-4o. A larger backbone reached 91.4% on LongMemEval and 89.61% on LoCoMo. The abstract does not name the 20B model; that it is gpt-oss-20b is plausible but not confirmed. **[academic preprint from the vendor Vectorize]** — [arXiv 2512.12818](https://arxiv.org/abs/2512.12818)
- Memory-R1 (27 Aug 2025, revised Jan 2026): the Memory Manager (ADD/UPDATE/DELETE/NOOP) and the Answer Agent are trained with PPO/GRPO on only **152 LoCoMo QA pairs**. The reward is exact match of the downstream answer. LoCoMo J with LLaMA-3.1-8B: Mem0 45.68, MemoryOS 48.20, Memory-R1-GRPO 62.74. With Qwen-2.5-7B: Mem0 53.30, Memory-R1-GRPO 61.51. Gains carry across 3B–14B (Qwen-2.5-14B PPO J 65.26) and transfer zero-shot to LongMemEval (Qwen GRPO J 57.8). The paper's tables are internally inconsistent for 7B. — [arXiv 2508.19828](https://arxiv.org/html/2508.19828)
- A-MEM (Feb 2025, v11 Oct 2025): Zettelkasten-style notes. The biggest relative gains were on small open models: LoCoMo multi-hop F1 for Qwen2.5-1.5B rose from 9.05 to 18.23, and for Llama-3.2-3B from 6.88 to 17.44. For GPT-4o the gain was only +4.86. About 1,200 tokens per memory operation versus 16,900 for LoCoMo/MemGPT baselines. — [arXiv 2502.12110](https://arxiv.org/html/2502.12110)
- LongMemEval (Oct 2024): Llama-3.1-8B "often hallucinat[es] or miss[es] temporal cues" when extracting time ranges, so time-aware query expansion needs a strong LLM. 8B reading accuracy "drops sharply beyond 3k retrieved tokens" while GPT-4o keeps improving past 20k. — [arXiv 2410.10813](https://arxiv.org/html/2410.10813v2)
- Agent experience memory (Xiong et al., May 2025): **add-all memory hurts**. EHRAgent accuracy: fixed memory 16.75, add-all 13.05, strict (quality-gated) addition 38.50, strict addition + deletion 42.34, with memory shrinking from 1012 to 248 records. A vanilla LLM judge used as the gate can be worse than no gate (RegAgent 63.18 vs 67.53 fixed). A judge fine-tuned on only 300 trajectories gave strong long-term gains. — [arXiv 2505.16067](https://arxiv.org/html/2505.16067v2)
- MemoryAgentBench (July 2025, v4 June 2026): for RAG agents a stronger backbone gives only "marginal improvements". For the MIRIX memory agent, moving from GPT-4o-mini to GPT-4.1-mini raised the four-dataset average from 15.9 to 25.6. — [arXiv 2507.05257](https://arxiv.org/html/2507.05257v4)
- Construction cost is the bottleneck in practice. HaluMem-Medium ingestion time: Mem0 about 2,768 min, Mem0-Graph about 2,840 min, MemOS about 1,029 min, Supermemory about 273 min. Retrieval takes only 20–140 min. — [HaluMem, arXiv 2511.03506](https://arxiv.org/html/2511.03506v3)

### Inferences
- **Recommended policy for GEM AI (write path):**
  1. **L0, always:** store the raw episode in Postgres (chat turn, document chunk with document id and version, agent step) with `event_time`, `ingest_time`, author, ACL, source URI and hash. No LLM call. This is the lossless fallback (Zep episodes, TencentDB L0).
  2. **Cheap pre-filter, no LLM:** drop greetings, acknowledgements and boilerplate; run regex/NER PII detection; skip near-duplicates by hash or embedding.
  3. **Batched extraction (background, about one LLM call per window):** debounce chat for N minutes or until the session ends; process documents per section on upload or new version. Use gpt-oss-20B (or a Memory-R1-style fine-tune) to emit typed atomic facts as JSON: entity, attribute, value, `valid_from`, confidence, kind (fact / decision / preference / procedure / status), and source span.
  4. **Resolve against the top-k (k≈10) same-entity facts** with one LLM call per fact batch, choosing ADD / UPDATE (supersede) / INVALIDATE / NOOP. Never hard-delete; set `valid_to` and `superseded_by`.
  5. **Nightly consolidation** (sleep-time job on the larger model, e.g. 120B): entity summaries, project-status pages, procedure distillation, duplicate merging, decay.
- Use the 120B model for the steps where the evidence says small models fail (temporal normalization, contradiction adjudication, reflection). Use 20B for routine extraction. This tiering is an inference, not a measured result.
- The 2026 Mem0 move to "ADD-only + retrieval-time fusion" suggests that LLM-adjudicated UPDATE/DELETE on every write may not pay for itself in recall. But HaluMem (below) shows update omission is the dominant error, so an enterprise brain that must answer "what is the current deadline" still needs explicit supersession links. A hybrid (append-only facts plus explicit validity intervals) gets both.

### Gaps
- No peer-reviewed study benchmarks gpt-oss-20B/120B, Nemotron or Gemma specifically as memory extractors or updaters. One adjacent 2026 information-extraction study found GPT-OSS-120B at 74.9 F1 versus Qwen3-4B at 54.8, but that is a different task ([arXiv 2608.31058](https://arxiv.org/pdf/2608.31058), via search summary only). GEM AI should build its own extraction eval.
- The Hindsight 20B model identity was not confirmed.
- No head-to-head study of hot-path versus background writes on the same benchmark was found. Evidence for background writes is indirect (LightMem, sleep-time compute).

---

## Q2. How should importance be estimated for enterprise content (documents vs chat), and does it need an LLM call per item?

### Takeaway
The classic approach (Generative Agents) is one LLM call per memory to rate "poignancy" from 1 to 10. That is affordable for low-volume chat but wasteful for bulk documents. Stronger and cheaper signals are: **usage** (retrieval count, recency; MemoryOS "heat", ChatGPT recency/frequency), **outcome** (did using the memory lead to success; Xiong et al., Memory-R1), **structural priors by content type** (decision, deadline, owner, status, procedure), and a **cheap pre-filter** (LightMem). Importance should mostly decide **promotion and ranking**, not whether raw content is kept at all.

### Cited Findings
- **Generative Agents (April 2023):** retrieval score = recency + importance + relevance, all weights α=1, each min-max normalized to [0,1]. Recency is an exponential decay with factor **0.995 per sandbox game hour since last retrieval**. Importance comes from an LLM prompt rating 1 ("purely mundane, e.g. brushing teeth") to 10 ("extremely poignant, e.g. a break up, college acceptance"), scored once when the memory is created. Relevance is embedding cosine similarity. — [arXiv 2304.03442](https://ar5iv.labs.arxiv.org/html/2304.03442)
- **Reflection trigger:** when the sum of importance scores of recent events exceeds **150** (about 2–3 times per agent-day), the model takes the 100 most recent records, asks 3 salient questions, and writes 5 insights in the format "insight (because of 1, 5, 3)". Each insight stores pointers to its evidence records, and reflections can cite other reflections, forming trees. Ablation (TrueSkill μ): full 29.89, no reflection 26.88, no reflection or planning 25.64, no memory/planning/reflection 21.21. — [arXiv 2304.03442](https://ar5iv.labs.arxiv.org/html/2304.03442)
- **MemoryOS (30 May 2025), usage-based promotion with no per-item importance call:** short-term memory is a FIFO of 7 pages. A page joins a mid-term topic segment when cos + Jaccard(keywords) > 0.6. Segment **Heat = N_visit + L_interaction + exp(−Δt/μ)** with μ=1e7 s. The lowest-heat segments are evicted at capacity; segments with heat above τ=5 are promoted to long-term persona memory (90 trait dimensions; user knowledge base capped at 100 entries, FIFO). LoCoMo with GPT-4o-mini: +49.11% F1 and +46.18% BLEU-1 over baselines, 3,874 tokens and 4.9 LLM calls per response. — [arXiv 2506.06326](https://arxiv.org/html/2506.06326)
- **ChatGPT (Oct 2025):** automatic memory management for Plus/Pro on the web from 15 Oct 2025. Memories are prioritized by **how recently and how frequently** something is mentioned, which removed "memory full" errors; users can still search, sort and re-prioritize. **[news reports of a vendor feature]** — [TechRadar](https://www.techradar.com/ai-platforms-assistants/chatgpt/chatgpt-is-smarter-now-that-its-learned-to-forget-a-huge-memory-upgrade-is-coming); [Eastleigh Voice](https://eastleighvoice.co.ke/chatgpt%20chatbot/227223/chatgpt-can-now-automatically-manage-saved-memories)
- **Zep Fact Ratings [vendor feature]:** developers pass a rating instruction with high, medium and low example facts (the example in the post is a "poignancy" rubric), and Zep rates each extracted fact for relevance to the use case. I could not confirm a documented retrieval cutoff parameter. — [Zep blog](https://blog.getzep.com/announcing-zep-fact-ratings/)
- **MemoryBank (May 2023):** Ebbinghaus retention R = e^(−t/S). S (strength) starts at 1 when a memory is first mentioned; each recall adds 1 to S and resets t to 0. Low-retention memories are forgotten probabilistically, and the authors call the model "exploratory and highly simplified". Storage holds raw timestamped conversations, daily event summaries rolled up into a global summary, and daily personality insights rolled up into a global user portrait. — [arXiv 2305.10250](https://ar5iv.labs.arxiv.org/html/2305.10250)
- **Outcome as free importance labels:** "future task evaluations can serve as free quality labels for stored memory." History-based deletion removes a record once it has been retrieved at least n times with average downstream utility below β. — [arXiv 2505.16067](https://arxiv.org/html/2505.16067v2). Memory-R1 learns write decisions from downstream answer correctness alone. — [arXiv 2508.19828](https://arxiv.org/html/2508.19828)
- **Cheap pre-filtering before any LLM:** LightMem's sensory stage compresses and filters tokens before extraction, which accounts for most of its 30–310x API-call savings. — [arXiv 2510.18866](https://arxiv.org/abs/2510.18866)
- **What to keep when compressing (Anthropic, 29 Sep 2025):** compaction "preserves architectural decisions, unresolved bugs, and implementation details" and discards redundant tool outputs. Tune for recall first, then precision. — [Anthropic engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- **Importance is query-dependent and future-dependent:** a compressed memory can answer today's query correctly yet drop the distinctions a later update needs. Tombstone removal caused 16/16 replay failures in the targeted test. Pilot study, 17 Sep 2026. — [arXiv 2609.20045](https://arxiv.org/abs/2609.20045)
- **Procedural importance:** TencentDB Agent Memory extracts "Skills" (reusable procedures with versions, trigger boundaries, execution steps and validation rules) as a separate asset from chat facts. — [GitHub](https://github.com/TencentCloud/TencentDB-Agent-Memory)

### Inferences
- **Documents:** do not score importance with an LLM per chunk. Index every chunk (RAG). Extract "brain facts" only from high-prior section types (decisions, owners, dates/deadlines, prices/SLAs, policies, procedures, status), using one batched call per section. Use a learned or lightweight classifier (or keyword/NER rules) to choose which sections get extraction.
- **Chat:** skip turns that are pure acknowledgement; have the extraction call return a 1–10 salience field **in the same call** (piggyback, no extra call). Combine it with usage heat, MemoryOS-style:
  `score = w1·salience/10 + w2·log(1+retrievals) + w3·exp(−Δt/τ_type) + w4·outcome_utility`.
  Make τ depend on type: decisions and policies decay slowly; status and ephemeral plans decay fast.
- Use importance for promotion (L1 fact → L2 project page → L3 org profile), ranking and eviction from the hot tier, **not** for deleting L0 raw data. The 2026 compression-sufficiency result argues against discarding what seems unimportant today.

### Gaps
- No published study compares learned importance classifiers with LLM-judged importance for enterprise documents.
- Generative Agents importance was validated only through end-to-end believability, not calibration.
- The Nemori paper ("predict-calibrate": store only what existing memory failed to predict, [arXiv 2508.03341](https://arxiv.org/abs/2508.03341)) could not be fetched before the session limit, so its numbers are unverified.

---

## Q3. How do strong systems handle temporal validity and knowledge updates (LongMemEval "knowledge update")?

### Takeaway
The pattern that works is **bi-temporal, non-destructive supersession**. Each fact carries event-time validity (`valid_from` / `valid_to`) and system-time (created / expired). A new fact that contradicts an old one closes the old fact's validity interval instead of deleting it. Raw episodes stay linked for provenance. At query time, add time-aware query expansion, and read with a reasoning step (Chain-of-Note) that orders evidence by time. Even so, **update handling is the weakest operation across systems**: HaluMem measures update omission above 50% for most systems, and MemoryAgentBench multi-hop conflict resolution reaches at most 28%.

### Cited Findings
- **Zep/Graphiti (Jan 2025):** timeline T holds `t_valid` / `t_invalid` (when the fact was true); timeline T′ holds `t′_created` / `t′_expired` (when the system learned it, for audit). An LLM compares each new edge with semantically related edges; for temporally overlapping contradictions it sets the old edge's `t_invalid` to the new edge's `t_valid`, so new information wins. Entity extraction uses the current message plus the last 4. Resolution embeds entity names (1024-d), adds full-text search, and an LLM resolution prompt decides duplicates. Fact dedup is restricted to edges between the same entity pair. Graph writes use **predefined Cypher, not LLM-generated queries**. Episodic nodes keep raw text losslessly, with bidirectional links between facts and their sources. — [arXiv 2501.13956](https://arxiv.org/html/2501.13956v1)
- **Zep on LongMemEval-S:** gpt-4o 60.2% (full context, 115k tokens, 28.9 s) versus 71.2% (Zep, 1.6k tokens, 2.58 s). Knowledge-update: gpt-4o 78.2% → 83.3%, but gpt-4o-mini 76.9% → 74.4% (a drop). Temporal reasoning 45.1% → 62.4%. Single-session-assistant fell 94.6% → 80.4%, meaning extraction lost facts that the assistant itself had said. — [arXiv 2501.13956](https://arxiv.org/html/2501.13956v1)
- **LongMemEval (Oct 2024):** 500 questions testing five abilities (information extraction, multi-session reasoning, knowledge updates, temporal reasoning, abstention). LongMemEval_S is about 115k tokens; _M is 500 sessions, about 1.5M tokens. ChatGPT scored 0.577 and Coze 0.330 versus 0.918 for offline GPT-4o reading. Long-context LLMs drop 30–60%. Design findings:
  - **round-level values beat session-level values**;
  - **storing only extracted facts or summaries loses information** (except for multi-session questions);
  - **key = value + extracted facts** adds +9.4% recall@k and +5.4% accuracy;
  - **time-aware query expansion** adds +11.3% (rounds) / +6.8% (sessions) temporal recall;
  - Chain-of-Note + JSON reading adds up to +10 points.
  — [arXiv 2410.10813](https://arxiv.org/html/2410.10813v2)
- **MemoryAgentBench "selective forgetting" (FactConsolidation, built from MQUAKE counterfactual edits; newer facts carry larger serial numbers):** single-hop / multi-hop scores: GPT-4o 60/5, GPT-5-mini 78/28, BM25 RAG 48/3, HippoRAG-v2 54/5, Mem0 18/2, Zep 7/3, MemGPT 28/3, MIRIX 14/2. "All methods fail on the multi-hop situation (with achieving at most 28% accuracy)." o4-mini reaches 80 on multi-hop at 6K context but only 14 at 32K. — [arXiv 2507.05257](https://arxiv.org/html/2507.05257v4)
- **HaluMem (Nov 2025, v3 Jan 2026), update stage on HaluMem-Medium (correct / omission):** Mem0 25.50% / 74.02%, Mem0-Graph 24.50% / 75.24%, Memobase 5.20% / 94.25%, Supermemory 16.37% / 82.47%, Zep 47.28% / 52.31%, MemOS 62.11% / 37.48%. Update hallucination is below 2%, but only because few updates are attempted at all. On HaluMem-Long, Mem0's update correctness fell to 1.45%. — [arXiv 2511.03506](https://arxiv.org/html/2511.03506v3)
- **Conflicting multi-source memory (28 May 2026):** a trained structured-fusion resolver scored 80.3% versus 70.0% for the best prompt-only LLM. With abstention it reached 85.3% selective accuracy at 78.3% coverage. — [arXiv 2605.30087](https://arxiv.org/abs/2605.30087)
- **Mem0g** marks obsolete relations invalid rather than deleting them. — [arXiv 2504.19413](https://arxiv.org/html/2504.19413v1)
- **Vendor claims on knowledge-update (LongMemEval-S):** Mastra 96.2% (gpt-5-mini); Supermemory claims 100% knowledge-update recall, which is a retrieval metric. These are not comparable across judges and metrics. — [Mastra](https://mastra.ai/research/observational-memory); [Supermemory](https://supermemory.ai/research/longmembench/)
- **Zep on LoCoMo:** LoCoMo contains no knowledge-update questions (such as a user changing jobs), so it cannot test supersession. — [Zep blog](https://www.getzep.com/blog/lies-damn-lies-statistics-is-mem0-really-sota-in-agent-memory/)

### Inferences
- **Postgres schema sketch:**
  `fact(id, subject_entity_id, predicate, object, valid_from, valid_to, recorded_at, expired_at, superseded_by, confidence, status, source_episode_ids[], acl)`.
  A new fact "deadline = March" for (project X, deadline) closes the open "Feb" row (`valid_to = event time of the new statement`) and links `superseded_by`.
- Restrict contradiction candidates to the **same entity + predicate** (as Zep does for the same entity pair). This makes contradiction detection one small LLM call, or even rule-based for single-valued attributes such as deadline, owner and status.
- Normalize relative dates ("next Friday") to absolute dates at write time using the source's event timestamp, with the stronger model, since 8B-class models miss temporal cues.
- Answers about current state should read only valid rows, but show a "changed from Feb (on date, by whom, source)" trail.

### Gaps
- No public per-category knowledge-update results were found for systems running on open 20–120B models.
- MemoryAgentBench and HaluMem have no Graphiti-style fully bi-temporal entry with an open model.

---

## Q4. What are the documented attacks and safeguards for poisoned or wrong memories?

### Takeaway
Memory turns a one-time injection into a **persistent** compromise. Documented attacks:
- ChatGPT memory writes from untrusted web pages (2024);
- RAG and memory backdoors at below 0.1% poison rate (AgentPoison);
- query-only injection by ordinary users (MINJA, about 98% injection success);
- forged reasoning traces (FARMA, 2026);
- plain false statements, where poisoning 1.2% of a corpus cut accuracy from 0.85 to 0.30 (2026).

Content screening at write time does not catch plain false assertions. Provenance down-weighting helps only if it effectively excludes untrusted sources. Layered defenses are recommended: trust-scoped write channels, provenance, consensus validation, audit and rollback, and human review for shared or org-level memory. Separately, the system can also store its **own** errors: extraction hallucination and omission are measured to be high.

### Cited Findings
- **SpAIware (Rehberger, 20 Sep 2024):** a prompt injection in an untrusted website or document invoked ChatGPT's memory tool to store instructions that exfiltrated all future chats via image URLs. OpenAI fixed the exfiltration channel in ChatGPT 1.2024.247, but "a website or untrusted document can still invoke the memory tool to store arbitrary memories." The author advises users to review memories regularly and vendors to run security checks server-side. — [Embrace The Red](https://embracethered.com/blog/posts/2024/chatgpt-macos-app-persistent-data-exfiltration/)
- **AgentPoison (17 Jul 2024):** an optimized backdoor trigger poisons long-term memory or a RAG knowledge base. Average attack success is above 80% at a poison rate below 0.1%, with under 1% impact on benign performance, across driving, QA and EHR agents. — [arXiv 2407.12784](https://arxiv.org/abs/2407.12784)
- **MINJA (5 Mar 2025, v5 Feb 2026):** an attacker using only normal queries induces the agent to store malicious records, via bridging steps, an indication prompt and progressive shortening. Average injection success is about **98.2%** and attack success about **76.8%** (GPT-4/4o), with utility drop under 2% on most tasks.
  - Defenses tested: a GPT-4o prompt-level detector flagged 131/135 on MIMIC but **0/135 on RAP** with a targeted prompt, and caused 34/50 false positives.
  - Embedding-level sanitization fails because malicious and benign records are entangled in embedding space.
  — [arXiv 2503.03704](https://arxiv.org/html/2503.03704)
- **MEXTRA (Feb 2025, ACL 2025):** a black-box memory-extraction attack recovers private user–agent interactions stored as demonstrations. — [arXiv 2502.13172](https://arxiv.org/abs/2502.13172)
- **A-MemGuard (29 Sep 2025):** consensus validation compares reasoning paths across related memories, and a dual memory stores detected failures as "lessons". It cuts attack success by over 95% with "minimal" utility cost. — [arXiv 2510.02373](https://arxiv.org/abs/2510.02373)
- **FARMA (6 Jul 2026):** forged reasoning traces in evasive language with self-reinforcement reach up to 100% attack success and defeat keyword filters and A-MemGuard. The SENTINEL "Reasoning Guard" (five weighted structural signals) reduces this to as low as 0%, with no false positives on 326 benign traces. — [arXiv 2607.05029](https://arxiv.org/abs/2607.05029)
- **Systematic study (3 Jun 2026):** four write channels, nine structural vulnerabilities, six attack classes, and the MPBench benchmark. "Agents that write and retrieve memory more aggressively are more exploitable", and existing prompt-injection defenses do not cover memory poisoning. — [arXiv 2606.04329](https://arxiv.org/abs/2606.04329)
- **"Utility Under Attack" (21 Aug 2026):**
  - Plainly worded false assertions in 1.2% of a LongMemEval corpus cut accuracy from 0.850 to 0.300.
  - A four-stage write-time screen caught 0.832 of indirect prompt injections (1.5% false flags) but **rejected none of 360 poisoned memories**, because telling true from false needs external grounding.
  - Provenance-weighted retrieval at the shipped weight was no better than no defense (p=0.80). A stronger weight helped only by excluding untrusted content, which drops accuracy to 0.04 when the true evidence itself comes from an untrusted source.
  - The author recommends bounded occupancy limits at retrieval time.
  — [arXiv 2608.21230](https://arxiv.org/abs/2608.21230)
- **Other 2026 work:** an EHR-agent study proposes trust scoring, temporal decay and trust-aware retrieval ([arXiv 2601.05504](https://arxiv.org/html/2601.05504v2)); MemAudit proposes post-hoc causal-attribution auditing ([arXiv 2605.23723](https://arxiv.org/pdf/2605.23723)). Per search summaries only, OWASP's 2026 Agentic Top 10 lists memory/context poisoning as ASI06 (not verified on OWASP's site).
- **Self-inflicted wrong memories (HaluMem):** extraction recall is below 60% for every system except MemOS, and memory accuracy is below 62% for all. Mem0 on Medium: recall 42.91%, accuracy 60.86%, false-memory resistance 56.80%. QA accuracy is below 70% for all systems. — [arXiv 2511.03506](https://arxiv.org/html/2511.03506v3)
- **Error propagation and experience-following:** agents copy retrieved past outputs when inputs look similar, so flawed records compound. Add-all memory gave "flat or declining" success. — [arXiv 2505.16067](https://arxiv.org/html/2505.16067v2)
- **Sensitive data policy (ChatGPT, Feb 2024 launch):** OpenAI said it steers ChatGPT away from proactively remembering sensitive information such as health details unless the user explicitly asks; users can view, delete or disable memory and use temporary chats. This is from launch coverage; the OpenAI help page returned 403. — [Axios](https://www.axios.com/local/san-francisco/2024/02/16/chatgpt-can-remember-things-now)

### Inferences
- **Safeguards for GEM AI:**
  1. **Trust tiers per write channel:** curated documents and admin input > authenticated employee statements > agent-generated or tool output > external web/email content. External or agent content may write only to scoped memory and never to org-level memory without review.
  2. **Treat retrieved content as data:** never store imperative instructions as memory; classify "instruction-like" text and drop or quarantine it.
  3. **PII/sensitive filter before extraction:** NER plus regex detectors, plus an extraction-prompt policy that excludes health, HR and credentials unless the field is explicitly business-relevant and allowed by ACL.
  4. **Provenance on every fact** (source episode, author, channel) and **bounded occupancy**: cap how many retrieved items any single source or untrusted tier can contribute.
  5. **Corroboration for org-level facts:** require two independent sources, or human approval, before promoting a fact to the shared brain; show "Memory updated" notices with undo.
  6. **Audit and rollback:** an append-only fact log with history (as Mem0 keeps), so a poisoned source can be revoked and every fact derived from it invalidated.
  7. **Don't store agent self-assessments as facts** without an outcome signal.

### Gaps
- No evaluation was found of these defenses on open models such as gpt-oss.
- The full MPBench attack-success numbers (2606.04329) were not available on the abstract page.

---

## Q5. When should a system rely on memory vs re-read documents (long-context vs RAG vs structured memory)?

### Takeaway
Extracted memory is a **lossy index and cache**, not a replacement for sources. Full context wins on accuracy when everything fits (LoCoMo, about 26k tokens), but degrades badly at 100k+ tokens (LongMemEval: −30% to −60%) and costs 10–20x more latency and tokens. Structured memory wins on long horizons, preferences, temporal questions and cost. It loses on verbatim detail (single-session-assistant −17.7 points) and on conflict resolution. Agentic search over raw files is a strong baseline. Best practice: memory and summaries for orientation and "current state"; raw-source retrieval for exact quotes, numbers and anything needing verification.

### Cited Findings
- Mem0 paper: full context 72.90% J at a p95 of 17.1 s with about 26k tokens, versus Mem0 66.88% at 1.44 s with about 1.8k tokens. — [arXiv 2504.19413](https://arxiv.org/html/2504.19413v1)
- Zep on LongMemEval-S (115k): memory beats full context (71.2% vs 60.2% on gpt-4o) at about 90% lower latency, but loses on single-session-assistant (94.6% → 80.4%). — [arXiv 2501.13956](https://arxiv.org/html/2501.13956v1)
- LongMemEval: storing only facts or summaries as values loses information. Best is raw rounds as values with fact-augmented keys. — [arXiv 2410.10813](https://arxiv.org/html/2410.10813v2)
- MemoryAgentBench: RAG is good at accurate retrieval, but long-context agents are best at test-time learning and long-range understanding. RAG and commercial memory agents "retrieve only partial information". — [arXiv 2507.05257](https://arxiv.org/html/2507.05257v4)
- BEAM (31 Oct 2025, v2 Feb 2026): 100 conversations up to 10M tokens, 2,000 questions. Even LLMs with 1M-token context windows struggle as dialogues lengthen, with or without RAG. The LIGHT framework (episodic memory + working memory + a scratchpad of salient facts) adds 3.5–12.69%. — [arXiv 2510.27246](https://arxiv.org/abs/2510.27246)
- Letta (12 Aug 2025): an agent with only filesystem tools (grep, search_files, open/close) scored **74.0%** on LoCoMo with gpt-4o-mini, versus Mem0's reported 68.5%. Letta argues that remembering depends on the agent's retrieval behaviour more than on the memory tool. **[vendor claim]** — [Letta blog](https://www.letta.com/blog/benchmarking-ai-agent-memory)
- Anthropic (29 Sep 2025): "context rot" means recall falls as the context grows. Anthropic recommends **just-in-time retrieval** of lightweight identifiers (paths, queries, links), a hybrid of upfront context plus grep/glob, and structured notes (NOTES.md, memory tool) for decisions and unresolved issues. — [Anthropic engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- TencentDB Agent Memory (open-sourced May 2026, v2.0.0): L0 conversation (raw, for exact wording, timestamps and source checks), L1 atoms (facts, preferences, constraints, events), L2 scenario blocks per project, L3 persona/core profile. Higher layers are written by an asynchronous pipeline. **Retrieval bootstraps from L2/L3 and falls back to L1/L0 via BM25 + vector + RRF** when specific facts are needed. Governance: private, team, restricted (user/role/agent ACL) and agent visibility; new memories are private by default; personal Skills are shared after review. PersonaMem 48% → 76% **[vendor claim]**. — [GitHub](https://github.com/TencentCloud/TencentDB-Agent-Memory); [MarkTechPost, 23 May 2026](https://www.marktechpost.com/2026/05/23/tencent-open-sources-tencentdb-agent-memory-a-4-tier-local-memory-pipeline-for-ai-agents/)
- MemOS (July 2025, v4 Dec 2025): the MemCube unit wraps content plus metadata such as **provenance and versioning**, across plaintext, activation (KV) and parameter memory, which can be composed, migrated and fused. — [arXiv 2507.03724](https://arxiv.org/abs/2507.03724). MemOS also had the best extraction recall and update correctness in HaluMem. — [arXiv 2511.03506](https://arxiv.org/html/2511.03506v3)
- MIRIX (10 Jul 2025): six memory types (Core, Episodic, Semantic, Procedural, Resource, Knowledge Vault) with multi-agent update and retrieval. +35% accuracy over RAG on ScreenshotVQA with 99.9% less storage; 85.4% on LoCoMo. — [arXiv 2507.07957](https://arxiv.org/abs/2507.07957)
- MemGPT (Oct 2023): OS-style virtual context management. The LLM pages information between in-context memory and external recall/archival storage through function calls. — [arXiv 2310.08560](https://arxiv.org/abs/2310.08560) (abstract-level claim, not re-fetched)

### Inferences
- For GEM AI chat, the context should be built as: L3 org/team profile + L2 project pages (current state, decisions, owners) + top-k L1 facts (valid only) + **raw L0 snippets for any fact used in the answer** (citations), with a "re-read source" tool for exact figures.
- Do not let chat rely on extracted memory alone for numbers, quotes or legal/contract terms; re-read the cited document version.
- Sleep-time pre-computation pays off most where queries are predictable (project status, team FAQs), per the sleep-time compute finding.

### Gaps
- No controlled study of enterprise document corpora (versus conversations) comparing memory-only and re-read answers was found. Most benchmarks are conversational and synthetic.

---

## Q6. How should long-term memory be evaluated (benchmarks and metrics for an enterprise brain)?

### Takeaway
End-to-end QA benchmarks (LoCoMo, LongMemEval, BEAM, PersonaMem, MemoryAgentBench, MemBench) are necessary but hide where errors start. **Operation-level evaluation** (HaluMem: extraction recall/precision, false-memory resistance, update correct/omission/hallucination) is the right model for an enterprise brain. Vendor leaderboard numbers are not comparable (different judges, recall-only vs end-to-end, dataset revisions).

### Cited Findings
- **LoCoMo** (27 Feb 2024): about 300 turns and 9K tokens per conversation, up to 35 sessions; tasks are QA, event summarization and multimodal dialogue. Models lag humans on temporal and causal dynamics. — [arXiv 2402.17753](https://arxiv.org/abs/2402.17753). Criticisms: conversations average 16–26k tokens (they fit in context), there are no knowledge-update questions, and category 5 lacks ground truth. — [Zep blog](https://www.getzep.com/blog/lies-damn-lies-statistics-is-mem0-really-sota-in-agent-memory/)
- **LongMemEval** (Oct 2024): five abilities and seven question types, including abstention. — [arXiv 2410.10813](https://arxiv.org/html/2410.10813v2)
- **PersonaMem** (Apr 2025, COLM 2025): more than 180 user histories of up to 60 sessions across 15 tasks; tests tracking of evolving profiles. Frontier models (GPT-4.1, o4-mini, GPT-4.5, o1, Gemini-2.0) reach only about 50%. — [arXiv 2504.14225](https://arxiv.org/abs/2504.14225)
- **MemoryAgentBench** (Jul 2025): four competencies (accurate retrieval, test-time learning, long-range understanding, selective forgetting); "current methods fall short of mastering all four." — [arXiv 2507.05257](https://arxiv.org/html/2507.05257v4)
- **MemBench** (Jun 2025, ACL 2025 Findings): factual vs reflective memory, participation vs observation scenarios, effectiveness / efficiency / capacity. — [arXiv 2506.21605](https://arxiv.org/abs/2506.21605)
- **BEAM**: up to 10M tokens. — [arXiv 2510.27246](https://arxiv.org/abs/2510.27246)
- **HaluMem** metrics: memory recall, importance-weighted recall, target precision, accuracy, false-memory resistance, extraction F1; update correct / hallucination / omission; QA correct / hallucination / omission. About 15k memory points and 3.5k questions per split; over 1M tokens of context. — [arXiv 2511.03506](https://arxiv.org/html/2511.03506v3)
- **Mem0 (2026)**: scores vary with dataset revision, retrieval depth, reranking, answer and judge models, and recall-only versus end-to-end grading; recall-only runs systematically higher. **[vendor statement]** — [Mem0 blog](https://mem0.ai/blog/state-of-ai-agent-memory-2026)
- **2026 additions found by search but not fetched:** RECON (compositional reasoning over long contexts, [arXiv 2607.16716](https://arxiv.org/pdf/2607.16716)); LongMemEval-V2 for web agents (mentioned in search results only).

### Inferences
- **Recommended enterprise metric set:**
  - extraction precision (junk rate) and recall of salient facts on a labeled sample of documents and chats;
  - update correctness, omission and stale-answer rate (questions whose answer changed);
  - temporal correctness;
  - abstention and refusal correctness;
  - citation / provenance validity (each answer fact traces to a source span);
  - PII leakage and ACL-violation rate;
  - poisoning robustness (MINJA- or MPBench-style red team);
  - cost: tokens and LLM calls per ingested MB and per query, plus p95 latency.
- Build a private "GEM-LongMemEval": synthetic company timelines with deadline changes, owner changes and contradicting documents, judged by the 120B model and spot-checked by humans.

### Gaps
- No public enterprise-document memory benchmark with knowledge updates was verified. MEMTRACK (Slack/Linear/Git state tracking) was not fetched.

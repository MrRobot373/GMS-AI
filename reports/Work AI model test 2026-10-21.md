# Work AI test: MiniMax M3.1 Flash and Nemotron 3 Ultra

Signed in as Yash Badgujar on the local dev server (`http://localhost:3000`, workspace **General**, organization **GMS**) and ran five Work AI tasks on 21 October 2026. The workspace has no model named “MiniMax M3”. The MiniMax model that is enabled for Work AI is **Minimax M3.1 Flash** (`minimax-m3.1-flash`). “Nimitron Ultra” is **Nemotron 3 Ultra** (`nemotron-3-ultra`).

This is the Windows dev server (`pnpm dev`, API on port 4000). `WORK_SANDBOX=off` and `WORK_ISOLATION=off`, so each task runs as the same Windows user that runs the API, inside its own folder under `apps/api/.data/work`. Work AI settings at the time of the test: ask before risky actions, web search on, shell network off unless approved, at most 2 tasks per person at once. The shell the agent gets is PowerShell.

## What was checked

Each task had a result that can be checked by hand or against a page that was opened again afterwards.

| Task | Model | Asked for | Ground truth |
| --- | --- | --- | --- |
| 1a | MiniMax | Motor slip and efficiency, by running code | Ns 1500 rpm, slip 4.00%, shaft power 6.967 kW, efficiency 92.89% |
| 1b | MiniMax | Same task, started again on its own | same numbers |
| 2 | Nemotron 3 Ultra | License brief from pages it actually opens | NVIDIA Nemotron Open Model License, last modified 15 December 2025 |
| 3 | MiniMax | Energy CSV: rate, bad row, region totals | 9.00 INR/kWh; Chennai Feb is the zero row; Pune 37,370 kWh / 336,330 INR; Chennai 20,040 / 180,360; Delhi 46,700 / 420,300 |
| 4 | Nemotron 3 Ultra | Fix a broken LMTD function and run it | Missing `import math`. LMTD = (40−30)/ln(40/30) = **34.76** |
| 5 | MiniMax | Slip at 1470 rpm, and do it with no tools | Ns 1500 rpm, slip **2.00%**, no files |

## Scoreboard

| Task | Status the product shows | Clock (IST) | Input tokens | Output tokens | Tool calls | Verdict on the work |
| --- | --- | --- | --- | --- | --- | --- |
| 1a Motor, started with task 2 | Failed | 12:15:57–12:16:58 | 0 | 0 | 0 | Runtime never finished starting |
| 2 License brief | Completed | 12:15:57–12:25:57 | 100,686 | 918 | 4 | Quotes match the NVIDIA page |
| 1b Motor, started alone | Completed | 12:26:54–12:29:37 | 490,474 | 11,229 | 30 | Numbers match; far too many shell retries |
| 3 Energy CSV | Failed | 12:30:37–12:34:36 | 430,185 | 13,784 | 25 | Report is correct; the API restart marked the task failed |
| 4 LMTD fix | Failed | 12:31:57–12:34:36 | 153,504 | 1,305 | 14 | `34.76` and the missing import are right; same restart |
| 5 Slip, no tools | Completed | 12:35:58–12:36:11 | 9,119 | 168 | 0 | 2.00%, and it obeyed the “no tools” instruction |

Tasks 3 and 4 were both stamped failed at 12:34:36, the same second. The API process had been replaced at 12:34:18. On startup, Work AI marks every task that was still “running” as failed with: “The server restarted while this task was running. Send a message to continue.” The files those tasks had already written were kept.

## How a task actually runs

The task page shows the prompt, then a live timeline. Each tool is one row: the skill it loaded, the search, the page it opened, the file it wrote, the command it ran. A plan from `todo_write` appears as a checklist. The footer shows the token total. The header shows Working or Done (or Failed). The model name is chosen on the Work AI home composer; the task page itself does not show which model ran.

Under the hood the API starts one DeepSeek Harness process per task (`dsh --profile sdk`), pointed at `http://127.0.0.1:4000/api/internal/work/llm/v1` with the task’s model. The process has 60 seconds to answer the `initialize` call. If it does not, the task fails with “The agent runtime didn't start in time.” and the person is charged nothing, because the model was never called. After initialize, the model is called through the API, which waits up to 150 seconds for the first byte and retries a few times when the model host is slow.

The system prompt tells the agent to plan with `todo_write`, to save deliverables in the working folder, to put scratch work in `scratch/`, and, on the web, to cite a page only after `web_fetch` has read it.

## Task 1 — motor calculation (MiniMax)

**First start, together with the license task.** Both were created in the same second. MiniMax was marked running, then failed 62 seconds later with “The agent runtime didn't start in time.” The timeline has four events: the prompt, queued, running, failed. No assistant text, no tool call, 0 tokens. The runtime folder had been filled (skills copied, patch written), so the process had started and then missed the 60-second initialize deadline while a second runtime was starting beside it. Nemotron stayed queued until that failure freed the slot, then started cleanly.

**Second start, alone.** This one completed in 2 minutes 43 seconds. The decision sequence:

1. It said it would plan, then write and run the script, and called `todo_write` with the three steps from the prompt.
2. It loaded the `python-project` skill.
3. It wrote `motor.py`.
4. `python --version; python motor.py` failed: `python` is not on the PATH this shell is given.
5. It looked for `py`, `python3`, and `python` with `Get-Command`. None were found.
6. It searched common install folders, then listed `%LOCALAPPDATA%\Programs\Python` and found Python 3.11, 3.12, and 3.13.
7. Calling `python.exe` through a PowerShell pipeline failed with “Cannot run a document in the middle of a pipeline.”
8. `cmd` was also missing from PATH. `Start-Process` of `C:\Windows\System32\cmd.exe` worked. It ran the script that way and read `motor_stdout.txt`.
9. It added two extra plan items on its own: an independent cross-check, and cleaning scratch files out of the working folder. Both were completed. Scratch stayed in `scratch/`. The folder the person sees holds `motor.py` and `results.md`.

Stdout that the script actually printed:

```
Synchronous speed : 1500 rpm
Slip              : 4.00 %
Shaft power       : 6.967 kW
Efficiency        : 92.89 %
omega = 150.796447 rad/s
P_shaft = 6966.796 W
losses = 533.204 W
```

Those match the hand calculation: Ns = 120×50/4 = 1500; slip = (1500−1440)/1500 = 4.00%; ω = 1440×2π/60 = 150.796447; P = 46.2×ω = 6966.796 W = 6.967 kW; η = 6966.796/7500 = 92.89%.

The approach is the right one for this prompt: plan, write, run, quote the stdout, check the arithmetic a second way. The cost is the problem. Eighteen PowerShell calls and three reads, on top of the skill text, produced **490,474 input tokens** for a four-number result. Each failed command is sent back to the model with the whole transcript. Finding Python by walking the disk is thorough, and on a server where isolation is on it would also be the wrong place to look.

## Task 2 — NVIDIA license brief (Nemotron 3 Ultra)

Completed in 10 minutes. Almost all of that was waiting on the model. The runtime was up and connected to the API well before the first tokens arrived. One model call moved about 25,000 input tokens; four calls landed at 100,686 input and only 918 output.

Tool sequence, in order:

1. `skill` → `web-research`
2. `web_search` with two queries: “NVIDIA Nemotron Open Model License commercial use” and “NVIDIA Nemotron Open Model License name usage trademark”
3. `web_fetch` of `https://www.nvidia.com/en-us/agreements/enterprise-software/nvidia-nemotron-open-model-license/`
4. `write` → `nemotron-license.md`

It did not invent a second URL. Every bullet cites that one page. The page was fetched again, separately, after the task. The file matches it:

- “Works are commercially usable,” and the grant is perpetual, worldwide, non-exclusive, no-charge, royalty-free, and irrevocable.
- NVIDIA does not claim ownership of outputs.
- Section 4: no permission to use NVIDIA’s trade names, trademarks, service marks, or product names, except for reasonable and customary use in describing the origin of the Work and reproducing the NOTICE file.
- Redistribution must pass on the license and, when a NOTICE file exists, the sentence “Licensed by NVIDIA Corporation under the NVIDIA Nemotron Model License.” That sentence really does omit the word “Open”. The agent copied it as printed.
- The license ends if the user files patent or copyright litigation alleging that the Work or an output from it infringes.

The closing message in the chat added a summary table. One cell says the license ends “if you sue NVIDIA (or others).” The file is the accurate statement. The table is a looser paraphrase: the trigger is litigation that claims the Work or its output infringes, and the entity sued can be anyone, not NVIDIA in particular.

This is the cleanest tool path in the test. Search results were treated as leads. The page was opened. The file was written from that page. The system prompt’s citation rule was followed.

## Task 3 — energy CSV (MiniMax)

The prompt included the nine-row table and, because task 1 had already spent so long hunting for Python, a hint: use `Python313\python.exe` through `Start-Process` and `cmd.exe`, and do not search the whole disk.

It loaded the `data-analysis` skill, wrote `energy.csv` exactly as given, wrote `scratch/analyze_energy.py`, and ran it through `scratch/run.cmd`. It then edited the script several times and ran a verify script and a fix script. The API restart cut the task off before the closing message, so the product shows **Failed** and the timeline ends with the restart sentence. `report.md` was already complete. Files panel: 11 files. Footer: 444K tokens.

Checked figures in `report.md`:

| Region | Months kept | kWh | INR | Rate |
| --- | --- | ---: | ---: | --- |
| Pune | Jan, Feb, Mar | 37,370 | 336,330 | 9.00 |
| Chennai | Jan, Mar (Feb left out) | 20,040 | 180,360 | 9.00 |
| Delhi | Jan, Feb, Mar | 46,700 | 420,300 | 9.00 |
| All kept rows | 8 | 104,110 | 936,990 | 9.00 |

Every positive row is an exact multiple of 9. Chennai / Feb (0 kWh, 0 INR) is the flagged row. The report says a rate is undefined there, that the row still “passes” a tariff check because 0×9 = 0, and that Chennai’s totals cover two months so they are not comparable with Pune and Delhi. Section 4 quotes the script stdout, including a line-by-line parse of all nine rows.

The arithmetic is exact. The sentence that a full month of exactly 0 kWh “cannot” be a real meter reading is stronger than the file can support: a shut site can read zero. The useful finding is the one the script supports: the row is a zero filled in, it hides from a rate check, and it should be left out of a three-month comparison.

Tool mix: `todo_write` 3, `skill` 1, `write` 8, `edit` 4, `pwsh` 9. It followed the hint and did not walk the disk. It still spent several calls on PowerShell quoting, then on re-running and splicing stdout into the report. 430,185 input tokens for a nine-row file.

## Task 4 — broken LMTD function (Nemotron 3 Ultra)

Started while the CSV task was already running, so this was a second runtime beside a live one. Initialize succeeded this time. The prompt included the same Python-path hint.

It did not load a skill. It wrote `lmtd.py` with `import math` added, tried several ways to run it (`python`, the call operator, `cmd.exe /c`, `Start-Process` with redirected stdout), read the output, and wrote `lmtd-result.md`.

`lmtd.py` is the original function plus `import math`. `output.txt` is `34.76`. `lmtd-result.md` is:

```
34.76

The function failed because it used `math.log` without importing the `math` module.
```

That is the right bug and the right number. An empty `error.txt` is left beside the deliverable, from a run that produced no stderr. The product still shows the task as **Failed**, for the same restart as task 3, at the same second. The work itself had finished.

Seven PowerShell calls to run one print statement is the same shell problem as task 1, compressed by the hint. 153,504 input tokens, 1,305 output.

## Task 5 — slip, and do not use tools (MiniMax)

The prompt forbade files, web search, commands, and skills. The task completed in **13 seconds**. The timeline is the prompt, queued, running, one assistant message, completed. No tool call. No file. Footer shows 9.3K tokens.

Answer:

```
Slip % = (N_s − N_r) / N_s × 100 = (1500 − 1470) / 1500 × 100, where N_s = 120f/P = 120 × 50 / 4 = 1500 rpm

2.00 %
```

That is correct. When the instruction is to answer and stop, MiniMax M3.1 Flash does stop. The 9,119 input tokens on a one-line question are the standing cost of the Work AI prompt: persona, tool schemas, and the skill catalog, sent even when nothing is called.

## What the two models did differently

**Nemotron 3 Ultra** took a short, ordered path on the research task: one skill, one search, one fetch, one write, then stop. On the code repair it also stopped once the number was on disk. It is slow to first token. The license task sat on an open connection to the model host for most of its 10 minutes, and the four turns still cost about 101K input tokens because the tool list and the fetched page come back on the next call. Output was tight (918 and 1,305 tokens).

**Minimax M3.1 Flash** is willing to keep going until the check passes. That produced a second arithmetic cross-check and a `scratch/` folder on the motor task, and a verify script on the CSV. It also produced the token blow-up: 490K and 430K input on the two file tasks, against 101K and 154K for Ultra’s two tasks. When told not to use tools, it answered in one turn and was right.

Both models, given a shell where `python` and `cmd` are absent and piping `python.exe` is rejected, eventually reached `Start-Process` and `C:\Windows\System32\cmd.exe`. Neither tried to install Python, and neither used the network after being told not to. Neither hit an approval, because web search and file writes are allowed and they never issued a delete or a networked shell command. The risky-action gate was not exercised.

## Failures that are in the product, not in the answers

1. **Two runtimes starting together can miss the 60-second initialize limit.** Task 1a died with an empty error and no model call. The same MiniMax model, started alone a few minutes later, finished a full task. A one-line task started alone finished in 13 seconds, so the deadline is enough when the machine is quiet. The failure message does not include the runtime’s stderr, because the process was still alive and had not written any.

2. **An API restart fails tasks that have already written the right files.** `recover()` in `apps/api/src/services/work.ts` marks every running task failed and tells the person to send a message to continue. It does not look at the folder. Tasks 3 and 4 are red in the sidebar, with a Failed pill, while `report.md` and `lmtd-result.md` are done and correct. The tokens already spent (444K and 155K) stay on the task.

3. **The Windows dev shell is a poor place to run Python.** PATH inside the runtime does not include `python` or `cmd`. PowerShell refuses to pipeline the real `python.exe` (“Cannot run a document in the middle of a pipeline”). The agent can recover, and the recovery is a long loop of failed commands that the model has to read back. On a production host with isolation on, the search of the signed-in user’s `AppData` would not be available at all, and these tasks would stop at “python is not installed” unless the image provides it.

4. **Input tokens scale with retries, not with the size of the question.** The skill body, the tool schemas, and every failed command are re-sent. A four-number motor calculation cost about fifty times the tokens of the one-line slip question.

## UI notes from watching the task page

- While a task runs, the composer says “Add to the task while it works…” and offers Stop.
- After it finishes, the composer says “Ask for changes or a next step…”
- Tool rows are readable: “Used skill web-research”, “Searched the web …”, “Opened https://…”, “Wrote nemotron-license.md”, “Ran …”.
- Files shows a count (1 on the license task, 11 on the CSV task).
- Failed tasks stay in the list with a red mark. The restart sentence is at the bottom of the timeline, after the last command.
- The token total in the footer matches the API (101.6K on the license task, 9.3K on the slip task, 444K on the CSV task).

## Task links on this server

| Task | Id |
| --- | --- |
| Motor, runtime failed | `748c84d6-b7f3-4636-af3a-f84e38b1e5af` |
| License brief | `e7425890-749b-49b2-b1ee-b1ea77400257` |
| Motor, completed | `018a2925-dd64-48da-85ef-5e0803c5ba56` |
| Energy CSV | `4645cb6d-2fdc-446e-ba7f-16106a49f1b6` |
| LMTD fix | `7b515f39-86ad-4cec-908c-1644c679b99e` |
| Slip, no tools | `c50d8d40-93f7-4e41-b3b3-3b42c9b6b440` |

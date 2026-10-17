# Open-source software and AI models in Aatmiq

> **Draft for legal review.** Facts are from the code as of this release; the obligations are our
> reading of each license, to be confirmed by counsel. Placeholders like [COMPANY] are in
> [README.md](README.md).

Aatmiq itself is proprietary software of [COMPANY], licensed under the [license agreement](EULA.md).
It is built on, ships with, or sets up the open-source software and models below. Nothing here
limits the rights each component's own license gives you.

## Where the full license texts are

| Part | Full texts |
|---|---|
| The API image (`aatmiq-api`) | `/app/THIRD_PARTY_NOTICES.txt` (the API's npm packages); `/opt/dsh/THIRD_PARTY_NOTICES.txt` (the Work AI agent runtime); `/opt/aatmiq-code/THIRD_PARTY_NOTICES.txt` (Aatmiq Code); `/usr/share/doc/*/copyright` (Debian packages); each Python package's `*.dist-info` |
| The web image (`aatmiq-web`) | `/app/apps/web/public/third-party-notices.txt`, also served by every installation at `https://<your Aatmiq>/third-party-notices.txt` |
| The desktop app | `LICENSE.electron.txt` and `LICENSES.chromium.html` next to the app (Electron and Chromium) |
| Every release and the offline bundle | this folder (`legal/`), including [third-party/npm-packages.md](third-party/npm-packages.md), the list of every npm package with its version and license |

The npm lists and texts are generated from the actual dependencies by
`scripts/third-party-notices.mjs`; CI fails when the list is out of date or a package's license
isn't one we've accepted.

## What we ship, by license family

| | Count | Licenses | What it asks of us |
|---|---|---|---|
| npm packages (API, web app, desktop) | 556 | MIT 464, Apache-2.0 41, ISC 24, BSD 14, and a few others | Keep the copyright notices and license texts with the software: done in the notices files above |
| npm packages (Work AI agent runtime) | 535 | Mostly MIT and Apache-2.0 | Same |
| npm packages (Aatmiq Code) | 113 | Mostly MIT | Same, plus Code-OSS's own MIT license (in its notices file) |

Components that need more than a notice:

| Component | Where | License | What we do |
|---|---|---|---|
| libvips (via sharp, for images in the web app and the agent runtime) | `@img/sharp-libvips-*` | LGPL-3.0-or-later | Used unmodified as a separate shared library that can be replaced; the LGPL and GPL texts are in the notices; source: <https://github.com/libvips/libvips> and the written offer below |
| LibreOffice kit (document conversion in the agent runtime) | `@deepseek-ai/libreoffice-kit(-wasm)` | MPL-2.0 | Unmodified; the MPL text is in the notices; source: <https://github.com/deepseek-ai/dsh-libreoffice-kit> |
| JSZip | API | MIT or GPL-3.0-or-later | Used under MIT |
| caniuse-lite (browser data in the web app's build) | web | CC-BY-4.0 | Attribution in the notices |

## Inside the API image

Debian 12 ("bookworm") with Node.js 22, plus:

| | License | Notes |
|---|---|---|
| Node.js | MIT and others | <https://github.com/nodejs/node/blob/main/LICENSE> |
| Chromium (the Work AI browser) | BSD-3-Clause and many others | Debian's package; licenses in the image |
| git, bash, iptables, coreutils and other system tools | GPL-2.0 / GPL-3.0 (and others) | Debian's packages, unmodified, run as separate programs; see the written offer |
| curl, jq, zip, unzip, openssh-client, libnss-wrapper, file, procps | curl, MIT, Info-ZIP, BSD, BSD-3-Clause, BSD-2-Clause, GPL/LGPL | Debian's packages |
| Python 3 and pandas, openpyxl, matplotlib, python-docx, python-pptx, reportlab, pypdf, lxml, PyYAML | PSF-2.0; BSD-3-Clause, MIT, Matplotlib (PSF-based), MIT, MIT, BSD-3-Clause, BSD-3-Clause, BSD-3-Clause, MIT | For the agent's helper scripts |
| yt-dlp (lesson videos without a YouTube key) | Unlicense (public domain) | Installed with pip without its optional extras, run as a separate program; <https://github.com/yt-dlp/yt-dlp>. The way it's used follows Agent-Reach (MIT), whose code isn't included |
| Docker CLI (container mode) | Apache-2.0 | Static binary from docker.com |
| DeepSeek Harness (the Work AI agent runtime) | MIT | <https://github.com/deepseek-ai> |
| OpenVSCode Server / Code-OSS (Aatmiq Code) | MIT | Visual Studio Code is a Microsoft product; Aatmiq Code isn't, and uses the Open VSX registry |
| Fonts Liberation, Noto Color Emoji | OFL-1.1 | For the browser and documents the agent makes |

## Inside the web image

Alpine Linux with Node.js 22 (musl: MIT; BusyBox: GPL-2.0, unmodified), and the web app's npm
packages, among them the fonts Inter, Newsreader, Geist Mono and Noto Sans Devanagari (all
OFL-1.1).

The app logos on the connector pages come from [Simple Icons](https://simpleicons.org) (CC0-1.0),
copied into `apps/web/src/lib/brand-icons.ts` by `scripts/brand-icons.mjs`. The logos are
trademarks of their owners and are shown only to name the app a connector talks to; no
endorsement is implied. Apps Simple Icons doesn't carry are shown by their initial.

## Services Compose runs next to Aatmiq

These come from their publishers' registries: your server downloads them directly, so we don't
distribute them, except inside the **offline bundle**, which carries the images as they are.

| Image | License | Notes |
|---|---|---|
| PostgreSQL with pgvector (`pgvector/pgvector`) | PostgreSQL License | |
| Valkey (`valkey/valkey`) | BSD-3-Clause | Optional job queue |
| Caddy (`caddy`) | Apache-2.0 | HTTPS |
| Ollama (`ollama/ollama`) | MIT | Model server |
| vLLM (`vllm/vllm-openai`) | Apache-2.0 | Model server (its image also contains CUDA libraries under NVIDIA's CUDA license) |
| SearXNG (`searxng/searxng`) | **AGPL-3.0** | Private web search. Run unmodified as a separate service. Its source: <https://github.com/searxng/searxng> |
| MinIO (`cgr.dev/chainguard/minio`, optional) | **AGPL-3.0** | Only with the bundled storage profile. Unmodified. Source: <https://github.com/minio/minio> |

The AGPL lets you use and share these freely; its extra condition (offering your changes to the
people who use the service over a network) only applies to modified versions, and we don't modify
them. When the offline bundle passes them on, it includes this file and the AGPL text, and the
written offer below covers their source.

## AI models

The model servers download the models from Hugging Face or the Ollama library when they first
start; the offline bundle carries them with their license files.

| Model | Used in | License |
|---|---|---|
| Qwen3.6-35B-A3B | `qwen-nemotron`, `gemma-qwen` lineups | Apache-2.0 |
| Nemotron 3 Nano 4B, Nano 30B A3B, Super 120B A12B | `qwen-nemotron`, `nemotron`, `nemotron-super` lineups | NVIDIA Nemotron Open Model License |
| Gemma 4 E2B | `gemma-qwen` lineup | Apache-2.0 |
| EmbeddingGemma 2 (`embeddinggemma-2:270m`, the default for document search) | all lineups | Apache-2.0 |
| EmbeddingGemma (version 1), only if `EMBEDDING_MODEL=embeddinggemma` is set for an older GPU driver | optional | **Gemma Terms of Use** (<https://ai.google.dev/gemma/terms>), with Google's prohibited use policy |

Required notice for the Nemotron models: **"Licensed by NVIDIA Corporation under the NVIDIA
Nemotron Open Model License."** NVIDIA claims no rights to the models' outputs. NVIDIA's names
and marks are used only to say where the models come from.

What the models write is the customer's (see the license agreement); the model licenses don't
claim it. Each customer's use of the models has to follow those licenses and their acceptable-use
terms; the license agreement passes them on.

## Written offer for source code

For three years from when we last distributed a release, [COMPANY] will give anyone who asks a
copy of the complete corresponding source code of the GPL, LGPL, MPL and AGPL components in that
release's images and offline bundle, on a medium customarily used for software exchange, for no
more than the cost of making and sending it. Write to [LEGAL EMAIL] with the release version.
Most of it is also available from the projects named above and from Debian
(<https://sources.debian.org>, <https://snapshot.debian.org>).

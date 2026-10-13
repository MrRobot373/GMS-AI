# Aatmiq: what hardware you need

Aatmiq runs on one server in your office or data center. What decides the size is the GPU: it runs
the models that write the answers. Everything else (the app, its database, the editors) is light.

**How sure we are**: the memory figures for Aatmiq itself are measured (a 25-person load test). The
GPU figures are calculated from the models' sizes and the model servers' behavior, and will be
replaced by measurements on a real RTX A6000 (the first customer setup). Ask us before buying for
more than 25 people.

## By team size

| People | GPU (NVIDIA) | CPU | Memory (system) | Disk | Models | |
|---|---|---|---|---|---|---|
| Up to 25 | one 48 GB: RTX A6000, RTX 6000 Ada, L40S | 8–16 cores | 32–64 GB | 500 GB SSD | Nemotron 3 Nano 4B (quick answers) and Qwen3.6 35B, or Nemotron 3 Nano 4B and Nano 30B | the standard setup |
| Up to 25, hardest work too | one 48 GB, plus two more 48 GB (or one 96 GB) | 16 cores | 64 GB | 1 TB SSD | as above, plus Nemotron 3 Super 120B for the hardest requests | |
| 25–50 | two 48 GB, or one 80–96 GB (H100, RTX PRO 6000) | 16–32 cores | 64–128 GB | 1 TB SSD | the standard setup, with the main model on both GPUs | plan it with us |
| More than 50 | several GPU servers | | | | | plan it with us |

Plus, for every size: **another disk or a network share for backups** (at least the size of your
data, times the 14 backups kept), and an address for the server in your network.

## What uses what

| Part | Memory | Measured? |
|---|---|---|
| Aatmiq and its database | about 2 GB | yes |
| Each person with the Code editor open | about 350 MB | yes |
| Each Work AI task kept ready | about 150 MB, plus what its commands use | yes |
| The operating system | 2–4 GB | |
| 25 people, all with the editor open, 16 tasks ready | about 13 GB in all | yes |

| On the GPU (48 GB) | Share | Measured? |
|---|---|---|
| Qwen3.6 35B, 4-bit, with room for several hundred thousand tokens of conversation | 68% | calculated |
| Nemotron 3 Nano 4B with its conversations | about 6 GB | calculated |
| EmbeddingGemma 2 (document search) | about 1 GB | calculated |

| On the disk | Size |
|---|---|
| The models | 30–40 GB (130 GB with Nemotron 3 Super) |
| Aatmiq's and the model servers' images | about 15 GB |
| Your data: documents, Work AI task folders, chats | depends on use; plan for a few GB per person per year |

## The rest

| | |
|---|---|
| System | Ubuntu 22.04 or 24.04; NVIDIA driver 580 or newer; Docker Engine with Compose; the NVIDIA Container Toolkit |
| Network | Only inside your network is fine. Internet is needed to download the models and updates, or use the offline bundle |
| People's computers | A current browser (Chrome, Edge, Firefox, Safari); the desktop editor runs on Windows 10 or 11, a recent macOS (Apple silicon or Intel) and Linux (.deb or AppImage) |

How speed feels: answers should start within 2 seconds and Work AI tasks wait less than 5 minutes
for a slot at the busiest time. Admin → Health shows the queue; if it's often long, the GPU is the
limit ([10-team-server.md#capacity](../10-team-server.md#capacity) explains how to measure it).

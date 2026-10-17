# Screenshots, 16 October 2026

Every page of GEM AI (the Aatmiq engine with Learning, Calculators and Knowledge), in light and dark mode,
taken from a local server running the `claude/nice-ramanujan-g0v3oi` branch with real models from
Ollama Cloud: GPT-OSS 20B and 120B, Nemotron 3 Nano 30B, Super and Ultra, Gemma 4 31B and Beam. No demo
model. The answers, lessons, agent tasks and knowledge answers shown were written by those models.

- `light/` and `dark/` hold the same pages under the same names.
- Long pages are captured whole. The IDE keeps its own (dark) theme.
- Not configured on this server, so not shown working: lesson videos (no YouTube Data API key) and meaning
  search (Ollama Cloud has no embedding model, so documents are searched by keywords).

## Signed out

| Page | Light | Dark |
|---|---|---|
| Public site (company profile) | [00-landing](light/00-landing.png) | [dark](dark/00-landing.png) |
| Sign in | [01-sign-in](light/01-sign-in.png) | [dark](dark/01-sign-in.png) |
| Forgot password | [02-forgot-password](light/02-forgot-password.png) | [dark](dark/02-forgot-password.png) |
| Reset password (link from email) | [03-reset-password](light/03-reset-password.png) | [dark](dark/03-reset-password.png) |
| First-run setup (redirects to sign-in once the server is set up) | [04-setup](light/04-setup.png) | [dark](dark/04-setup.png) |
| Accepting an invitation | [05-invitation](light/05-invitation.png) | [dark](dark/05-invitation.png) |
| Page not found | [06-page-not-found](light/06-page-not-found.png) | [dark](dark/06-page-not-found.png) |

## Chat

| Page | Light | Dark |
|---|---|---|
| New chat, with Auto and the seven models | [11-chat-new](light/11-chat-new.png) | [dark](dark/11-chat-new.png) |
| Model picker: Auto plus GPT-OSS 20B/120B, Nemotron 3 Nano/Super/Ultra, Gemma 4 31B, Beam | [12-chat-model-picker](light/12-chat-model-picker.png) | [dark](dark/12-chat-model-picker.png) |
| Hard question → Auto picked Nemotron 3 Super (advanced, thinking); equations rendered | [13-chat-maths-advanced-model](light/13-chat-maths-advanced-model.png) | [dark](dark/13-chat-maths-advanced-model.png) |
| Gemma 4 31B reading an uploaded nameplate image, with a source chip | [14-chat-vision-image](light/14-chat-vision-image.png) | [dark](dark/14-chat-vision-image.png) |
| Edited question as a second branch (2/2), maths rendered | [15-chat-edit-and-branch](light/15-chat-edit-and-branch.png) | [dark](dark/15-chat-edit-and-branch.png) |
| Calculator tool in chat: LED resistor 150 Ω computed by tested code, then explained | [15b-chat-calculator-led](light/15b-chat-calculator-led.png) | [dark](dark/15b-chat-calculator-led.png) |
| Calculator tool in chat: torque 49.74 N·m from 7.5 kW and 1440 rpm | [16-chat-calculator-torque](light/16-chat-calculator-torque.png) | [dark](dark/16-chat-calculator-torque.png) |
| Answer from an attached spec with a numbered citation | [17-chat-document-citations](light/17-chat-document-citations.png) | [dark](dark/17-chat-document-citations.png) |
| Print view (Save as PDF) | [18-chat-print-pdf](light/18-chat-print-pdf.png) | [dark](dark/18-chat-print-pdf.png) |
| Admin: providers and models (Ollama Cloud, 14 keys, the seven models and their Auto tiers) | [100-admin-models](light/100-admin-models.png) | [dark](dark/100-admin-models.png) |
| Admin: token requests | [101-admin-token-requests](light/101-admin-token-requests.png) | [dark](dark/101-admin-token-requests.png) |
| Admin: usage by model and section | [102-admin-usage](light/102-admin-usage.png) | [dark](dark/102-admin-usage.png) |
| Admin: audit log | [103-admin-audit-log](light/103-admin-audit-log.png) | [dark](dark/103-admin-audit-log.png) |
| Admin: health | [104-admin-health](light/104-admin-health.png) | [dark](dark/104-admin-health.png) |
| Admin: settings, including GEM AI modules, beta calculators, limits and the YouTube key | [105-admin-settings-gem-modules](light/105-admin-settings-gem-modules.png) | [dark](dark/105-admin-settings-gem-modules.png) |
| Admin: authentication (SSO, two-step) | [106-admin-authentication](light/106-admin-authentication.png) | [dark](dark/106-admin-authentication.png) |
| Admin: Work AI policy | [107-admin-work-ai](light/107-admin-work-ai.png) | [dark](dark/107-admin-work-ai.png) |
| Admin: license | [108-admin-license](light/108-admin-license.png) | [dark](dark/108-admin-license.png) |

## Projects and documents

| Page | Light | Dark |
|---|---|---|
| Projects | [20-projects](light/20-projects.png) | [dark](dark/20-projects.png) |
| A project: instructions, sources, chats, tasks | [21-project-motor-drive](light/21-project-motor-drive.png) | [dark](dark/21-project-motor-drive.png) |
| Chat inside a project, following its instructions and sources | [22-project-chat](light/22-project-chat.png) | [dark](dark/22-project-chat.png) |
| The Knowledge test project with three reports | [23-project-inverter](light/23-project-inverter.png) | [dark](dark/23-project-inverter.png) |
| Document library | [24-documents](light/24-documents.png) | [dark](dark/24-documents.png) |

## Work AI

| Page | Light | Dark |
|---|---|---|
| Work AI home | [30-work-ai](light/30-work-ai.png) | [dark](dark/30-work-ai.png) |
| Agent task: wrote calc.py, ran it, saved result.txt (19.20 V at D = 0.4) | [31-work-task-python](light/31-work-task-python.png) | [dark](dark/31-work-task-python.png) |
| Agent task in a project: datasheet.md from the project spec | [32-work-task-project-datasheet](light/32-work-task-project-datasheet.png) | [dark](dark/32-work-task-project-datasheet.png) |
| Work AI connections (apps) | [33-work-connections](light/33-work-connections.png) | [dark](dark/33-work-connections.png) |
| Scheduled tasks | [34-work-schedules](light/34-work-schedules.png) | [dark](dark/34-work-schedules.png) |
| Skills | [35-work-skills](light/35-work-skills.png) | [dark](dark/35-work-skills.png) |

## Code

| Page | Light | Dark |
|---|---|---|
| Code home | [40-code](light/40-code.png) | [dark](dark/40-code.png) |
| A code workspace | [41-code-workspace](light/41-code-workspace.png) | [dark](dark/41-code-workspace.png) |
| The IDE (Code-OSS) with the coding-agent panel (the IDE keeps its own theme) | [42-code-ide](light/42-code-ide.png) | [dark](dark/42-code-ide.png) |
| The coding agent in the IDE: wrote rc.py, ran it, answered τ = 1 ms and f_c ≈ 159.15 Hz | [43-code-agent-task](light/43-code-agent-task.png) | [dark](dark/43-code-agent-task.png) |

## Learning

| Page | Light | Dark |
|---|---|---|
| Learning library | [50-learning-library](light/50-learning-library.png) | [dark](dark/50-learning-library.png) |
| New course dialog | [51-learning-new-course](light/51-learning-new-course.png) | [dark](dark/51-learning-new-course.png) |
| A lesson written by a real model: objectives, theory, equations with 'Applies when', worked example, diagrams to find, mistakes, references, takeaways | [52-learning-course-lesson-1](light/52-learning-course-lesson-1.png) | [dark](dark/52-learning-course-lesson-1.png) |
| Lesson 2 (CCM/DCM boundaries) | [53-learning-lesson-equations](light/53-learning-lesson-equations.png) | [dark](dark/53-learning-lesson-equations.png) |
| Bookmarks | [54-learning-bookmarks](light/54-learning-bookmarks.png) | [dark](dark/54-learning-bookmarks.png) |

## Calculators

| Page | Light | Dark |
|---|---|---|
| Calculators home: 20 verified engineering calculators, keypads and tools | [60-calculators](light/60-calculators.png) | [dark](dark/60-calculators.png) |
| Ohm's law with a result (48 Ω, 3 W) | [61-calc-ohms-law](light/61-calc-ohms-law.png) | [dark](dark/61-calc-ohms-law.png) |
| Ideal buck with a result (19.2 V) and its assumptions | [62-calc-buck-ideal](light/62-calc-buck-ideal.png) | [dark](dark/62-calc-buck-ideal.png) |
| Three-phase balanced power | [63-calc-three-phase-power](light/63-calc-three-phase-power.png) | [dark](dark/63-calc-three-phase-power.png) |
| Basic keypad | [64-calc-basic](light/64-calc-basic.png) | [dark](dark/64-calc-basic.png) |
| Scientific (Casio-style) keypad with a session history | [65-calc-scientific](light/65-calc-scientific.png) | [dark](dark/65-calc-scientific.png) |
| Unit converter | [66-calc-unit-converter](light/66-calc-unit-converter.png) | [dark](dark/66-calc-unit-converter.png) |
| Polynomial equation solver | [67-calc-equation-solver](light/67-calc-equation-solver.png) | [dark](dark/67-calc-equation-solver.png) |
| System of linear equations | [68-calc-linear-system](light/68-calc-linear-system.png) | [dark](dark/68-calc-linear-system.png) |
| Matrix calculator | [69-calc-matrix](light/69-calc-matrix.png) | [dark](dark/69-calc-matrix.png) |
| Calculus (derivative, integral, limit, Taylor, sum, tangent) | [70-calc-calculus](light/70-calc-calculus.png) | [dark](dark/70-calc-calculus.png) |
| Statistics and regression | [71-calc-statistics](light/71-calc-statistics.png) | [dark](dark/71-calc-statistics.png) |
| Probability distributions | [72-calc-distributions](light/72-calc-distributions.png) | [dark](dark/72-calc-distributions.png) |
| Number bases and bitwise | [73-calc-number-bases](light/73-calc-number-bases.png) | [dark](dark/73-calc-number-bases.png) |
| IPv4 subnet | [74-calc-subnet](light/74-calc-subnet.png) | [dark](dark/74-calc-subnet.png) |
| Resistor colour codes | [75-calc-resistor-colours](light/75-calc-resistor-colours.png) | [dark](dark/75-calc-resistor-colours.png) |
| Molar mass | [76-calc-molar-mass](light/76-calc-molar-mass.png) | [dark](dark/76-calc-molar-mass.png) |
| Loan / EMI with schedule | [77-calc-loan-emi](light/77-calc-loan-emi.png) | [dark](dark/77-calc-loan-emi.png) |
| Dates and times | [78-calc-dates](light/78-calc-dates.png) | [dark](dark/78-calc-dates.png) |
| Physical and mathematical constants | [79-calc-constants](light/79-calc-constants.png) | [dark](dark/79-calc-constants.png) |
| Calculation history (includes results from chat) | [80-calc-history](light/80-calc-history.png) | [dark](dark/80-calc-history.png) |

## Knowledge

| Page | Light | Dark |
|---|---|---|
| Knowledge answer citing the right report, version and passage | [81-knowledge-answer](light/81-knowledge-answer.png) | [dark](dark/81-knowledge-answer.png) |
| Knowledge says when the documents don't contain the answer | [82-knowledge-not-in-documents](light/82-knowledge-not-in-documents.png) | [dark](dark/82-knowledge-not-in-documents.png) |
| A project's sources: status, versions, passages | [83-knowledge-sources](light/83-knowledge-sources.png) | [dark](dark/83-knowledge-sources.png) |
| Question history | [84-knowledge-history](light/84-knowledge-history.png) | [dark](dark/84-knowledge-history.png) |
| General engineering references | [85-knowledge-general-references](light/85-knowledge-general-references.png) | [dark](dark/85-knowledge-general-references.png) |

## Settings

| Page | Light | Dark |
|---|---|---|
| Settings: profile | [86-settings-profile](light/86-settings-profile.png) | [dark](dark/86-settings-profile.png) |
| Settings: security | [87-settings-security](light/87-settings-security.png) | [dark](dark/87-settings-security.png) |
| Settings: appearance (theme, language) | [88-settings-appearance](light/88-settings-appearance.png) | [dark](dark/88-settings-appearance.png) |
| Settings: my usage | [89-settings-usage](light/89-settings-usage.png) | [dark](dark/89-settings-usage.png) |
| Settings: archived chats | [90-settings-archived-chats](light/90-settings-archived-chats.png) | [dark](dark/90-settings-archived-chats.png) |
| Settings: download or delete your data | [91-settings-your-data](light/91-settings-your-data.png) | [dark](dark/91-settings-your-data.png) |

## Admin

| Page | Light | Dark |
|---|---|---|
| Admin overview | [92-admin-overview](light/92-admin-overview.png) | [dark](dark/92-admin-overview.png) |
| Admin: users (with a pending invitation) | [93-admin-users](light/93-admin-users.png) | [dark](dark/93-admin-users.png) |
| Admin: groups | [94-admin-groups](light/94-admin-groups.png) | [dark](dark/94-admin-groups.png) |
| Admin: workspaces | [95-admin-workspaces](light/95-admin-workspaces.png) | [dark](dark/95-admin-workspaces.png) |
| Workspace members and their sections (Chat, Work, Code, Learning, Calculators, Knowledge) | [96-admin-workspace-members](light/96-admin-workspace-members.png) | [dark](dark/96-admin-workspace-members.png) |
| Workspace models | [97-admin-workspace-models](light/97-admin-workspace-models.png) | [dark](dark/97-admin-workspace-models.png) |
| Workspace budget | [98-admin-workspace-budget](light/98-admin-workspace-budget.png) | [dark](dark/98-admin-workspace-budget.png) |
| Workspace settings | [99-admin-workspace-settings](light/99-admin-workspace-settings.png) | [dark](dark/99-admin-workspace-settings.png) |
| Admin: providers and models (Ollama Cloud, 14 keys, the seven models and their Auto tiers) | [100-admin-models](light/100-admin-models.png) | [dark](dark/100-admin-models.png) |
| Admin: token requests | [101-admin-token-requests](light/101-admin-token-requests.png) | [dark](dark/101-admin-token-requests.png) |
| Admin: usage by model and section | [102-admin-usage](light/102-admin-usage.png) | [dark](dark/102-admin-usage.png) |
| Admin: audit log | [103-admin-audit-log](light/103-admin-audit-log.png) | [dark](dark/103-admin-audit-log.png) |
| Admin: health | [104-admin-health](light/104-admin-health.png) | [dark](dark/104-admin-health.png) |
| Admin: settings, including GEM AI modules, beta calculators, limits and the YouTube key | [105-admin-settings-gem-modules](light/105-admin-settings-gem-modules.png) | [dark](dark/105-admin-settings-gem-modules.png) |
| Admin: authentication (SSO, two-step) | [106-admin-authentication](light/106-admin-authentication.png) | [dark](dark/106-admin-authentication.png) |
| Admin: Work AI policy | [107-admin-work-ai](light/107-admin-work-ai.png) | [dark](dark/107-admin-work-ai.png) |
| Admin: license | [108-admin-license](light/108-admin-license.png) | [dark](dark/108-admin-license.png) |


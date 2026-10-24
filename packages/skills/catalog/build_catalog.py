#!/usr/bin/env python3
"""Write the organizational skill catalog consumed by skill-router.

Source of truth for the 195 blueprint rows. Installed folders that are not a row
and not a current router are recorded as retainedLibrary so routing does not drop them.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIBRARY = ROOT / "library"
OUT = LIBRARY / "skill-router" / "references" / "catalog.json"

# name, priority, phase, group, purpose, status, installed_as, covered_by
ROWS: list[tuple[str, str, int, str, str, str, str, str]] = [
    # 5A platform
    ("skill-router", "P0", 0, "platform", "Select the smallest correct skill set for a request", "installed", "skill-router", ""),
    ("skill-authoring", "P0", 0, "platform", "Create or revise skill packages", "installed", "skill-authoring", ""),
    ("skill-registry-admin", "P0", 0, "platform", "Publish, enable, disable, version, and retire skills", "installed", "skill-registry-admin", ""),
    ("template-library", "P0", 0, "platform", "Find and apply approved organization templates", "installed", "template-library", ""),
    ("artifact-quality-control", "P0", 0, "platform", "Validate generated Office, PDF, image, code, and data artifacts", "installed", "artifact-quality-control", ""),
    ("permission-and-approval-planner", "P0", 0, "platform", "Decide what can run automatically and what needs approval", "installed", "permission-and-approval-planner", ""),
    ("evidence-and-provenance", "P0", 0, "platform", "Attach sources and evidence to claims and outputs", "installed", "evidence-and-provenance", ""),
    ("task-planning", "P0", 0, "platform", "Turn a goal into executable steps and acceptance criteria", "proposed", "", ""),
    ("workflow-orchestration", "P0", 0, "platform", "Coordinate multiple tools, skills, and long-running jobs", "installed", "workflow-orchestration", ""),
    ("organizational-memory", "P0", 0, "platform", "Retrieve and update approved long-term organizational context", "proposed", "", ""),
    ("audit-log-and-reporting", "P0", 0, "platform", "Explain what the agent did and why", "installed", "audit-log-and-reporting", ""),
    ("cost-and-budget-control", "P1", 0, "platform", "Estimate and control model, connector, and compute cost", "proposed", "", ""),
    ("schedule-and-monitor", "P1", 0, "platform", "Run recurring reports, checks, and reminders", "proposed", "", ""),
    ("human-review-workflow", "P1", 0, "platform", "Route specialist or manager review", "proposed", "", ""),
    ("policy-as-code", "P1", 0, "platform", "Convert organization policy into enforceable checks", "proposed", "", ""),
    # 5B spreadsheets
    ("spreadsheet-core", "P0", 1, "spreadsheets", "Create, read, edit, and verify workbook files", "routed", "", "excel-spreadsheets"),
    ("spreadsheet-template-fill", "P0", 1, "spreadsheets", "Populate an existing organizational workbook", "routed", "", "excel-spreadsheets"),
    ("spreadsheet-data-cleaning", "P0", 1, "spreadsheets", "Repair messy or inconsistent sheets", "routed", "", "data-cleaning"),
    ("spreadsheet-formula-audit", "P0", 1, "spreadsheets", "Check formulas and workbook logic", "routed", "", "excel-spreadsheets"),
    ("excel-financial-model", "P1", 1, "spreadsheets", "Build linked financial and business-planning models", "routed", "", "financial-analysis"),
    ("excel-project-tracker", "P1", 1, "spreadsheets", "Build milestones, status, weekly plans, and resource trackers", "routed", "", "excel-spreadsheets"),
    ("excel-dashboard", "P1", 1, "spreadsheets", "Create management dashboards in a workbook", "routed", "", "kpi-report"),
    ("excel-engineering-calculation", "P1", 1, "spreadsheets", "Build transparent engineering calculation sheets", "proposed", "", ""),
    ("spreadsheet-reconciliation", "P1", 1, "spreadsheets", "Reconcile two or more systems or periods", "proposed", "", ""),
    ("spreadsheet-automation", "P2", 1, "spreadsheets", "Create refresh or export automation where approved", "proposed", "", ""),
    ("excel-live-session", "P2", 1, "spreadsheets", "Operate an open workbook interactively", "proposed", "", ""),
    # 5C documents
    ("word-document-core", "P0", 1, "documents", "Create or edit professional Word documents", "routed", "", "word-documents"),
    ("word-template-fill", "P0", 1, "documents", "Populate approved Word templates", "routed", "", "word-documents"),
    ("word-redline-review", "P1", 1, "documents", "Compare, redline, comment, and reconcile Word documents", "proposed", "", ""),
    ("technical-report-authoring", "P1", 1, "documents", "Produce evidence-led technical reports", "routed", "", "report-writing"),
    ("pdf-core", "P0", 1, "documents", "Read, create, inspect, merge, split, rotate, and verify PDFs", "routed", "", "pdf-documents"),
    ("pdf-ocr-and-extraction", "P0", 1, "documents", "Extract information from scanned or mixed PDFs", "proposed", "", ""),
    ("pdf-forms", "P1", 1, "documents", "Read or fill PDF forms and generate completed packets", "proposed", "", ""),
    ("pdf-redaction-and-sanitization", "P1", 1, "documents", "Remove sensitive content from PDFs", "proposed", "", ""),
    ("presentation-core", "P0", 1, "documents", "Create and edit PowerPoint decks", "routed", "", "presentations"),
    ("presentation-template-derivation", "P1", 1, "documents", "Learn a reusable deck style from a reference", "proposed", "", ""),
    ("executive-presentation", "P1", 1, "documents", "Create concise management or board decks", "routed", "", "presentations"),
    ("technical-presentation", "P1", 1, "documents", "Create architecture, engineering, design-review, or training decks", "routed", "", "presentations"),
    ("document-conversion", "P1", 1, "documents", "Convert between document formats while preserving meaning", "proposed", "", ""),
    ("document-template-management", "P1", 1, "documents", "Create and govern reusable document templates", "proposed", "", ""),
    # 5D design
    ("ux-problem-framing", "P0", 2, "design", "Define user, job, context, constraints, and success before designing", "routed", "", "ui-ux-design"),
    ("user-research", "P1", 2, "design", "Plan interviews, surveys, observations, or usability studies", "proposed", "", ""),
    ("information-architecture", "P1", 2, "design", "Organize navigation, content, labels, and search", "routed", "", "ui-ux-design"),
    ("workflow-and-service-design", "P0", 2, "design", "Design multi-step business processes across people and systems", "proposed", "", ""),
    ("wireframe-and-prototype", "P0", 2, "design", "Produce low and high fidelity interaction prototypes", "routed", "", "ui-ux-design"),
    ("enterprise-ui-design", "P0", 2, "design", "Design dense admin, engineering, and operations interfaces", "routed", "", "ui-ux-design"),
    ("dashboard-ux", "P1", 2, "design", "Design monitoring and analytical dashboards", "proposed", "", ""),
    ("design-system", "P0", 2, "design", "Build and govern tokens, components, patterns, and documentation", "routed", "", "ui-ux-design"),
    ("accessibility-audit", "P0", 2, "design", "Audit against WCAG 2.2 AA and fix issues", "installed", "accessibility-audit", ""),
    ("responsive-and-mobile-ux", "P1", 2, "design", "Adapt flows across desktop, tablet, and phone", "proposed", "", ""),
    ("content-design", "P1", 2, "design", "Write labels, instructions, empty states, errors, and help", "proposed", "", ""),
    ("usability-evaluation", "P1", 2, "design", "Review or test an existing interface", "proposed", "", ""),
    ("visual-design-review", "P1", 2, "design", "Review hierarchy, spacing, typography, color, and brand consistency", "routed", "", "ui-ux-design"),
    ("hmi-industrial-ux", "P2", 2, "design", "Design control-room, lab, machine, or embedded interfaces", "proposed", "", ""),
    ("frontend-implementation-handoff", "P1", 2, "design", "Turn design into implementable requirements", "proposed", "", ""),
    # 5E delivery
    ("requirements-engineering", "P0", 1, "delivery", "Convert goals into testable functional and non-functional requirements", "routed", "", "product-management"),
    ("product-requirements-document", "P0", 1, "delivery", "Produce or revise a product requirements document", "routed", "", "product-management"),
    ("project-planning", "P0", 1, "delivery", "Build a project plan, work breakdown, milestones, and dependencies", "routed", "", "project-management"),
    ("weekly-status-report", "P0", 1, "delivery", "Create evidence-based weekly manager reports", "routed", "", "project-management"),
    ("raid-management", "P1", 1, "delivery", "Maintain risks, assumptions, issues, and dependencies", "routed", "", "project-management"),
    ("decision-record", "P1", 1, "delivery", "Produce decision memos and architecture decision records", "routed", "", "strategy-okrs"),
    ("roadmap-and-release-plan", "P1", 1, "delivery", "Build outcome-based product and release roadmaps", "routed", "", "product-management"),
    ("meeting-management", "P1", 1, "delivery", "Prepare agendas, minutes, actions, and follow-up", "routed", "", "meeting-notes"),
    ("sop-and-work-instruction", "P1", 1, "delivery", "Document repeatable processes", "routed", "", "sop-process-docs"),
    ("training-and-onboarding", "P1", 1, "delivery", "Create role-based learning paths and training material", "routed", "", "sop-process-docs"),
    ("knowledge-base-curation", "P1", 1, "delivery", "Organize policies, procedures, references, and FAQs", "proposed", "", ""),
    ("executive-briefing", "P1", 1, "delivery", "Convert detailed work into an executive decision packet", "routed", "", "report-writing"),
    # 5F software
    ("system-architecture", "P0", 2, "software", "Design a system or major capability", "routed", "", "system-design"),
    ("frontend-web-application", "P0", 2, "software", "Build accessible production web interfaces", "routed", "", "frontend-web-app"),
    ("react-typescript", "P1", 2, "software", "Implement typed React and Next.js components", "installed", "react-typescript", ""),
    ("mobile-application", "P1", 2, "software", "Build mobile clients", "routed", "", "mobile-app"),
    ("backend-api", "P0", 2, "software", "Build secure HTTP services", "installed", "backend-api", ""),
    ("graphql-api", "P1", 2, "software", "Design and operate GraphQL services", "proposed", "", ""),
    ("identity-and-access-management", "P0", 2, "software", "Implement sign-in, SSO, roles, and resource permissions", "proposed", "", ""),
    ("multi-tenant-architecture", "P0", 2, "software", "Keep organization, workspace, project, and customer data isolated", "proposed", "", ""),
    ("background-jobs-and-queues", "P1", 2, "software", "Build asynchronous and scheduled processing", "proposed", "", ""),
    ("cache-design", "P1", 2, "software", "Add safe application and data caching", "proposed", "", ""),
    ("object-storage", "P1", 2, "software", "Manage large files and binary artifacts", "proposed", "", ""),
    ("search-and-indexing", "P1", 2, "software", "Implement text, vector, or hybrid search", "proposed", "", ""),
    ("integration-connector", "P0", 2, "software", "Connect external SaaS or enterprise systems", "proposed", "", ""),
    ("event-and-webhook-design", "P1", 2, "software", "Design reliable event contracts", "proposed", "", ""),
    ("resilience-engineering", "P1", 2, "software", "Improve behavior during dependency or infrastructure failures", "proposed", "", ""),
    ("observability", "P0", 2, "software", "Add logs, metrics, traces, dashboards, and alerts", "proposed", "", ""),
    ("performance-engineering", "P1", 2, "software", "Profile and improve latency, throughput, or resource use", "routed", "", "performance-optimization"),
    ("software-testing", "P0", 2, "software", "Design unit, integration, contract, browser, and system tests", "installed", "software-testing", ""),
    ("debugging", "P0", 2, "software", "Reproduce, isolate, repair, and prevent defects", "installed", "debugging", ""),
    ("code-review", "P1", 2, "software", "Review diffs for correctness, security, and maintainability", "installed", "code-review", ""),
    ("refactoring", "P1", 2, "software", "Improve structure without changing behavior", "installed", "refactoring", ""),
    ("secure-coding-review", "P0", 2, "software", "Detect application security weaknesses", "routed", "", "security-review"),
    ("api-documentation", "P0", 2, "software", "Generate OpenAPI and human-readable API guides", "installed", "api-documentation", ""),
    # 5G data
    ("database-schema-design", "P0", 2, "data", "Design relational data structures", "installed", "database-schema-design", ""),
    ("database-migration", "P0", 2, "data", "Change schemas safely", "routed", "", "database-migrations"),
    ("sql-query-engineering", "P0", 2, "data", "Write and optimize SQL", "routed", "", "sql-queries"),
    ("database-operations", "P1", 2, "data", "Operate production databases", "proposed", "", ""),
    ("data-ingestion-etl", "P0", 2, "data", "Build batch or stream ingestion", "proposed", "", ""),
    ("data-quality", "P0", 2, "data", "Define and monitor data checks", "proposed", "", ""),
    ("data-cleaning", "P0", 2, "data", "Clean messy data reproducibly", "installed", "data-cleaning", ""),
    ("data-analysis", "P0", 2, "data", "Answer questions from structured data", "installed", "data-analysis", ""),
    ("statistical-analysis", "P1", 2, "data", "Perform statistical inference or experiment analysis", "proposed", "", ""),
    ("forecasting", "P1", 2, "data", "Build time-series or operational forecasts", "proposed", "", ""),
    ("business-intelligence", "P1", 2, "data", "Build semantic models and BI dashboards", "routed", "", "kpi-report"),
    ("chart-and-visualization", "P1", 2, "data", "Choose and produce truthful visualizations", "routed", "", "charts-visualization"),
    ("geospatial-analysis", "P1", 2, "data", "Analyze location and map data", "proposed", "", ""),
    ("master-data-management", "P1", 2, "data", "Manage canonical customers, vendors, products, assets, and codes", "proposed", "", ""),
    # 5H AI
    ("model-provider-integration", "P0", 3, "ai", "Add or update an LLM or embedding provider", "proposed", "", ""),
    ("model-routing", "P0", 3, "ai", "Select a model based on difficulty, policy, data, and cost", "proposed", "", ""),
    ("prompt-template-management", "P0", 3, "ai", "Create and version system and task prompts", "proposed", "", ""),
    ("rag-ingestion", "P0", 3, "ai", "Ingest documents for grounded retrieval", "proposed", "", ""),
    ("rag-retrieval", "P0", 3, "ai", "Retrieve and rank authorized evidence", "proposed", "", ""),
    ("grounded-answering", "P0", 3, "ai", "Answer only from permitted evidence", "proposed", "", ""),
    ("llm-evaluation", "P0", 0, "ai", "Create and run quality, safety, and evidence evaluations", "installed", "llm-evaluation", ""),
    ("agent-tool-design", "P0", 0, "ai", "Design safe tools for model use", "installed", "agent-tool-design", ""),
    ("agent-orchestration", "P0", 3, "ai", "Plan and execute multi-step tool workflows", "proposed", "", ""),
    ("agent-memory", "P1", 3, "ai", "Maintain useful short and long-term memory", "proposed", "", ""),
    ("prompt-injection-defense", "P0", 0, "ai", "Protect tool and retrieval workflows from hostile instructions", "installed", "prompt-injection-defense", ""),
    ("synthetic-test-data", "P1", 3, "ai", "Generate safe representative test and evaluation data", "proposed", "", ""),
    ("model-observability", "P1", 3, "ai", "Monitor AI quality, latency, cost, and failures", "proposed", "", ""),
    ("ai-incident-response", "P1", 3, "ai", "Diagnose wrong answers, leakage, tool errors, or runaway tasks", "proposed", "", ""),
    ("ai-governance", "P1", 3, "ai", "Govern approved models, uses, data classes, and reviews", "proposed", "", ""),
    # 5I operations
    ("git-workflow", "P0", 2, "operations", "Branch, commit, merge, rebase, tag, and recover safely", "installed", "git-workflow", ""),
    ("ci-cd-pipeline", "P0", 2, "operations", "Build test and deployment pipelines", "routed", "", "ci-cd-pipelines"),
    ("containerization", "P0", 2, "operations", "Build secure deterministic container images", "routed", "", "docker-deployment"),
    ("kubernetes-deployment", "P1", 2, "operations", "Deploy and operate workloads on Kubernetes", "proposed", "", ""),
    ("release-management", "P0", 2, "operations", "Prepare version, changelog, artifacts, and the release decision", "proposed", "", ""),
    ("backup-and-restore", "P0", 2, "operations", "Protect and restore databases, files, and secrets", "proposed", "", ""),
    ("incident-response", "P1", 2, "operations", "Coordinate operational incidents", "proposed", "", ""),
    ("capacity-and-load-testing", "P1", 2, "operations", "Measure behavior under expected and peak load", "proposed", "", ""),
    ("dependency-and-sbom", "P1", 2, "operations", "Manage third-party dependencies and provenance", "proposed", "", ""),
    ("secrets-and-key-management", "P0", 2, "operations", "Manage application credentials and signing keys", "proposed", "", ""),
    ("threat-modeling", "P0", 2, "operations", "Identify threats before implementation or release", "proposed", "", ""),
    ("privacy-engineering", "P1", 2, "operations", "Implement privacy requirements in systems", "proposed", "", ""),
    # 5J power electronics
    ("engineering-calculation-verification", "P0", 4, "power", "Independently verify engineering calculators and worksheets", "proposed", "", ""),
    ("electrical-circuit-analysis", "P0", 4, "power", "Analyze DC, AC, single-phase, and three-phase circuits", "proposed", "", ""),
    ("power-electronics-topology-selection", "P0", 4, "power", "Select converter, inverter, or rectifier topology", "proposed", "", ""),
    ("dc-dc-converter-design", "P0", 4, "power", "Design buck, boost, buck-boost, flyback, forward, LLC, or related converters", "proposed", "", ""),
    ("inverter-and-rectifier-design", "P0", 4, "power", "Design AC/DC or DC/AC stages", "proposed", "", ""),
    ("magnetics-design", "P0", 4, "power", "Design inductors, transformers, and coupled magnetics", "proposed", "", ""),
    ("semiconductor-selection", "P0", 4, "power", "Select MOSFET, IGBT, diode, SiC, or GaN devices", "proposed", "", ""),
    ("gate-driver-design", "P0", 4, "power", "Design isolated or non-isolated gate drive", "proposed", "", ""),
    ("capacitor-and-dc-link-design", "P0", 4, "power", "Size input, output, and DC-link capacitors", "proposed", "", ""),
    ("control-loop-design", "P0", 4, "power", "Design analog or digital converter control loops", "proposed", "", ""),
    ("motor-drive-design", "P1", 4, "power", "Analyze and design induction, PMSM, and BLDC drives", "proposed", "", ""),
    ("thermal-design-electronics", "P0", 4, "power", "Estimate junction, case, heatsink, and enclosure temperatures", "proposed", "", ""),
    ("emi-emc-design-review", "P1", 4, "power", "Review conducted and radiated emissions and immunity risks", "proposed", "", ""),
    ("power-electronics-protection", "P0", 4, "power", "Design overcurrent, short-circuit, overvoltage, and thermal protection", "proposed", "", ""),
    ("high-voltage-safety", "P0", 4, "power", "Review creepage, clearance, insulation, touch, and stored-energy hazards", "proposed", "", ""),
    ("power-quality-and-harmonics", "P1", 4, "power", "Analyze power factor, harmonics, flicker, and filtering", "proposed", "", ""),
    ("battery-and-bms-design", "P1", 4, "power", "Design battery packs and management functions", "proposed", "", ""),
    ("solar-and-energy-storage", "P1", 4, "power", "Design PV, MPPT, inverter, and storage systems", "proposed", "", ""),
    ("pcb-power-layout-review", "P0", 4, "power", "Review a PCB for high-current and high-dv/dt circuits", "proposed", "", ""),
    ("component-derating-and-lifetime", "P1", 4, "power", "Verify margin and expected life", "proposed", "", ""),
    ("spice-and-system-simulation", "P1", 4, "power", "Build and verify circuit and control simulations", "proposed", "", ""),
    ("electrical-bom-and-costing", "P1", 4, "power", "Build a technical bill of materials and cost or risk view", "proposed", "", ""),
    ("engineering-test-plan", "P0", 4, "power", "Define verification and validation tests", "proposed", "", ""),
    ("measurement-and-uncertainty", "P0", 4, "power", "Plan measurements and quantify uncertainty", "proposed", "", ""),
    ("failure-analysis-fmea", "P1", 4, "power", "Analyze failure modes and corrective actions", "proposed", "", ""),
    ("engineering-compliance-dossier", "P1", 4, "power", "Assemble technical construction and compliance evidence", "proposed", "", ""),
    ("engineering-technical-writing", "P1", 4, "power", "Produce specifications, design notes, and manuals", "proposed", "", ""),
    # 5K mechanical and manufacturing
    ("mechanical-design-review", "P1", 5, "mechanical", "Review parts, assemblies, and mechanisms", "proposed", "", ""),
    ("thermal-fluid-analysis", "P1", 5, "mechanical", "Analyze heat transfer, pressure drop, and flow", "proposed", "", ""),
    ("cad-drawing-review", "P1", 5, "mechanical", "Review drawings and manufacturing definitions", "proposed", "", ""),
    ("design-for-manufacture-assembly", "P1", 5, "mechanical", "Improve manufacturability and assembly", "proposed", "", ""),
    ("manufacturing-process-plan", "P1", 5, "mechanical", "Create routing and work instructions", "proposed", "", ""),
    ("quality-control-plan", "P1", 5, "mechanical", "Define incoming, in-process, and final controls", "proposed", "", ""),
    ("reliability-engineering", "P1", 5, "mechanical", "Plan reliability prediction and testing", "proposed", "", ""),
    ("root-cause-analysis", "P1", 5, "mechanical", "Run structured investigations of a failure", "proposed", "", ""),
    ("civil-structural-calculation", "P2", 5, "mechanical", "Perform scoped civil or structural checks", "proposed", "", ""),
    ("chemical-process-analysis", "P2", 5, "mechanical", "Analyze mass and energy balance and process conditions", "proposed", "", ""),
    # 5L business
    ("financial-planning-analysis", "P1", 5, "business", "Budget, forecast, variance, and decision analysis", "routed", "", "financial-analysis"),
    ("bookkeeping-reconciliation", "P1", 5, "business", "Categorize and reconcile transactions", "routed", "", "invoicing-bookkeeping"),
    ("procurement-and-rfq", "P1", 5, "business", "Prepare RFQs and compare suppliers", "proposed", "", ""),
    ("vendor-due-diligence", "P1", 5, "business", "Evaluate vendor security, finance, delivery, and compliance", "proposed", "", ""),
    ("contract-review", "P1", 5, "business", "Summarize commercial and legal documents for business review", "installed", "contract-review", ""),
    ("policy-authoring", "P1", 5, "business", "Create internal policies", "proposed", "", ""),
    ("privacy-compliance", "P1", 5, "business", "Support privacy operations and reviews", "installed", "privacy-compliance", ""),
    ("hr-recruiting", "P1", 5, "business", "Create job, interview, and onboarding materials", "installed", "hr-recruiting", ""),
    ("performance-and-goals", "P1", 5, "business", "Define goals, check-ins, and development plans", "proposed", "", ""),
    ("sales-proposal-and-sow", "P1", 5, "business", "Create proposals, quotes, and statements of work", "routed", "", "proposals-quotes"),
    ("crm-and-sales-operations", "P1", 5, "business", "Maintain opportunities, follow-ups, and forecasts", "proposed", "", ""),
    ("marketing-content", "P1", 5, "business", "Produce governed campaigns and collateral", "installed", "marketing-content", ""),
    ("customer-support", "P1", 5, "business", "Triage and resolve support interactions", "installed", "customer-support", ""),
    ("market-and-competitor-research", "P1", 5, "business", "Research markets, competitors, and opportunities", "routed", "", "market-research"),
    ("business-case", "P1", 5, "business", "Compare investment or change options", "routed", "", "strategy-okrs"),
    ("okr-and-strategy", "P1", 5, "business", "Define strategy, OKRs, and the execution review", "routed", "", "strategy-okrs"),
    ("compliance-audit", "P1", 5, "business", "Plan and perform internal control reviews", "proposed", "", ""),
    # 5M connected applications
    ("email-assistant", "P0", 5, "connected", "Search, summarize, draft, label, and send email", "routed", "", "email-calendar-assistant"),
    ("calendar-assistant", "P0", 5, "connected", "Search availability and manage meetings", "routed", "", "email-calendar-assistant"),
    ("drive-document-operations", "P1", 5, "connected", "Find, organize, share, and export cloud files", "proposed", "", ""),
    ("work-tracker-operations", "P1", 5, "connected", "Read and update tracker records", "routed", "", "work-trackers"),
    ("source-control-connector", "P1", 5, "connected", "Work with GitHub or GitLab issues, pull requests, and CI", "routed", "", "github-workflow"),
    ("crm-connector", "P1", 5, "connected", "Read and update CRM accounts, contacts, and opportunities", "proposed", "", ""),
    ("erp-procurement-connector", "P1", 5, "connected", "Work with purchasing, inventory, and finance systems", "proposed", "", ""),
    ("browser-research-and-automation", "P1", 5, "connected", "Operate approved sites where APIs are unavailable", "proposed", "", ""),
    ("desktop-application-control", "P1", 5, "connected", "Operate native applications", "proposed", "", ""),
    ("notification-and-escalation", "P1", 5, "connected", "Notify people only when action is needed", "proposed", "", ""),
]

PHASE0 = [
    "skill-router",
    "skill-authoring",
    "skill-registry-admin",
    "permission-and-approval-planner",
    "evidence-and-provenance",
    "artifact-quality-control",
    "template-library",
    "workflow-orchestration",
    "audit-log-and-reporting",
    "llm-evaluation",
    "prompt-injection-defense",
    "agent-tool-design",
]


def library_slugs() -> set[str]:
    slugs = set()
    if not LIBRARY.is_dir():
        return slugs
    for child in LIBRARY.iterdir():
        if child.is_dir() and (child / "SKILL.md").is_file():
            slugs.add(child.name)
    return slugs


def build() -> dict:
    if len(ROWS) != 195:
        raise SystemExit(f"expected 195 catalog rows, found {len(ROWS)}")
    names = [row[0] for row in ROWS]
    if len(names) != len(set(names)):
        raise SystemExit("duplicate catalog names")
    if set(PHASE0) != {row[0] for row in ROWS if row[5] == "installed" and row[2] == 0 and row[3] in {"platform", "ai"}}:
        # phase-0 installed skills are exactly PHASE0; other installed rows have a later phase
        pass
    installed_phase0 = [row[0] for row in ROWS if row[0] in PHASE0]
    if installed_phase0 != [row[0] for row in ROWS if row[0] in set(PHASE0)]:
        raise SystemExit("phase 0 list drifted from rows")
    for name in PHASE0:
        row = next(r for r in ROWS if r[0] == name)
        if row[5] != "installed" or row[6] != name or row[7]:
            raise SystemExit(f"{name} must be installed as itself")
    entries = []
    referenced: set[str] = set()
    for name, priority, phase, group, purpose, status, installed_as, covered_by in ROWS:
        if status not in {"installed", "routed", "proposed"}:
            raise SystemExit(f"bad status for {name}")
        if status == "installed" and (not installed_as or covered_by):
            raise SystemExit(f"{name} installed row is inconsistent")
        if status == "routed" and (installed_as or not covered_by):
            raise SystemExit(f"{name} routed row is inconsistent")
        if status == "proposed" and (installed_as or covered_by):
            raise SystemExit(f"{name} proposed row is inconsistent")
        if installed_as:
            referenced.add(installed_as)
        if covered_by:
            referenced.add(covered_by)
        entries.append({
            "name": name,
            "priority": priority,
            "phase": phase,
            "group": group,
            "purpose": purpose,
            "status": status,
            "installedAs": installed_as or None,
            "coveredBy": covered_by or None,
        })
    on_disk = library_slugs()
    missing = sorted(referenced - on_disk)
    if missing:
        raise SystemExit("catalog points at library folders that do not exist: " + ", ".join(missing))
    retained = sorted(on_disk - referenced)
    return {
        "blueprint": "docs/GMS_AI_ORGANIZATIONAL_SKILLS_BLUEPRINT.md",
        "prepared": "2026-10-18",
        "productionTarget": "110-125",
        "entries": entries,
        "retainedLibrary": retained,
    }


def main() -> int:
    payload = json.dumps(build(), indent=2) + "\n"
    if "--check" in sys.argv:
        current = OUT.read_text(encoding="utf-8") if OUT.is_file() else ""
        if current != payload:
            raise SystemExit("catalog.json is stale; run packages/skills/catalog/build_catalog.py")
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(payload, encoding="utf-8", newline="\n")
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

# BugScope AI

<div align="center">

**VS Code-Native · Local-First · Evidence-Driven Error Impact Analysis**

*Understand an error, trace its potential impact, and prioritise what to investigate next — without leaving the editor.*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-VS%20Code%20Extension-blue)](https://code.visualstudio.com/)
[![Mode](https://img.shields.io/badge/Mode-Local--First%20%7C%20100%25%20Offline-green)](PLAN.md)
[![Sprint](https://img.shields.io/badge/Sprint-NEXUS'26%20Hackathon%20(24h)-orange)](PLAN.md)
[![Tests](https://img.shields.io/badge/Tests-56%2F56%20Passing-brightgreen)](test/)

</div>

---

## ⚡ Overview

**BugScope AI** turns raw stack traces and error messages into evidence-backed, local investigations of impacted code and tests worth running first — without leaving the editor or requiring external API keys.

### Core Workflow
1. **Highlight:** Select any error message or stack trace in an active editor tab (e.g. `.log`, `.ts`, `.js`, `.py`, or terminal output pasted into an editor buffer).
2. **Right-Click:** Choose `BugScope AI: Analyse Error Impact` from the editor context menu (or press `F4` / `Alt+Shift+B`).
3. **Inspect:** BugScope's dedicated sidebar view resolves stack frames to actual workspace files, extracts AST dependencies, ranks impacted modules with explicit evidence, and highlights relevant test suites.
4. **Navigate:** Click any candidate reference or throw site to jump straight to that exact line in code.

---

## 📊 Capability Matrix

| Feature / Domain | Implemented Support | Verified Mechanism & Constraints |
| :--- | :--- | :--- |
| **JavaScript / TypeScript** | ✅ Full AST Parsing | TypeScript Compiler API (`ts.createSourceFile`). Static imports, re-exports, dynamic imports, CommonJS `require`, and `tsconfig.json` path aliases (`@/*`, `~/*`). Comments and strings are ignored. |
| **Python** | ✅ Native AST & RegEx | Multi-line parenthesized imports (`from m import (a, b)`), comments stripped, single imports (`import x as y`), relative package imports (`from .utils import f`). Virtual environments (`.venv`, `__pycache__`) excluded. |
| **Stack Trace Parsing** | ✅ Multi-Engine | V8 / Node.js, TypeScript transpilations, Python 3 tracebacks (chained `raise ... from` exception tracking), ANSI terminal escape code stripping, paths containing spaces, Windows drive letters. |
| **Source Resolution** | ✅ Multi-Root & Disambiguation | Exact canonical paths, verified directory suffix matching, unsaved dirty buffer priority, symlink resolution. Rejects ambiguous duplicate basenames when multiple matches exist across folders. |
| **Workspace Security** | ✅ Strict Containment | `path.relative` containment algorithm (prevents sibling-prefix attacks), platform-aware path casing (Windows vs Linux case preservation), sensitive file exclusion (`.env`, `*.key`, `id_rsa`), nonce-based webview CSP. |
| **Dependency Mapping** | ✅ 1-Hop & 2-Hop Graph | Directional importer/callee edges, fan-in centrality tracking, global traversal budget (max 300 files), circular import handling, duplicate edge suppression. |
| **Test Discovery** | ✅ Multi-Pattern Matching | Discovers matching suites for candidates (`*.test.ts`, `*.spec.ts`, `test_*.py`, `*_test.py`, `__tests__/*`). Distinguishes "related test candidates" from verified execution coverage. |
| **Impact Ranking** | ✅ Calibrated Heuristic Engine | Transparent multi-vector scoring: Stack proximity (0.45) + Dependency adjacency (0.25) + Blast radius / fan-in (0.15) + Compound synergy (0.15). Scores strictly bounded [0.0 - 1.0]. |
| **AI Enrichment** | ⚡ Optional & Privacy-Guarded | Disabled by default (100% offline). Compatible with Ollama, LM Studio, or OpenAI. Request timeouts, bounded response streams (200KB limit), redirect rejection, VS Code Keychain SecretStorage. |

---

## 🏗️ Architecture

<div align="center">

![BugScope AI Architecture Diagram](resources/architecture.png)

</div>

<details>
<summary><b>🔍 View Mermaid Source Diagram</b></summary>

```mermaid
flowchart TD
    subgraph UI ["VS Code UI Layer"]
        Editor["📄 VS Code Editor<br/>(Source / Log file)"]
        Selection["🖱️ Selected Error Text"]
        Menu["📋 Context Menu Action<br/>'BugScope AI: Analyse Error Impact'"]
        CmdHandler["⚡ Command Handler<br/>(bugscope.analyzeError)"]
        ResultsView["📊 BugScope Results Panel<br/>(Sidebar WebviewView)"]

        Editor -->|"Developer highlights text"| Selection
        Selection -->|"Right click"| Menu
        Menu -->|"Executes"| CmdHandler
        CmdHandler -->|"Reveal & display loading"| ResultsView
    end

    subgraph Core ["Local Analysis Engine (100% Offline)"]
        ErrorParser["🔍 Error & Stack Parser<br/>(Regex / Frame Extraction)"]
        SourceResolver["📂 Workspace Source Resolver<br/>(Path validation & bounds)"]
        LocalEngine["⚙️ Analysis Coordinator"]

        CmdHandler -->|"Raw text"| ErrorParser
        ErrorParser -->|"Parsed stack frames"| SourceResolver
        SourceResolver -->|"Resolved file references"| LocalEngine

        subgraph Pipeline ["Evidence Pipeline"]
            SymbolInspection["🔬 Symbol & Syntax Inspection<br/>(AST / Tokens)"]
            DepAnalysis["🕸️ Dependency Mapper<br/>(TypeScript AST & Python Imports)"]
            TestDiscovery["🧪 Test Suite Discovery<br/>(*.test.ts / test_*.py)"]
        end

        LocalEngine --> SymbolInspection
        LocalEngine --> DepAnalysis
        LocalEngine --> TestDiscovery

        SymbolInspection --> EvidenceCollector["📦 Evidence Collector"]
        DepAnalysis --> EvidenceCollector
        TestDiscovery --> EvidenceCollector

        EvidenceCollector --> ImpactRanker["📈 Impact Scoring Engine<br/>R(f) = wₛS(f) + w_d D(f) + w_b B(f) + w_c C(f)"]
        ImpactRanker --> LocalReport["📑 Local Baseline Report<br/>(Verified Facts & Evidence)"]
    end

    subgraph AI ["Optional AI Enrichment"]
        LocalReport --> CheckAI{"AI Enabled & Key Set?"}
        CheckAI -->|"No"| RenderLocal["Use Baseline Report"]
        CheckAI -->|"Yes"| AIAdapter["🤖 AI Adapter<br/>(Local Ollama or External API)"]
        AIAdapter --> ValidateEnrichment["🛡️ Schema Validator & Sanitizer<br/>(Hypothesis classification)"]
        ValidateEnrichment --> CombinedReport["📑 Enriched Report"]
    end

    RenderLocal -->|"Render findings & score"| ResultsView
    CombinedReport -->|"Render findings & score"| ResultsView
    ResultsView -.->|"Clickable references jump to line"| Editor

    classDef ui fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#f8fafc;
    classDef core fill:#1e1b4b,stroke:#818cf8,stroke-width:2px,color:#f8fafc;
    classDef pipe fill:#2e1065,stroke:#c084fc,stroke-width:1.5px,color:#f8fafc;
    classDef ai fill:#064e3b,stroke:#34d399,stroke-width:2px,color:#f8fafc;
    classDef decision fill:#312e81,stroke:#a78bfa,stroke-width:2px,color:#f8fafc;

    class Editor,Selection,Menu,CmdHandler,ResultsView ui;
    class ErrorParser,SourceResolver,LocalEngine,EvidenceCollector,ImpactRanker,LocalReport,RenderLocal core;
    class SymbolInspection,DepAnalysis,TestDiscovery pipe;
    class AIAdapter,ValidateEnrichment,CombinedReport ai;
    class CheckAI decision;
```

</details>

---

## 🔒 Security & Privacy Guarantees

- **100% Offline & Local-First:** All stack parsing, source resolution, AST dependency mapping, and impact scoring run locally on your machine. No telemetry, analytics, or background pings exist.
- **Keychain Secret Storage:** AI provider API keys are stored in VS Code's OS-backed SecretStorage keychain (`context.secrets`), never in plaintext `settings.json`. Explicit key deletion prevents resurrecting stale tokens.
- **Strict Path Containment:** Rejects directory traversal attacks (`..`), sibling-prefix workspace spoofing (`/workspace-other`), and symlink escapes using real filesystem path resolution.
- **Restricted Webview CSP:** Enforces nonce-based script execution with zero `unsafe-inline` or `unsafe-eval` scripts. Untrusted stack traces and error snippets are sanitized before rendering.
- **Controlled External Egress:** If optional AI enrichment is enabled, requests only connect via HTTP/HTTPS, reject unexpected redirects, bound payload responses to 200KB, and enforce a strict timeout.

---

## 🚀 Quickstart & Installation

### Option 1: Install Pre-Built VSIX
```bash
code --install-extension bugscope-ai-0.2.3.vsix
```

### Option 2: Run in Development Host
1. Clone repository and install dependencies:
   ```bash
   git clone https://github.com/saranraj1/BugScope-AI.git
   cd BugScope-AI
   npm install
   ```
2. Build extension:
   ```bash
   npm run compile
   npm run build
   ```
3. Press `F5` in VS Code to launch the **Extension Development Host**.

---

## 🧪 Running Automated Tests

Run the complete 56-scenario test suite verifying parser robustness, path security boundaries, dependency mapping, impact ranking, and end-to-end flows:

```bash
npm run compile
npm test
```

Test coverage includes:
- ✅ **Valid TypeScript & JavaScript stack traces** (multiple frames, async wrappers, method aliases)
- ✅ **Python tracebacks** (extracting bottom exception header, chained tracebacks, and nested frames)
- ✅ **Bare error messages** (ReferenceError, TypeError without frames)
- ✅ **Malformed crash dumps** (graceful error handling without IDE crash)
- ✅ **Empty and arbitrary text selections** (defensive guidance prompts without false error claims)
- ✅ **Path traversal & sibling-prefix prevention** (`path.relative` containment and symlink checks)
- ✅ **Duplicate basename disambiguation** (directory suffix matching without blind basename coincidence)
- ✅ **Sensitive file exclusion** (`.env`, `*.key`, `id_rsa`)
- ✅ **TypeScript AST dependency extraction** (ignoring fake imports in comments and strings)
- ✅ **Global analysis scan budgets** (300-file traversal budget with explicit truncation reporting)
- ✅ **Multi-root workspace analysis** (consistent indexing and ownership across workspace folders)
- ✅ **Matching test suite discovery** and regression test guidance
- ✅ **100% offline baseline execution** and graceful handling of unavailable AI endpoints

---

## 🎯 90-Second Demo Procedure

1. Open `test/fixtures/traces/valid-typescript.log` in VS Code.
2. Highlight the 4 lines of the stack trace:
   ```text
   TypeError: Cannot read properties of undefined (reading 'rate')
       at calculateDiscount (src/checkout.ts:27:30)
       at processOrder (src/orderService.ts:9:20)
       at Object.handleCheckout (src/routes/cart.ts:4:18)
   ```
3. Right-click and select **`BugScope AI: Analyse Error Impact`**.
4. The **BugScope AI** sidebar opens instantly, showing:
   - **Throw Origin:** `src/checkout.ts:27` with surrounding code preview.
   - **Blast Radius:** Ranked candidate modules (`#1 checkout.ts`, `#2 orderService.ts`, `#3 routes/cart.ts`) with calculated impact scores and explicit dependency reasons.
   - **Targeted Test Coverage:** Discovered candidates in `test/checkout.test.ts`.
5. Click on `src/checkout.ts` to navigate directly to the failure site in the editor.

---

## 📄 License & Specification
- **Master Plan & Technical Spec:** [PLAN.md](PLAN.md)
- **Repair Tracker:** [docs/REPAIR_TRACKER.md](docs/REPAIR_TRACKER.md)
- **Engineering Repair Report:** [docs/REPAIR_REPORT.md](docs/REPAIR_REPORT.md)
- **License:** [MIT](LICENSE)

# BugScope AI — Engineering Task Allocation & Tracking Board

> **Target Platform:** VS Code Extension (Local-First Error Impact Analyzer)  
> **Status:** Completed (v0.2.3 Released & Verified)  

---

## 👥 Team Roles & Responsibilities

| Member | Primary Focus | Modules & Scope |
| :--- | :--- | :--- |
| **Member 1** | **Parser & Source Resolver Lead** | `errorParser.ts`, `sourceResolver.ts`, `workspaceSecurity.ts` |
| **Member 2** | **AST Graph & Scoring Engine Lead** | `dependencyAnalyzer.ts`, `symbolAnalyzer.ts`, `impactScorer.ts`, `reportBuilder.ts`, `testDiscovery.ts` |
| **Member 3** | **VS Code Integration & UI Lead** | `extension.ts`, `analyzeError.ts`, `resultsViewProvider.ts`, `credentialStore.ts`, `package.json` |
| **Member 4** | **AI Adapter, Quality & Release Lead** | `aiAdapter.ts`, `test/*.test.ts`, `.vsix` Build, Verification Fixtures & Release |

---

## 📋 Member-by-Member Detailed Tasks

### 👤 Member 1: Parser & Source Resolver Lead
- [x] **Task 1.1: Multi-Format Stack Trace Parser**
  - Implement deterministic V8/Node JS/TS stack frame regex parser (`src/analysis/errorParser.ts`).
  - Add support for Python tracebacks (`File "...", line X, in Y`) and chained exception propagation.
  - Support bare error messages (e.g. `ReferenceError`, `TypeError` without stack frames).
  - Strip ANSI escape sequences and terminal noise cleanly.
- [x] **Task 1.2: Workspace Source Resolution**
  - Resolve stack frame relative/absolute paths to actual workspace files (`src/analysis/sourceResolver.ts`).
  - Support unsaved/dirty active editor buffer context over disk contents.
  - Implement code snippet extraction around target line numbers with highlight flags.
  - Implement duplicate basename disambiguation using multi-segment directory suffix verification.
- [x] **Task 1.3: Security & Path Containment**
  - Implement path traversal prevention (`workspaceSecurity.ts`) blocking `../..` and sibling-prefix escapes.
  - Resolve symlinks via `fs.realpathSync` to prevent symlink sandbox escapes.
  - Exclude sensitive files (`.env`, `*.key`, `id_rsa`) from analysis scope.
  - Preserve POSIX case sensitivity on Linux filesystems.
- [x] **Task 1.4: Unit Tests for Parser & Resolver**
  - Verify edge cases: malformed traces, empty selection, V8 method aliases, and space-containing paths.

---

### 👤 Member 2: AST Graph & Scoring Engine Lead
- [x] **Task 2.1: AST Import/Export Dependency Mapping**
  - Construct static import graph using TypeScript Compiler API (`src/analysis/dependencyAnalyzer.ts`).
  - Support 1-hop and 2-hop module adjacency mapping.
  - Ignore comments, string literals, `node_modules`, `dist`, and build output directories.
  - Implement `tsconfig.json` path alias resolution (`@/*`, `~/*`).
  - Support multi-root workspace folders and global scan budgets (`maxFilesScan = 300`).
- [x] **Task 2.2: Symbol Context Inspection**
  - Inspect function, class, and method declarations around throw sites (`src/analysis/symbolAnalyzer.ts`).
  - Extract call tokens to match against error symbols.
- [x] **Task 2.3: Explainable Multi-Factor Impact Scoring**
  - Formulate linear weighted scoring $R(f) = w_s S(f) + w_d D(f) + w_b B(f) + w_c C(f)$ (`src/analysis/impactScorer.ts`).
  - Generate human-readable evidence rationale for each candidate module (`src/analysis/reportBuilder.ts`).
  - Ensure deterministic tie-breaking and normalized scoring bounds $[0.0, 1.0]$.
- [x] **Task 2.4: Targeted Test Suite Discovery**
  - Discover matching test suites (`*.test.ts`, `*.spec.ts`, `test_*.py`) targeting impacted files (`src/analysis/testDiscovery.ts`).
  - Distinguish related test candidates from verified coverage.

---

### 👤 Member 3: VS Code Integration & UI Lead
- [x] **Task 3.1: Extension Activation & Command Registration**
  - Scaffold extension entrypoint (`src/extension.ts`) and command handler (`src/commands/analyzeError.ts`).
  - Register `editor/context` right-click menu item with `editorHasSelection` predicate in `package.json`.
  - Enforce non-blocking onboarding and interactive input prompt on empty selection.
  - Preserve and restore developer clipboard state across all command exit paths.
- [x] **Task 3.2: Native Sidebar WebviewView Provider**
  - Build peripheral sidebar results panel (`src/providers/resultsViewProvider.ts`).
  - Implement dark-theme UI with collapsible sections (Error Summary, Blast Radius, Tests).
  - Handle asynchronous state transitions: `STATE_LOADING`, `STATE_SUCCESS`, `STATE_EMPTY`, `STATE_ERROR`.
  - Enforce strict Content Security Policy with cryptographic nonces and runtime message schema validation.
- [x] **Task 3.3: Interactive Navigation & IPC Wiring**
  - Wire clickable file/line references to open target document in VS Code editor (`vscode.workspace.openTextDocument`).
  - Implement local API key modal & state persistence (`src/services/credentialStore.ts`).
  - Ensure API key deletion is deterministic via explicit deletion sentinel flag.

---

### 👤 Member 4: AI Adapter, Quality & Release Lead
- [x] **Task 4.1: Non-Blocking AI Enrichment Adapter**
  - Build optional LLM adapter for local Ollama / external AI provider (`src/ai/aiAdapter.ts`).
  - Enforce non-blocking architecture: baseline analysis works 100% offline with zero keys.
  - Implement schema sanitizer ensuring AI output is categorized as hypothesis.
  - Enforce bounded response streams (200KB limit), timeouts, and redirect rejection.
- [x] **Task 4.2: Automated Test Suite & Edge Case Hardening**
  - Maintain 56/56 passing test scenarios across all unit, integration, and security regression suites.
  - Verify zero IDE lockups or unhandled rejections on bad inputs.
  - Verify 0 TypeScript compiler errors (`tsc -p ./`).
- [x] **Task 4.3: Packaging & Release Verification**
  - Verify TypeScript compilation and production bundle validation (`npm run build`).
  - Package production VSIX (`bugscope-ai-0.2.3.vsix`).
  - Prepare offline demonstration workflow and documentation in `README.md`.

---

## 🏃 Autonomous Execution Log

| Timestamp | Executed Action | Assigned To | Status |
| :--- | :--- | :--- | :--- |
| `2026-10-09 12:26` | Repository inspection & master plan analysis | All Members | ✅ Complete |
| `2026-10-09 12:27` | Automated test suite execution (`npm test`) | Member 4 | ✅ 33/33 Passed |
| `2026-10-09 12:28` | Verification of parser, AST graph, scoring, UI & AI modules | Member 1 & 2 | ✅ Verified |
| `2026-10-09 12:29` | Workspace task breakdown document creation | Member 3 | ✅ Created |
| `2026-10-09 12:30` | Initial build compilation & validation check (`npm run build`) | Member 4 | ✅ Complete |
| `2026-10-09 15:10` | Phase Zero Audit & Defect Catalogue creation (`docs/REPAIR_TRACKER.md`) | All Members | ✅ Complete |
| `2026-10-09 15:25` | P0.1 - P0.6 Correctness & Security Repairs (`workspaceSecurity.ts`, `sourceResolver.ts`) | Member 1 | ✅ Complete |
| `2026-10-09 15:35` | P1.1 - P1.8 Static Analysis & AST Parser Overhaul (`dependencyAnalyzer.ts`) | Member 2 | ✅ Complete |
| `2026-10-09 15:45` | Credential Keychain & Webview CSP Hardening (`credentialStore.ts`, `resultsViewProvider.ts`) | Member 3 | ✅ Complete |
| `2026-10-09 15:55` | AI Adapter Egress Bounding & Command UX Hardening (`aiAdapter.ts`, `analyzeError.ts`) | Member 4 | ✅ Complete |
| `2026-10-09 16:10` | Regression Test Suite Expansion (Audit C.1-C.3, D.1-D.5, E.1-E.2, F.1) | Member 4 | ✅ 56/56 Passed |
| `2026-10-09 16:25` | Production esbuild bundle compilation & `bugscope-ai-0.2.3.vsix` packaging | Member 4 | ✅ Complete |
| `2026-10-09 16:35` | Master Completion Report generation (`docs/REPAIR_REPORT.md`) & release validation | All Members | ✅ Complete |

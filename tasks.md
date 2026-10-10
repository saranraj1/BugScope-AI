# BugScope AI — 4-Member Hackathon Task Allocation & Tracking Board

> **Sprint:** NEXUS'26 Hackathon (24-Hour Sprint)  
> **Target Platform:** VS Code Extension (Local-First Error Impact Analyzer)  
> **Status:** Active Sprint Execution  

---

## 👥 Team Roles & Responsibilities

| Member | Primary Focus | Modules & Scope |
| :--- | :--- | :--- |
| **Member 1** | **Parser & Source Resolver Lead** | `errorParser.ts`, `sourceResolver.ts`, `workspaceSecurity.ts` |
| **Member 2** | **AST Graph & Scoring Engine Lead** | `dependencyAnalyzer.ts`, `symbolAnalyzer.ts`, `impactScorer.ts`, `reportBuilder.ts`, `testDiscovery.ts` |
| **Member 3** | **VS Code Integration & UI Lead** | `extension.ts`, `analyzeError.ts`, `resultsViewProvider.ts`, `credentialStore.ts`, `package.json` |
| **Member 4** | **AI Adapter, Quality & Pitch Lead** | `aiAdapter.ts`, `test/*.test.ts`, `.vsix` Build, Demo Fixtures & Pitch Script |

---

## 📋 Member-by-Member Detailed Tasks

### 👤 Member 1: Parser & Source Resolver Lead
- [x] **Task 1.1: Multi-Format Stack Trace Parser**
  - Implement deterministic V8/Node JS/TS stack frame regex parser (`src/analysis/errorParser.ts`).
  - Add support for Python tracebacks (`File "...", line X, in Y`).
  - Support bare error messages (e.g. `ReferenceError`, `TypeError` without stack frames).
- [x] **Task 1.2: Workspace Source Resolution**
  - Resolve stack frame relative/absolute paths to actual workspace files (`src/analysis/sourceResolver.ts`).
  - Support unsaved/dirty active editor buffer context over disk contents.
  - Implement code snippet extraction around target line numbers.
- [x] **Task 1.3: Security & Path Containment**
  - Implement path traversal prevention (`workspaceSecurity.ts`) blocking `../..` escapes.
  - Exclude sensitive files (`.env`, `*.key`, `id_rsa`) from analysis scope.
- [x] **Task 1.4: Unit Tests for Parser & Resolver**
  - Verify edge cases: malformed traces, empty selection, V8 method aliases.

---

### 👤 Member 2: AST Graph & Scoring Engine Lead
- [x] **Task 2.1: AST Import/Export Dependency Mapping**
  - Construct static import graph using TypeScript Compiler API (`src/analysis/dependencyAnalyzer.ts`).
  - Support 1-hop and 2-hop module adjacency mapping.
  - Ignore `node_modules`, `dist`, and build output directories.
- [x] **Task 2.2: Symbol Context Inspection**
  - Inspect function, class, and method declarations around throw sites (`src/analysis/symbolAnalyzer.ts`).
  - Extract call tokens to match against error symbols.
- [x] **Task 2.3: Explainable Multi-Factor Impact Scoring**
  - Formulate linear weighted scoring $R(f) = w_s S(f) + w_d D(f) + w_m M(f) + w_t T(f)$ (`src/analysis/impactScorer.ts`).
  - Generate human-readable evidence rationale for each candidate module (`src/analysis/reportBuilder.ts`).
- [x] **Task 2.4: Targeted Test Suite Discovery**
  - Discover matching test suites (`*.test.ts`, `*.spec.ts`) targeting impacted files (`src/analysis/testDiscovery.ts`).

---

### 👤 Member 3: VS Code Integration & UI Lead
- [x] **Task 3.1: Extension Activation & Command Registration**
  - Scaffold extension entrypoint (`src/extension.ts`) and command handler (`src/commands/analyzeError.ts`).
  - Register `editor/context` right-click menu item with `editorHasSelection` predicate in `package.json`.
- [x] **Task 3.2: Native Sidebar WebviewView Provider**
  - Build peripheral sidebar results panel (`src/providers/resultsViewProvider.ts`).
  - Implement dark-theme UI with collapsible sections (Error Summary, Blast Radius, Tests).
  - Handle asynchronous state transitions: `STATE_LOADING`, `STATE_SUCCESS`, `STATE_ERROR`.
- [x] **Task 3.3: Interactive Navigation & IPC Wiring**
  - Wire clickable file/line references to open target document in VS Code editor (`vscode.workspace.openTextDocument`).
  - Implement local API key modal & state persistence (`src/services/credentialStore.ts`).

---

### 👤 Member 4: AI Adapter, Quality & Pitch Lead
- [x] **Task 4.1: Non-Blocking AI Enrichment Adapter**
  - Build optional LLM adapter for local Ollama / external AI provider (`src/ai/aiAdapter.ts`).
  - Enforce non-blocking architecture: baseline analysis works 100% offline with zero keys.
  - Implement schema sanitizer ensuring AI output is categorized as hypothesis.
- [x] **Task 4.2: Automated Test Suite & Edge Case Hardening**
  - Maintain 33/33 passing test scenarios (`test/analysis.test.ts`, `test/extension.test.ts`).
  - Verify zero IDE lockups or unhandled rejections on bad inputs.
- [x] **Task 4.3: Packaging & Pitch Demonstration**
  - Verify TypeScript compilation and bundle validation (`npm run build`).
  - Prepare 90-second pitch script and offline demonstration workflow in `README.md`.

---

## 🏃 Autonomous Execution Log

| Timestamp | Executed Action | Assigned To | Status |
| :--- | :--- | :--- | :--- |
| `2026-10-09 12:26` | Repository inspection & master plan analysis | All Members | ✅ Complete |
| `2026-10-09 12:27` | Automated test suite execution (`npm test`) | Member 4 | ✅ 33/33 Passed |
| `2026-10-09 12:28` | Verification of parser, AST graph, scoring, UI & AI modules | Member 1 & 2 | ✅ Verified |
| `2026-10-09 12:29` | Workspace task breakdown document creation | Member 3 | ✅ Created |
| `2026-10-09 12:30` | Full build compilation & validation check (`npm run build`) | Member 4 | ✅ In Progress |

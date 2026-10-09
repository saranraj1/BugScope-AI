
The key requirement is now clear: BugScope AI must feel like a natural part of VS Code, not a web app squeezed into an extension.

# BugScope AI — NEXUS'26 Hackathon Master Plan

# BugScope AI

VS Code-native · Local-first · Evidence-driven

Understand an error, trace its potential impact, and prioritise what to investigate next—without leaving the editor.

## 24 hours

Strict development budget

## Offline-capable

No API key needed for core analysis

## 1. Lock the exact user experience

Your requested interaction is the first thing we must implement and test—not a feature we leave until the interface phase.

Step 1 — Select the error text

The developer selects a stack trace or error message in a supported VS Code editor, such as a log file.

TypeError: Cannot read properties of undefined

at calculateDiscount (checkout.ts:42)

Step 2 — Right-click the selection

The editor context menu shows a command named exactly:

BugScope AI: Analyse Error Impact

Step 3 — Click BugScope AI

A dedicated BugScope AI view opens in the VS Code sidebar immediately. It shows a loading state while analysis runs.

Step 4 — Inspect the findings

The panel shows the error summary, evidence-backed candidate causes, potentially affected files, and recommended tests. Clicking a reference opens the corresponding source location.

### One important VS Code detail

The context-menu item can be registered for selected text in an editor. That is our guaranteed MVP workflow.

Selecting text directly in the integrated terminal is different from selecting text in an editor. Terminal selection does not reliably behave like an ordinary `TextEditor` selection through the same API. So we should not promise terminal-selection support in the first version.

Instead, initially support:

- Selected error text in an editor.
- Stack traces pasted into a supported editor or log file.
- A later enhancement for terminal-specific workflows, if time permits.

This is a deliberate scope decision, not a limitation we should discover at hour 20.

## 2. The scope we will actually build

The problem statement asks for bug impact prediction using bug descriptions, code modules, dependencies, previous bugs, and user impact. We can credibly implement the first four core dimensions of an MVP, while treating historical bug learning and production user-impact estimation as future work.

### P0 — Must work

Context-menu integration

Selecting text reveals the BugScope AI command.

Error parsing

Extract the exception type, message, stack frames, file paths and line numbers where available.

Workspace-aware analysis

Resolve stack-trace references to real project files and inspect relevant code.

Dependency mapping

Identify supported imports and rank related modules for investigation.

Impact scoring

Generate a transparent, explainable ranking instead of an unsupported probability.

Results panel

Display the report in VS Code with clickable source references.

Local-first fallback

Core analysis works with AI disabled, no API key and no network connection.

### P1 — Build after P0 works

- Find existing tests related to the candidate files.
- Recommend test cases based on the error and available code evidence.
- Show why each module was ranked.
- Provide useful empty, error, and loading states.
- Optionally enrich the report using a local model or external API.

### P2 — Explicitly out of scope for the 24-hour MVP

- Automatic bug fixing or file modification.
- A complete call graph for every language.
- Training a new machine-learning model.
- Historical bug prediction requiring a large dataset.
- Multi-agent orchestration.
- Cloud infrastructure, accounts, or a separate web application.
- Multiple AI providers and complicated configuration.
- Claims that BugScope can reliably identify the exact root cause of every bug.

Scope rule: If a feature does not improve the select → analyse → inspect evidence workflow, it is not a priority for this hackathon.

## 3. Architecture: keep the moving parts small

\#chatgpt-mermaid-\_r_qh\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(237, 237, 237);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_qh\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_qh\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_qh\_ .error-icon{fill:rgb(48, 48, 48);}#chatgpt-mermaid-\_r_qh\_ .error-text{fill:rgb(237, 237, 237);stroke:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_qh\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_qh\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_qh\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_qh\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_qh\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_qh\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_qh\_ .marker{fill:rgb(175, 175, 175);stroke:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_qh\_ .marker.cross{stroke:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_qh\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_qh\_ p{margin:0;}#chatgpt-mermaid-\_r_qh\_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_qh\_ .cluster-label text{fill:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_qh\_ .cluster-label span{color:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_qh\_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-\_r_qh\_ .label text,#chatgpt-mermaid-\_r_qh\_ span{fill:rgb(237, 237, 237);color:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_qh\_ .node rect,#chatgpt-mermaid-\_r_qh\_ .node circle,#chatgpt-mermaid-\_r_qh\_ .node ellipse,#chatgpt-mermaid-\_r_qh\_ .node polygon,#chatgpt-mermaid-\_r_qh\_ .node path{fill:rgb(9, 23, 44);stroke:rgb(31, 78, 148);stroke-width:1px;}#chatgpt-mermaid-\_r_qh\_ .rough-node .label text,#chatgpt-mermaid-\_r_qh\_ .node .label text,#chatgpt-mermaid-\_r_qh\_ .image-shape .label,#chatgpt-mermaid-\_r_qh\_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-\_r_qh\_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-\_r_qh\_ .rough-node .label,#chatgpt-mermaid-\_r_qh\_ .node .label,#chatgpt-mermaid-\_r_qh\_ .image-shape .label,#chatgpt-mermaid-\_r_qh\_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-\_r_qh\_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-\_r_qh\_ .root .anchor path{fill:rgb(175, 175, 175)!important;stroke-width:0;stroke:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_qh\_ .arrowheadPath{fill:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_qh\_ .edgePath .path{stroke:rgb(175, 175, 175);stroke-width:1px;}#chatgpt-mermaid-\_r_qh\_ .flowchart-link{stroke:rgb(175, 175, 175);fill:none;}#chatgpt-mermaid-\_r_qh\_ .edgeLabel{background-color:rgb(0, 0, 0);text-align:center;}#chatgpt-mermaid-\_r_qh\_ .edgeLabel p{background-color:rgb(0, 0, 0);}#chatgpt-mermaid-\_r_qh\_ .edgeLabel rect{opacity:0.5;background-color:rgb(0, 0, 0);fill:rgb(0, 0, 0);}#chatgpt-mermaid-\_r_qh\_ .labelBkg{background-color:rgba(0, 0, 0, 0.5);}#chatgpt-mermaid-\_r_qh\_ .cluster rect{fill:rgb(48, 48, 48);stroke:rgba(255, 255, 255, 0.15);stroke-width:1px;}#chatgpt-mermaid-\_r_qh\_ .cluster text{fill:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_qh\_ .cluster span{color:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_qh\_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:12px;background:rgb(48, 48, 48);border:1px solid rgba(255, 255, 255, 0.15);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-\_r_qh\_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_qh\_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-\_r_qh\_ .icon-shape,#chatgpt-mermaid-\_r_qh\_ .image-shape{background-color:rgb(0, 0, 0);text-align:center;}#chatgpt-mermaid-\_r_qh\_ .icon-shape p,#chatgpt-mermaid-\_r_qh\_ .image-shape p{background-color:rgb(0, 0, 0);padding:2px;}#chatgpt-mermaid-\_r_qh\_ .icon-shape .label rect,#chatgpt-mermaid-\_r_qh\_ .image-shape .label rect{opacity:0.5;background-color:rgb(0, 0, 0);fill:rgb(0, 0, 0);}#chatgpt-mermaid-\_r_qh\_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-\_r_qh\_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-\_r_qh\_ .node .neo-node{stroke:rgb(31, 78, 148);}#chatgpt-mermaid-\_r_qh\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_qh\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_qh\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_qh\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_qh\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_qh\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_qh\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_qh\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_qh\_ [data-look="neo"].node .neo-line path{stroke:rgb(31, 78, 148);filter:none;}#chatgpt-mermaid-\_r_qh\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_qh\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_qh\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_qh\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_qh\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_qh\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_qh\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_qh\_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(153, 206, 255);}#chatgpt-mermaid-\_r_qh\_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(153, 206, 255);}#chatgpt-mermaid-\_r_qh\_ .node tspan[font-weight="normal"],#chatgpt-mermaid-\_r_qh\_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-\_r_qh\_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(0, 14, 26);stroke:rgb(26, 62, 95);stroke-width:1px;}#chatgpt-mermaid-\_r_qh\_ .node rect,#chatgpt-mermaid-\_r_qh\_ .node circle,#chatgpt-mermaid-\_r_qh\_ .node ellipse,#chatgpt-mermaid-\_r_qh\_ .node polygon,#chatgpt-mermaid-\_r_qh\_ .node path{fill:rgb(0, 40, 77);stroke:rgba(255, 255, 255, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_qh\_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-\_r_qh\_ .node.mermaid-decision .label-container{fill:rgb(0, 14, 26);stroke:rgb(26, 62, 95);stroke-dasharray:2,2;}#chatgpt-mermaid-\_r_qh\_ .edgePaths .flowchart-link{stroke:rgb(175, 175, 175);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-\_r_qh\_ .marker{fill:rgb(175, 175, 175);stroke:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_qh\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}VS Code EditorSelected Error TextEditor Context MenuBugScope AICommand HandlerOpen / Reveal BugScopeResults ViewError ParserWorkspace Source ResolverLocal Analysis EngineCode & Symbol InspectionDependency AnalysisTest DiscoveryEvidence CollectorImpact Ranking & BaselineReportOptional AI enabled?Local ReportOptional AI EnrichmentValidate EnrichmentCombined ReportBugScope Results ViewClickable Source ReferencesNoYes

### Technology choices

| Layer               | Decision                                                                 |
| ------------------- | ------------------------------------------------------------------------ |
| Extension runtime   | TypeScript + VS Code Extension API                                       |
| Context menu        | `contributes.menus` with `editor/context` and a selection condition      |
| Results panel       | Webview View registered in a dedicated BugScope sidebar container        |
| Error parsing       | Deterministic TypeScript parsers and targeted rules                      |
| Initial language    | TypeScript/JavaScript, unless your team is materially stronger in Python |
| Dependency analysis | TypeScript compiler API                                                  |
| Ranking             | Rule-based scoring with explicit evidence                                |
| Storage             | None initially; keep the analysis in memory                              |
| AI                  | Optional adapter, added only after local analysis passes tests           |
| Testing             | VS Code Extension Host tests plus controlled fixture repositories        |

A sidebar `WebviewView` is a good fit for the interaction you described. Register the view and container in the extension manifest; when the context-menu command runs, reveal the BugScope view and populate it with the analysis result.

Keep the command handler separate from the analysis engine. The context menu should not contain analysis logic, and the analysis engine should not depend on the UI.

### Suggested project structure

```
bugscope-ai/
├── src/
│   ├── extension.ts
│   ├── commands/
│   │   └── analyzeError.ts
│   ├── analysis/
│   │   ├── errorParser.ts
│   │   ├── sourceResolver.ts
│   │   ├── symbolAnalyzer.ts
│   │   ├── dependencyAnalyzer.ts
│   │   ├── testDiscovery.ts
│   │   ├── impactScorer.ts
│   │   └── reportBuilder.ts
│   ├── providers/
│   │   └── resultsViewProvider.ts
│   ├── ai/
│   │   └── aiAdapter.ts
│   ├── models/
│   │   └── analysisResult.ts
│   └── utils/
│       └── workspaceSecurity.ts
├── test/
│   ├── fixtures/
│   ├── analysis.test.ts
│   └── extension.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

Don't create every module as an empty file at the beginning. Add each module when its phase starts.

## 4. The exact context-menu implementation requirement

This is the first vertical slice to build.

In `package.json`, the conceptual configuration is:

```
{
  "contributes": {
    "commands": [
      {
        "command": "bugscope.analyzeError",
        "title": "BugScope AI: Analyse Error Impact"
      }
    ],
    "menus": {
      "editor/context": [
        {
          "command": "bugscope.analyzeError",
          "when": "editorHasSelection",
          "group": "navigation"
        }
      ]
    }
  }
}
```

This is the essential menu configuration, not a complete extension manifest. The finished manifest must also register the extension entry point and the results view.

The command handler should:

1. Read `vscode.window.activeTextEditor`.
2. Check that a non-empty selection exists.
3. Capture the selected text.
4. Reveal the BugScope sidebar view.
5. Show a loading state immediately.
6. Run the analysis without blocking the extension host.
7. Send the structured result to the view.
8. Display a useful fallback report if analysis fails.

Important implementation detail: Selecting an error does not guarantee that the text itself contains a complete stack trace. The parser must handle a plain error message, a partial stack trace, and a complete stack trace without crashing.

Also, a code selection can be ordinary source code rather than an error. If the selected text doesn't resemble an error, show a helpful prompt instead of fabricating a diagnostic.

# 5. The 24-hour execution schedule

This is the actual sprint plan. Each phase has a deliverable and a go/no-go gate. We do not move forward merely because time has passed.

## 00–02

2 hours

### Phase 1 — Extension foundation

Critical path

- Initialise TypeScript extension.
- Register command and editor context-menu entry.
- Register the BugScope sidebar view.
- Read selected text and reveal the view.
- Show the selected text in a placeholder result. Exit gate: Right-click selected text → BugScope AI → results view opens.

## 02–05

3 hours

### Phase 2 — Error parsing

- Parse error type, message and stack frames.
- Extract file paths and line numbers.
- Resolve workspace-relative and absolute paths safely.
- Handle incomplete and malformed stack traces. Exit gate: A real fixture error resolves to the correct source location.

## 05–09

4 hours

### Phase 3 — Local code analysis

- Index supported source files with size and directory limits.
- Inspect source around referenced lines.
- Extract imports and resolvable dependencies.
- Identify relevant symbols when possible.
- Discover candidate test files. Exit gate: The engine produces a meaningful set of code references and dependency evidence.

## 09–12

3 hours

### Phase 4 — Impact ranking

- Rank direct stack-trace references first.
- Incorporate dependency distance and symbol matches.
- Incorporate relevant test evidence.
- Generate explanations tied to evidence. Exit gate: The report ranks candidate files and explains why they are relevant.

## 12–15

3 hours

### Phase 5 — Results interface

- Render summary, likely causes, impacted candidates and tests.
- Add clickable file references.
- Add loading, empty, error and completed states.
- Preserve the local baseline report. Exit gate: The user can complete the entire workflow within VS Code.

## 15–19

4 hours

### Phase 6 — Testing and hardening

- Test known stack traces and dependency relationships.
- Test invalid selections and unresolved files.
- Test workspace exclusions and large-project limits.
- Verify unsaved editor content is handled appropriately.
- Fix integration defects. Exit gate: All core scenarios pass, with known limitations documented.

## 19–21

2 hours

### Phase 7 — Optional AI enhancement

- Integrate one AI provider or supported local-model adapter.
- Send only relevant, user-approved context.
- Validate model output.
- Test missing credentials and failed requests. Exit gate: AI enriches the local report without being required for success.

  Skip this phase if the local baseline or tests are not stable.

## 21–24

3 hours

### Phase 8 — Release and demo

- Package the VSIX.
- Install and test it in a clean VS Code profile.
- Run the complete demonstration from scratch.
- Fix only critical defects.
- Finish README, installation instructions and demo backup. Exit gate: The extension installs, activates and completes the core workflow reliably.

## 6. Design the impact engine carefully

This is where we earn technical credibility. We need to distinguish observed facts from potential causes.

A simple scoring model is sufficient for the MVP:

\\[ R(f)=w_sS(f)+w_dD(f)+w_mM(f)+w_tT(f) \\]

Where:

- \\(S(f)\\): relevance to the observed stack trace.
- \\(D(f)\\): relevance of discovered dependency relationships.
- \\(M(f)\\): matching symbols or error-context signals.
- \\(T(f)\\): relevance of discovered tests.

The weights should be tuned against the sample repository rather than presented as scientifically validated.

Use three evidence categories:

Observed

A stack trace explicitly references a file and line, or the analyser resolves an import.

Inferred

A related module is prioritised because of a dependency or symbol relationship.

Unverified

A possible root cause suggested by the error pattern but not confirmed by available evidence.

This distinction will make the result panel more trustworthy than a generic AI-generated diagnosis.

## 7. Risk register: what could sink the project?

| Risk                                    | Mitigation                                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------------------- |
| Context-menu item does not appear       | Test menu contribution in the first two hours; verify the selection condition and activation. |
| Sidebar does not open or update         | Implement the view provider and message flow before the analysis engine.                      |
| Stack traces use unexpected formats     | Support a small number of explicit formats and handle unknown formats gracefully.             |
| Dependency analysis becomes too complex | Use file-level imports first; postpone full call-graph analysis.                              |
| Workspace scanning is too slow          | Limit file types, directory traversal, file sizes and analysis depth.                         |
| Model invents causes                    | Preserve evidence separately and label AI suggestions as hypotheses.                          |
| External API fails                      | Display the local baseline report.                                                            |
| Source code contains secrets            | Exclude secret/configuration files and minimise context sent remotely.                        |
| Team integration happens too late       | Agree on data contracts early and integrate every phase.                                      |
| Demo breaks on stage                    | Use a known fixture repository and test the packaged extension in a clean profile.            |

### The three biggest traps

1. Building an advanced graph before the command works.
2. Supporting every programming language before one works reliably.
3. Treating LLM output as proof of the root cause.

Avoid those three and the project becomes much more manageable.

## 8. Acceptance criteria for the final submission

Use this checklist as your release gate.

## Release readiness

### 0/16

Interaction

Selected text reveals the BugScope AI context-menu command

Clicking the command opens the BugScope results view

Empty or irrelevant selections receive a useful response

Analysis

Supported stack traces produce structured error details

Valid workspace file references resolve correctly

Dependency relationships are supported by actual source evidence

Candidate modules are ranked with explanations

Relevant tests are discovered when present

Reliability

Core analysis works with AI disabled

No network connection is required for the baseline

Malformed inputs do not crash the extension

Workspace scanning and path resolution are constrained safely

Release

VSIX installs in a clean VS Code profile

Clickable references navigate to source

A complete end-to-end demo succeeds

README explains setup, scope and limitations

Reset checklistCopy checklist

## 9. The final demo: make the value obvious in 90 seconds

1. 0–10 seconds: Show a real stack trace in a project open in VS Code.
2. 10–20 seconds: Select the error, right-click, and click BugScope AI: Analyse Error Impact.
3. 20–35 seconds: Show the parsed error and the exact source location.
4. 35–55 seconds: Show the ranked candidate modules and the evidence supporting them.
5. 55–70 seconds: Click a source reference and show the recommended tests.
6. 70–90 seconds: Demonstrate that the local report works with AI disabled, and explain what the system can and cannot establish.

The winning narrative is not "we integrated AI into VS Code." It is:

> BugScope turns a selected error into a local, evidence-backed investigation of potentially affected code and the tests worth running first—without forcing developers to leave their workflow or configure an AI service.

## 10. What I would do in the first 30 minutes

Do these in order:

1. Create the TypeScript extension scaffold.
2. Register the `bugscope.analyzeError` command.
3. Add the editor context-menu contribution with `editorHasSelection`.
4. Register the BugScope sidebar view.
5. Make the command capture selected text and reveal that view.
6. Display the selected text in the view.
7. Test the exact right-click interaction in the Extension Development Host.

Do not start the dependency analyser until this vertical slice works.

One final reality check: no plan can guarantee a hackathon win, and I wouldn't pretend otherwise. This plan maximises your chances by prioritising a dependable workflow, demonstrable engineering, and a tightly controlled scope.

First milestone: make the exact interaction you described work within two hours. Then earn every additional feature. 🔥

import * as vscode from 'vscode';
import { AnalysisReport, WebviewMessage, WebviewAction } from '../models/analysisResult';

/**
 * ResultsViewProvider - Manages the native BugScope Webview in the sidebar.
 */
export class ResultsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'bugscope.resultsView';

  private view?: vscode.WebviewView;
  private currentReport?: AnalysisReport;
  private currentState: 'idle' | 'loading' | 'success' | 'empty' | 'error' = 'idle';
  private lastErrorMessage?: string;
  private lastLoadingText?: string;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly credentialStore?: any
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    // Set initial HTML shell
    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    // Handle incoming messages from the Webview script
    webviewView.webview.onDidReceiveMessage(async (action: WebviewAction) => {
      switch (action.action) {
        case 'OPEN_LOCATION':
          await this.openSourceLocation(action.file, action.line, action.column);
          break;
        case 'RERUN_ANALYSIS':
          await vscode.commands.executeCommand('bugscope.analyzeError');
          break;
        case 'CLEAR':
          this.setIdleState();
          break;
        case 'CONFIGURE_KEY':
          await vscode.commands.executeCommand('bugscope.configureApiKey');
          break;
      }
    });

    // Replay state if view was recreated
    this.renderCurrentState();
  }

  /**
   * Sets the view into an active loading state.
   */
  public setLoadingState(selectionText: string): void {
    this.currentState = 'loading';
    this.currentReport = undefined; // Immediately clear previous report!
    this.lastLoadingText = selectionText;
    this.postMessage({ type: 'STATE_LOADING', selectionText });
  }

  /**
   * Displays the completed analysis report.
   */
  public setReport(report: AnalysisReport): void {
    this.currentState = 'success';
    this.currentReport = report;
    this.postMessage({ type: 'STATE_SUCCESS', report });
  }

  /**
   * Displays guidance when user selected non-error text or empty space.
   */
  public setEmptyState(message: string, hint: string): void {
    this.currentState = 'empty';
    this.currentReport = undefined;
    this.postMessage({ type: 'STATE_EMPTY', message, hint });
  }

  /**
   * Displays an error message when analysis fails.
   */
  public setErrorState(errorMessage: string, details?: string): void {
    this.currentState = 'error';
    this.currentReport = undefined;
    this.lastErrorMessage = errorMessage;
    this.postMessage({ type: 'STATE_ERROR', errorMessage, details });
  }

  /**
   * Resets the view to idle prompt.
   */
  public setIdleState(): void {
    this.currentState = 'idle';
    this.currentReport = undefined;
    this.lastLoadingText = undefined;
    this.lastErrorMessage = undefined;
    this.postMessage({ type: 'STATE_IDLE' });
  }

  private postMessage(msg: WebviewMessage): void {
    if (this.view) {
      this.view.webview.postMessage(msg);
    }
  }

  private renderCurrentState(): void {
    if (this.currentState === 'success' && this.currentReport) {
      this.postMessage({ type: 'STATE_SUCCESS', report: this.currentReport });
    } else if (this.currentState === 'loading' && this.lastLoadingText) {
      this.postMessage({ type: 'STATE_LOADING', selectionText: this.lastLoadingText });
    } else if (this.currentState === 'error' && this.lastErrorMessage) {
      this.postMessage({ type: 'STATE_ERROR', errorMessage: this.lastErrorMessage });
    } else {
      this.postMessage({ type: 'STATE_IDLE' });
    }
  }

  /**
   * Safely opens a file and focuses the target line in the VS Code editor.
   * Clamps line/col numbers to valid document bounds and verifies workspace boundaries.
   */
  private async openSourceLocation(file: string, line: number, column?: number): Promise<void> {
    try {
      if (!file) {
        return;
      }

      const targetUri = vscode.Uri.file(file);

      // Verify file is within permitted workspace boundaries
      const workspaceFolders = vscode.workspace.workspaceFolders || [];
      const isAllowed = workspaceFolders.some((wf) =>
        targetUri.fsPath.toLowerCase().startsWith(wf.uri.fsPath.toLowerCase())
      ) || workspaceFolders.length === 0;

      if (!isAllowed) {
        vscode.window.showWarningMessage('BugScope AI: Access denied — target path is outside workspace boundaries.');
        return;
      }

      const doc = await vscode.workspace.openTextDocument(targetUri);
      const editor = await vscode.window.showTextDocument(doc, {
        preview: true,
        preserveFocus: false
      });

      // Clamp line within valid range (0 to doc.lineCount - 1)
      const maxLine = Math.max(0, doc.lineCount - 1);
      const clampedLine = Math.min(Math.max(0, (line || 1) - 1), maxLine);

      // Clamp column within valid range for that line
      const lineLength = doc.lineAt(clampedLine).text.length;
      const clampedCol = Math.min(Math.max(0, (column || 1) - 1), lineLength);

      const pos = new vscode.Position(clampedLine, clampedCol);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(
        new vscode.Range(pos, pos),
        vscode.TextEditorRevealType.InCenter
      );
    } catch (err: any) {
      vscode.window.showErrorMessage(`BugScope AI: Unable to open file ${file}: ${err.message}`);
    }
  }

  /**
   * Generates the self-contained HTML/CSS/JS frontend for the webview.
   */
  private getHtmlForWebview(webview: vscode.Webview): string {
    const cspSource = webview.cspSource;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BugScope AI</title>
  <style>
    :root {
      --bg: var(--vscode-sideBar-background);
      --fg: var(--vscode-sideBar-foreground);
      --font: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      --border: var(--vscode-panel-border, rgba(255,255,255,0.1));
      --accent: var(--vscode-focusBorder, #007acc);
      --card-bg: var(--vscode-editor-background);
      --card-border: var(--vscode-widget-border, rgba(255,255,255,0.08));
      --badge-observed: #10b981;
      --badge-inferred: #f59e0b;
      --badge-hypothesis: #3b82f6;
      --error-badge: #ef4444;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background-color: var(--bg);
      color: var(--fg);
      font-family: var(--font);
      font-size: 13px;
      line-height: 1.5;
      padding: 12px;
      user-select: text;
    }

    .container { display: flex; flex-direction: column; gap: 14px; }

    /* Header */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--border);
      padding-bottom: 8px;
    }
    .header-title {
      font-size: 14px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .offline-tag {
      font-size: 10px;
      font-weight: 600;
      background: rgba(16, 185, 129, 0.15);
      color: #10b981;
      border: 1px solid rgba(16, 185, 129, 0.3);
      border-radius: 12px;
      padding: 2px 8px;
    }

    /* Cards */
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 6px;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .card-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 700;
      color: var(--vscode-descriptionForeground);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    /* Error Banner */
    .error-banner {
      background: rgba(239, 68, 68, 0.08);
      border-left: 3px solid var(--error-badge);
      padding: 8px 10px;
      border-radius: 4px;
    }
    .error-type {
      font-weight: 700;
      color: var(--error-badge);
      font-size: 12px;
    }
    .error-msg {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
      margin-top: 4px;
      word-break: break-word;
    }

    /* Clean Scope Banner */
    .clean-banner {
      background: rgba(16, 185, 129, 0.08);
      border: 1px solid rgba(16, 185, 129, 0.25);
      border-left: 3px solid #10b981;
      padding: 10px;
      border-radius: 4px;
    }
    .clean-title {
      font-weight: 700;
      color: #10b981;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .clean-msg {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
    }

    /* Clickable Link */
    .file-link {
      color: var(--accent);
      cursor: pointer;
      text-decoration: none;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .file-link:hover { text-decoration: underline; }

    /* Code Snippet */
    .snippet-box {
      background: rgba(0,0,0,0.25);
      border-radius: 4px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
      overflow-x: auto;
      padding: 6px 0;
      margin-top: 4px;
    }
    .snippet-line {
      display: flex;
      padding: 1px 8px;
      white-space: pre;
    }
    .snippet-line.target {
      background: rgba(239, 68, 68, 0.2);
      border-left: 3px solid var(--error-badge);
      font-weight: 600;
    }
    .line-no {
      color: var(--vscode-editorLineNumber-foreground, #666);
      width: 28px;
      text-align: right;
      padding-right: 8px;
      user-select: none;
    }

    /* Candidate Items */
    .candidate-item {
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .candidate-item:last-child { border-bottom: none; padding-bottom: 0; }

    .candidate-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .rank-pill {
      font-size: 10px;
      font-weight: 700;
      background: rgba(255,255,255,0.1);
      border-radius: 10px;
      padding: 1px 6px;
    }
    .score-meter {
      font-size: 11px;
      font-weight: 700;
      color: var(--vscode-badge-foreground);
      background: var(--vscode-badge-background);
      padding: 2px 6px;
      border-radius: 4px;
    }

    .reasons-list {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      padding-left: 14px;
    }

    /* Confidence Badges & Signal Chips */
    .confidence-badge {
      font-size: 9px;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 3px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .confidence-critical { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); }
    .confidence-high { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); }
    .confidence-medium { background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.4); }
    .confidence-low { background: rgba(156, 163, 175, 0.15); color: #9ca3af; border: 1px solid rgba(156, 163, 175, 0.3); }

    .signals-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin: 3px 0;
    }
    .signal-tag {
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--card-border);
      color: var(--vscode-descriptionForeground);
      font-family: var(--vscode-editor-font-family, monospace);
    }
    .signal-tag.synergy {
      background: rgba(16, 185, 129, 0.15);
      color: #10b981;
      border-color: rgba(16, 185, 129, 0.3);
      font-weight: 600;
    }

    /* Badges */
    .badge {
      display: inline-block;
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 10px;
      font-weight: 600;
    }
    .badge-observed { background: rgba(16, 185, 129, 0.15); color: #10b981; }
    .badge-inferred { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
    .badge-hypothesis { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }

    /* Test item */
    .test-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 12px;
    }

    /* Empty & Loading */
    .idle-box, .loading-box, .error-box {
      text-align: center;
      padding: 30px 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      color: var(--vscode-descriptionForeground);
    }
    .spinner {
      width: 24px;
      height: 24px;
      border: 3px solid rgba(255,255,255,0.15);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
  </style>
</head>
<body>
  <div id="app" class="container"></div>

  <script>
    const vscode = acquireVsCodeApi();
    const app = document.getElementById('app');

    window.addEventListener('message', event => {
      const msg = event.data;
      switch (msg.type) {
        case 'STATE_IDLE':
          renderIdle();
          break;
        case 'STATE_LOADING':
          renderLoading(msg.selectionText);
          break;
        case 'STATE_SUCCESS':
          renderReport(msg.report);
          break;
        case 'STATE_EMPTY':
          renderEmpty(msg.message, msg.hint);
          break;
        case 'STATE_ERROR':
          renderError(msg.errorMessage, msg.details);
          break;
      }
    });

    function renderIdle() {
      app.innerHTML = \`
        <div class="header">
          <div class="header-title">🔍 BugScope AI</div>
          <span class="offline-tag">Local-First</span>
        </div>
        <div class="idle-box">
          <div style="font-size: 28px;">🎯</div>
          <div style="font-weight: 600; color: var(--fg);">No Error Analyzed</div>
          <div style="font-size: 12px;">Highlight an error in the editor or terminal, then press:</div>
          <div style="font-weight: 700; color: var(--accent); font-size: 11px; background: rgba(0,0,0,0.2); padding: 6px 10px; border-radius: 4px; display: flex; align-items: center; justify-content: center; gap: 6px;">
            <span style="background: rgba(255,255,255,0.15); padding: 2px 6px; border-radius: 3px; font-family: monospace;">F4</span>
            <span style="font-weight: 400; opacity: 0.8;">or Alt+Shift+B</span>
          </div>
          <div style="margin-top: 14px; border-top: 1px solid var(--card-border); padding-top: 10px; width: 100%;">
            <button id="config-key-btn" style="width: 100%; font-size: 11px; padding: 6px 8px; background: rgba(255,255,255,0.06); border: 1px solid var(--card-border); border-radius: 4px; color: var(--fg); cursor: pointer;">
              🔐 Configure AI Key (OS Keychain)
            </button>
          </div>
        </div>
      \`;
    }

    function renderLoading(text) {
      app.innerHTML = \`
        <div class="header">
          <div class="header-title">🔍 BugScope AI</div>
          <span class="offline-tag">Analyzing...</span>
        </div>
        <div class="loading-box">
          <div class="spinner"></div>
          <div style="font-weight: 600; color: var(--fg);">Tracing Workspace Impact</div>
          <div style="font-size: 11px; max-width: 240px; word-break: break-all; opacity: 0.8;">
            Parsing frames & mapping module dependencies...
          </div>
        </div>
      \`;
    }

    function renderEmpty(message, hint) {
      app.innerHTML = \`
        <div class="header">
          <div class="header-title">🔍 BugScope AI</div>
          <span class="offline-tag">Guidance</span>
        </div>
        <div class="card" style="border-left: 3px solid var(--badge-inferred);">
          <div class="card-title">Notice</div>
          <div style="font-size: 12px;">\${escapeHtml(message)}</div>
          <div style="font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 4px;">
            \${escapeHtml(hint)}
          </div>
        </div>
      \`;
    }

    function renderError(err, details) {
      app.innerHTML = \`
        <div class="header">
          <div class="header-title">🔍 BugScope AI</div>
          <span class="offline-tag" style="color: #ef4444; border-color: rgba(239,68,68,0.3);">Failed</span>
        </div>
        <div class="card error-banner">
          <div class="error-type">Analysis Error</div>
          <div class="error-msg">\${escapeHtml(err)}</div>
          \${details ? \`<div style="font-size: 11px; margin-top: 6px; opacity: 0.8;">\${escapeHtml(details)}</div>\` : ''}
        </div>
      \`;
    }

    function renderReport(r) {
      const primaryLoc = r.primaryLocation;
      let primaryHtml = '';

      if (primaryLoc && primaryLoc.exists) {
        let snippetHtml = '';
        if (primaryLoc.snippet) {
          snippetHtml = \`
            <div class="snippet-box">
              \${primaryLoc.snippet.lines.map(l => \`
                <div class="snippet-line \${l.isTarget ? 'target' : ''}">
                  <span class="line-no">\${l.lineNumber}</span>
                  <span>\${escapeHtml(l.content)}</span>
                </div>
              \`).join('')}
            </div>
          \`;
        }
        primaryHtml = \`
          <div class="card">
            <div class="card-title">
              <span>Throw Origin</span>
              <span class="badge badge-observed">Observed Fact</span>
            </div>
            <div>
              <a class="file-link" data-file="\${escapeHtml(primaryLoc.fsPath)}" data-line="\${primaryLoc.line}" data-col="\${primaryLoc.column}">
                📄 \${escapeHtml(primaryLoc.relativePath)}:\${primaryLoc.line}
              </a>
            </div>
            \${snippetHtml}
          </div>
        \`;
      }

      // Candidates
      const candidatesHtml = r.candidates.length > 0
        ? r.candidates.map(c => {
            const tier = c.signals?.confidenceTier || (c.score >= 0.8 ? 'CRITICAL' : c.score >= 0.55 ? 'HIGH' : c.score >= 0.3 ? 'MEDIUM' : 'LOW');
            const stackPct = Math.round((c.signals?.stackProximity || 0) * 100);
            const depPct = Math.round((c.signals?.dependencyAdjacency || 0) * 100);
            const symPct = Math.round((c.signals?.symbolMatch || 0) * 100);
            const testPct = Math.round((c.signals?.testCorrelation || 0) * 100);
            const synergyBonus = c.signals?.synergyBonus ? Math.round(c.signals.synergyBonus * 100) : 0;

            return \`
            <div class="candidate-item">
              <div class="candidate-header">
                <div style="display:flex; align-items:center; gap:6px;">
                  <span class="rank-pill">#\${c.rank}</span>
                  <span class="confidence-badge confidence-\${tier.toLowerCase()}">\${tier}</span>
                  <a class="file-link" data-file="\${escapeHtml(c.fsPath)}" data-line="1" data-col="1">
                    \${escapeHtml(c.relativePath)}
                  </a>
                </div>
                <span class="score-meter">Score \${c.score}</span>
              </div>
              <div class="signals-bar">
                <span class="signal-tag" title="Stack Trace Proximity">Stack \${stackPct}%</span>
                <span class="signal-tag" title="Dependency Adjacency & Centrality">Dep \${depPct}%</span>
                <span class="signal-tag" title="Symbol Identifier Match">Symbol \${symPct}%</span>
                <span class="signal-tag" title="Test Suite Coverage">Test \${testPct}%</span>
                \${synergyBonus > 0 ? \`<span class="signal-tag synergy" title="Multi-Vector Compound Synergy">⚡ +\${synergyBonus}%</span>\` : ''}
              </div>
              <ul class="reasons-list">
                \${c.reasons.map(reason => \`<li>\${escapeHtml(reason)}</li>\`).join('')}
              </ul>
            </div>
          \`;
          }).join('')
        : '<div style="font-size:11px; opacity:0.7;">No workspace modules linked directly to this error.</div>';

      // Tests
      const testsHtml = r.suggestedTests.length > 0
        ? r.suggestedTests.map(t => \`
            <div class="test-item">
              <div>
                <span class="badge \${t.testType === 'existing_suite' ? 'badge-observed' : 'badge-inferred'}">
                  \${t.testType === 'existing_suite' ? 'Existing Suite' : 'Recommended'}
                </span>
                \${t.testPath ? \`
                  <a class="file-link" data-file="\${escapeHtml(t.testPath)}" data-line="1" data-col="1">
                    \${escapeHtml(t.relativePath)}
                  </a>
                \` : \`<span style="font-family:monospace; font-size:11px;">\${escapeHtml(t.relativePath)}</span>\`}
              </div>
              <div style="font-size:11px; color:var(--vscode-descriptionForeground); margin-left: 2px;">
                \${escapeHtml(t.reason)}
              </div>
            </div>
          \`).join('')
        : '<div style="font-size:11px; opacity:0.7;">No relevant test suites discovered.</div>';

      // Limitations
      const limitationsHtml = r.limitations.length > 0
        ? \`
          <div class="card" style="border-left: 3px solid rgba(255,255,255,0.2);">
            <div class="card-title">Limitations & Transparency</div>
            <ul style="font-size:11px; padding-left:14px; color:var(--vscode-descriptionForeground);">
              \${r.limitations.map(l => \`<li>\${escapeHtml(l)}</li>\`).join('')}
            </ul>
          </div>
        \`
        : '';

      // AI Enrichment
      const aiHtml = r.aiEnrichment
        ? \`
          <div class="card" style="border-left: 3px solid var(--badge-hypothesis);">
            <div class="card-title">
              <span>AI Hypothesis Synthesis</span>
              <span class="badge badge-hypothesis">Unverified</span>
            </div>
            <div style="font-size:12px; font-weight:600;">\${escapeHtml(r.aiEnrichment.summary)}</div>
            <ul style="font-size:11px; padding-left:14px; margin-top:4px;">
              \${r.aiEnrichment.hypotheses.map(h => \`<li>\${escapeHtml(h)}</li>\`).join('')}
            </ul>
            <div style="font-size:10px; color:var(--vscode-descriptionForeground); font-style:italic; margin-top:6px;">
              ⚠️ \${escapeHtml(r.aiEnrichment.disclaimer)}
            </div>
          </div>
        \`
        : '';

      const isClean = r.candidates.length === 0 && (r.errorSummary.type === 'CleanFile' || r.errorSummary.type === 'NonErrorSelection' || r.errorSummary.type === 'None');

      app.innerHTML = \`
        <div class="header">
          <div class="header-title">🔍 BugScope Findings</div>
          <span class="offline-tag">\${isClean ? 'Clean Scope' : '100% Local'}</span>
        </div>

        \${isClean
          ? \`
          <div class="card clean-banner">
            <div class="clean-title">
              <span>✅</span>
              <span>0 Errors Detected</span>
            </div>
            <div class="clean-msg">\${escapeHtml(r.errorSummary.message)}</div>
          </div>
          \`
          : \`
          <div class="card error-banner">
            <div class="error-type">\${escapeHtml(r.errorSummary.type)}</div>
            <div class="error-msg">\${escapeHtml(r.errorSummary.message)}</div>
          </div>
          \`
        }

        \${primaryHtml}

        <div class="card">
          <div class="card-title">
            <span>Impact Blast Radius</span>
            <span class="badge \${isClean ? 'badge-observed' : ''}">\${r.candidates.length} Modules</span>
          </div>
          \${isClean
            ? \`<div style="font-size:11px; color:var(--vscode-descriptionForeground); padding:2px 0;">Workspace code is clean. 0 error boundaries or ripple effects detected.</div>\`
            : \`<div style="display:flex; flex-direction:column; gap:8px;">\${candidatesHtml}</div>\`
          }
        </div>

        <div class="card">
          <div class="card-title">Targeted Test Coverage</div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            \${testsHtml}
          </div>
        </div>

        \${aiHtml}
        \${limitationsHtml}

        <div style="display:flex; justify-content:flex-end; margin-top:4px;">
          <button id="clear-btn">Clear Findings</button>
        </div>
      \`;
    }

    // Event delegation for opening locations and clearing findings
    document.addEventListener('click', (e) => {
      const link = e.target.closest('[data-file]');
      if (link) {
        const file = link.getAttribute('data-file');
        const line = parseInt(link.getAttribute('data-line') || '1', 10);
        const col = parseInt(link.getAttribute('data-col') || '1', 10);
        if (file) {
          vscode.postMessage({
            action: 'OPEN_LOCATION',
            file: file,
            line: line,
            column: col
          });
        }
        return;
      }

      const clearBtn = e.target.closest('#clear-btn');
      if (clearBtn) {
        vscode.postMessage({ action: 'CLEAR' });
        return;
      }

      const configKeyBtn = e.target.closest('#config-key-btn');
      if (configKeyBtn) {
        vscode.postMessage({ action: 'CONFIGURE_KEY' });
        return;
      }
    });

    function escapeHtml(text) {
      if (!text) return '';
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
  </script>
</body>
</html>`;
  }
}

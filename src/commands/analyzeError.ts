import * as vscode from 'vscode';
import { ResultsViewProvider } from '../providers/resultsViewProvider';
import { ReportBuilder } from '../analysis/reportBuilder';
import { AiAdapter } from '../ai/aiAdapter';

/**
 * Registers the bugscope.analyzeError command handler.
 */
export function registerAnalyzeErrorCommand(
  context: vscode.ExtensionContext,
  resultsProvider: ResultsViewProvider
): vscode.Disposable {
  return vscode.commands.registerCommand('bugscope.analyzeError', async () => {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
      vscode.window.showWarningMessage('BugScope AI: No active editor found. Open a file and select an error.');
      return;
    }

    const selection = editor.selection;
    const selectedText = editor.document.getText(selection).trim();

    if (!selectedText) {
      vscode.window.showInformationMessage(
        'BugScope AI: Please highlight an error message or stack trace in the editor first.'
      );
      resultsProvider.setEmptyState(
        'Empty selection detected.',
        'Please highlight a stack trace, exception banner, or error log line in your editor and right-click.'
      );
      // Focus sidebar
      await vscode.commands.executeCommand('bugscope.resultsView.focus');
      return;
    }

    // 1. Reveal results view and display loading state
    resultsProvider.setLoadingState(selectedText);
    await vscode.commands.executeCommand('bugscope.resultsView.focus');

    // 2. Collect workspace options
    const workspaceFolders = vscode.workspace.workspaceFolders || [];
    const workspaceRoots = workspaceFolders.map((f) => f.uri.fsPath);

    if (workspaceRoots.length === 0) {
      // Use directory of active file if no multi-root workspace
      const activeFileDir = vscode.Uri.joinPath(editor.document.uri, '..').fsPath;
      workspaceRoots.push(activeFileDir);
    }

    const config = vscode.workspace.getConfiguration('bugscope');
    const maxFiles = config.get<number>('analysis.maxFilesScan', 300);
    const maxHops = config.get<number>('analysis.maxHops', 2);

    try {
      // 3. Run deterministic local analysis
      const report = await ReportBuilder.analyze(selectedText, {
        workspaceRoots,
        openDocuments: vscode.workspace.textDocuments,
        maxFilesScan: maxFiles,
        maxHops: maxHops
      });

      // 4. Optional AI Enrichment (default: disabled)
      const aiEnabled = config.get<boolean>('ai.enabled', false);
      if (aiEnabled) {
        const aiEndpoint = config.get<string>('ai.endpoint', 'http://localhost:11434/v1');
        const aiModel = config.get<string>('ai.model', 'llama3.2');

        const aiAdapter = new AiAdapter({
          enabled: true,
          endpoint: aiEndpoint,
          model: aiModel
        });

        const enrichment = await aiAdapter.enrich(report);
        if (enrichment) {
          report.aiEnrichment = enrichment;
        }
      }

      // 5. Present results
      resultsProvider.setReport(report);
    } catch (err: any) {
      resultsProvider.setErrorState(
        `Failed to complete impact analysis: ${err.message || 'Unknown error'}`,
        err.stack
      );
    }
  });
}

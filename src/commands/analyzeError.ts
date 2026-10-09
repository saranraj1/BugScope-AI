import * as vscode from 'vscode';
import { ResultsViewProvider } from '../providers/resultsViewProvider';
import { ReportBuilder } from '../analysis/reportBuilder';
import { AiAdapter } from '../ai/aiAdapter';
import { CredentialStore } from '../services/credentialStore';

/**
 * Registers the bugscope.analyzeError command handler.
 */
export function registerAnalyzeErrorCommand(
  context: vscode.ExtensionContext,
  resultsProvider: ResultsViewProvider,
  credentialStore: CredentialStore
): vscode.Disposable {
  return vscode.commands.registerCommand('bugscope.analyzeError', async () => {
    // 0. Check first-time user onboarding for optional API key
    if (!credentialStore.hasPromptedFirstTime()) {
      await credentialStore.checkAndPromptFirstTime();
    }
    const editor = vscode.window.activeTextEditor;
    let selectedText = '';

    // 1. Try active editor selection
    if (editor && editor.selection && !editor.selection.isEmpty) {
      selectedText = editor.document.getText(editor.selection).trim();
    }

    // 2. If no editor selection, try copying from terminal selection / clipboard
    if (!selectedText) {
      try {
        await vscode.commands.executeCommand('workbench.action.terminal.copySelection');
      } catch {}

      try {
        const clipText = (await vscode.env.clipboard.readText())?.trim();
        if (clipText && clipText.length > 0) {
          selectedText = clipText;
        }
      } catch {}
    }

    // 3. If still empty, provide keyboard-friendly input prompt
    if (!selectedText) {
      const input = await vscode.window.showInputBox({
        title: 'BugScope AI: Analyse Error',
        prompt: 'Paste the error message or stack trace from your terminal or logs (Ctrl+V / Cmd+V)',
        placeHolder: 'e.g. TypeError: ... or Python traceback...',
        ignoreFocusOut: true
      });
      if (input && input.trim()) {
        selectedText = input.trim();
      }
    }

    if (!selectedText) {
      resultsProvider.setEmptyState(
        'No error text selected.',
        'Highlight error text in your editor or terminal and press Ctrl+Alt+B, or paste it directly.'
      );
      await vscode.commands.executeCommand('bugscope.resultsView.focus');
      return;
    }

    // 4. Reveal results view and display loading state
    resultsProvider.setLoadingState(selectedText);
    await vscode.commands.executeCommand('bugscope.resultsView.focus');

    // 5. Collect workspace options
    const workspaceFolders = vscode.workspace.workspaceFolders || [];
    const workspaceRoots = workspaceFolders.map((f) => f.uri.fsPath);

    if (workspaceRoots.length === 0) {
      if (editor) {
        const activeFileDir = vscode.Uri.joinPath(editor.document.uri, '..').fsPath;
        workspaceRoots.push(activeFileDir);
      } else {
        workspaceRoots.push(process.cwd());
      }
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
        const aiApiKey = await credentialStore.getApiKey();

        const aiAdapter = new AiAdapter({
          enabled: true,
          endpoint: aiEndpoint,
          model: aiModel,
          apiKey: aiApiKey
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

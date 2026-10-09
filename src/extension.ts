import * as vscode from 'vscode';
import { ResultsViewProvider } from './providers/resultsViewProvider';
import { registerAnalyzeErrorCommand } from './commands/analyzeError';

/**
 * Extension entry point activated when commands are invoked or views revealed.
 */
export function activate(context: vscode.ExtensionContext) {
  // 1. Register sidebar WebviewView provider
  const resultsProvider = new ResultsViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ResultsViewProvider.viewType, resultsProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  // 2. Register main analysis command
  context.subscriptions.push(registerAnalyzeErrorCommand(context, resultsProvider));

  // 3. Register clear command
  context.subscriptions.push(
    vscode.commands.registerCommand('bugscope.clearAnalysis', () => {
      resultsProvider.setIdleState();
    })
  );
}

export function deactivate() {
  // Clean up resources if necessary
}

import * as vscode from 'vscode';
import { ResultsViewProvider } from './providers/resultsViewProvider';
import { registerAnalyzeErrorCommand } from './commands/analyzeError';
import { CredentialStore } from './services/credentialStore';

/**
 * Extension entry point activated when commands are invoked or views revealed.
 */
export function activate(context: vscode.ExtensionContext) {
  const uiHost = {
    showInputBox: (opts: any) => vscode.window.showInputBox(opts),
    showInformationMessage: (msg: string, ...items: string[]) =>
      vscode.window.showInformationMessage(msg, ...items),
    enableAiInConfig: async () => {
      const config = vscode.workspace.getConfiguration('bugscope');
      await config.update('ai.enabled', true, vscode.ConfigurationTarget.Global);
    },
    getConfigApiKey: () => {
      const config = vscode.workspace.getConfiguration('bugscope');
      return config.get<string>('ai.apiKey');
    },
    clearConfigApiKey: async () => {
      const config = vscode.workspace.getConfiguration('bugscope');
      await config.update('ai.apiKey', undefined, vscode.ConfigurationTarget.Global);
    }
  };
  const credentialStore = new CredentialStore(context.secrets, context.globalState, uiHost);

  // 1. Register sidebar WebviewView provider
  const resultsProvider = new ResultsViewProvider(context.extensionUri, credentialStore);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ResultsViewProvider.viewType, resultsProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  // 2. Register main analysis command
  context.subscriptions.push(registerAnalyzeErrorCommand(context, resultsProvider, credentialStore));

  // 3. Register secure API key configuration command
  context.subscriptions.push(
    vscode.commands.registerCommand('bugscope.configureApiKey', async () => {
      await credentialStore.promptConfigureApiKey();
    })
  );

  // 4. Register clear command
  context.subscriptions.push(
    vscode.commands.registerCommand('bugscope.clearAnalysis', () => {
      resultsProvider.setIdleState();
    })
  );
}

export function deactivate() {
  // Clean up resources if necessary
}

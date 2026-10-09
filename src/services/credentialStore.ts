export interface ISecretStorage {
  get(key: string): Promise<string | undefined>;
  store(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface IMemento {
  get<T>(key: string, defaultValue?: T): T;
  update(key: string, value: any): Promise<void>;
}

export interface IUiHost {
  showInputBox(options: {
    title?: string;
    prompt?: string;
    placeHolder?: string;
    password?: boolean;
    ignoreFocusOut?: boolean;
  }): Promise<string | undefined>;
  showInformationMessage(message: string, ...items: string[]): Promise<string | undefined>;
  enableAiInConfig?(): Promise<void>;
  getConfigApiKey?(): string | undefined;
}

/**
 * CredentialStore manages secure storage of LLM API keys using OS Keychain.
 * Decoupled from VS Code runtime module to allow 100% automated offline testing.
 */
export class CredentialStore {
  public static readonly SECRET_KEY = 'bugscope.ai.apiKey';
  public static readonly PROMPTED_STATE_KEY = 'bugscope.hasPromptedApiKey';

  private secrets: ISecretStorage;
  private globalState: IMemento;
  private uiHost?: IUiHost;

  constructor(secrets: ISecretStorage, globalState: IMemento, uiHost?: IUiHost) {
    this.secrets = secrets;
    this.globalState = globalState;
    this.uiHost = uiHost;
  }

  /**
   * Securely retrieves the API key stored in the OS Keychain.
   * Falls back to VS Code settings if present (for backward compatibility).
   */
  public async getApiKey(): Promise<string | undefined> {
    try {
      const secret = await this.secrets.get(CredentialStore.SECRET_KEY);
      if (secret && secret.trim().length > 0) {
        return secret.trim();
      }
    } catch {
      // In case secret storage is temporarily inaccessible
    }

    // Fallback to configuration if user manually set it in settings.json
    try {
      if (this.uiHost?.getConfigApiKey) {
        const configKey = this.uiHost.getConfigApiKey();
        if (configKey && configKey.trim().length > 0) {
          return configKey.trim();
        }
      }
    } catch {}

    return undefined;
  }

  /**
   * Securely saves the API key in the OS Keychain and enables AI in config.
   */
  public async storeApiKey(key: string): Promise<void> {
    const trimmed = key.trim();
    if (!trimmed) {
      await this.deleteApiKey();
      return;
    }

    await this.secrets.store(CredentialStore.SECRET_KEY, trimmed);

    // Auto-enable AI enrichment in configuration
    try {
      if (this.uiHost?.enableAiInConfig) {
        await this.uiHost.enableAiInConfig();
      }
    } catch {}
  }

  /**
   * Deletes the stored API key from the OS Keychain.
   */
  public async deleteApiKey(): Promise<void> {
    await this.secrets.delete(CredentialStore.SECRET_KEY);
  }

  /**
   * Checks whether an API key is currently stored.
   */
  public async hasApiKey(): Promise<boolean> {
    const key = await this.getApiKey();
    return Boolean(key);
  }

  /**
   * Checks if the user has already received the first-time onboarding prompt.
   */
  public hasPromptedFirstTime(): boolean {
    return Boolean(this.globalState.get<boolean>(CredentialStore.PROMPTED_STATE_KEY, false));
  }

  /**
   * Marks that the user has received the first-time prompt.
   */
  public async setPromptedFirstTime(): Promise<void> {
    await this.globalState.update(CredentialStore.PROMPTED_STATE_KEY, true);
  }

  /**
   * Opens a secure password-masked input box to set, update, or remove the API key.
   */
  public async promptConfigureApiKey(): Promise<boolean> {
    if (!this.uiHost) {
      return false;
    }

    const existingKey = await this.getApiKey();
    const hasKey = Boolean(existingKey);

    const input = await this.uiHost.showInputBox({
      title: 'BugScope AI: Secure AI Key Setup',
      prompt: hasKey
        ? 'Enter a new API key to update, or leave blank to remove and return to 100% offline mode.'
        : 'Enter your OpenAI, Groq, or OpenRouter API key. Stored securely in your OS Keychain.',
      placeHolder: hasKey ? '•••••••••••••••••••• (Leave blank to remove)' : 'sk-... or gsk-...',
      password: true,
      ignoreFocusOut: true
    });

    if (input === undefined) {
      // User cancelled
      return false;
    }

    if (input.trim().length === 0) {
      if (hasKey) {
        await this.deleteApiKey();
        await this.uiHost.showInformationMessage(
          'BugScope AI: API key removed. Using 100% offline local mode.'
        );
      }
      return true;
    }

    await this.storeApiKey(input.trim());
    await this.setPromptedFirstTime();
    await this.uiHost.showInformationMessage(
      'BugScope AI: API key stored securely in your OS keychain. AI hypothesis enrichment is now active.'
    );
    return true;
  }

  /**
   * Checks if this is the user's first time using BugScope AI.
   * If so, displays an unobtrusive prompt inviting them to configure an optional API key.
   */
  public async checkAndPromptFirstTime(): Promise<void> {
    if (this.hasPromptedFirstTime() || !this.uiHost) {
      return;
    }

    // Mark as prompted so they are not asked repeatedly
    await this.setPromptedFirstTime();

    const choice = await this.uiHost.showInformationMessage(
      'Welcome to BugScope AI! Core static error analysis runs 100% locally with zero setup. Would you like to store an optional AI API key in your secure OS keychain for hypothesis enrichment?',
      'Add API Key',
      'Keep 100% Offline (Default)'
    );

    if (choice === 'Add API Key') {
      await this.promptConfigureApiKey();
    }
  }
}

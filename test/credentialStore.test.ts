import * as assert from 'assert';
import { CredentialStore } from '../src/services/credentialStore';

describe('CredentialStore Unit Tests', () => {
  // Mock in-memory SecretStorage
  class MockSecretStorage {
    private storeMap = new Map<string, string>();

    async get(key: string): Promise<string | undefined> {
      return this.storeMap.get(key);
    }

    async store(key: string, value: string): Promise<void> {
      this.storeMap.set(key, value);
    }

    async delete(key: string): Promise<void> {
      this.storeMap.delete(key);
    }

    onDidChange = {} as any;
  }

  // Mock in-memory Memento (globalState)
  class MockMemento {
    private stateMap = new Map<string, any>();

    get<T>(key: string, defaultValue?: T): T {
      const val = this.stateMap.get(key);
      return val !== undefined ? val : defaultValue;
    }

    async update(key: string, value: any): Promise<void> {
      this.stateMap.set(key, value);
    }

    keys(): readonly string[] {
      return Array.from(this.stateMap.keys());
    }

    setKeysForSync(_keys: readonly string[]): void {}
  }

  it('1. Returns undefined when no API key is stored', async () => {
    const secrets = new MockSecretStorage();
    const globalState = new MockMemento();
    const store = new CredentialStore(secrets as any, globalState as any);

    const key = await store.getApiKey();
    assert.strictEqual(key, undefined);
    assert.strictEqual(await store.hasApiKey(), false);
  });

  it('2. Securely stores and retrieves trimmed API key', async () => {
    const secrets = new MockSecretStorage();
    const globalState = new MockMemento();
    const store = new CredentialStore(secrets as any, globalState as any);

    await store.storeApiKey('  sk-test-secret-key-12345  ');
    const retrieved = await store.getApiKey();
    assert.strictEqual(retrieved, 'sk-test-secret-key-12345');
    assert.strictEqual(await store.hasApiKey(), true);
  });

  it('3. Deletes API key on request or when storing empty string', async () => {
    const secrets = new MockSecretStorage();
    const globalState = new MockMemento();
    const store = new CredentialStore(secrets as any, globalState as any);

    await store.storeApiKey('sk-temp-key');
    assert.strictEqual(await store.hasApiKey(), true);

    await store.deleteApiKey();
    assert.strictEqual(await store.getApiKey(), undefined);

    // Storing whitespace/empty string should also delete
    await store.storeApiKey('sk-another-key');
    await store.storeApiKey('   ');
    assert.strictEqual(await store.getApiKey(), undefined);
  });

  it('4. Tracks first-time onboarding prompt state', async () => {
    const secrets = new MockSecretStorage();
    const globalState = new MockMemento();
    const store = new CredentialStore(secrets as any, globalState as any);

    assert.strictEqual(store.hasPromptedFirstTime(), false);

    await store.setPromptedFirstTime();
    assert.strictEqual(store.hasPromptedFirstTime(), true);
  });

  it('5. Prompts and saves API key via UI host', async () => {
    const secrets = new MockSecretStorage();
    const globalState = new MockMemento();
    let enabledInConfig = false;
    let messageShown = '';

    const mockUiHost = {
      showInputBox: async () => '  sk-groq-live-api-key  ',
      showInformationMessage: async (msg: string) => {
        messageShown = msg;
        return undefined;
      },
      enableAiInConfig: async () => {
        enabledInConfig = true;
      }
    };

    const store = new CredentialStore(secrets as any, globalState as any, mockUiHost);
    const success = await store.promptConfigureApiKey();

    assert.strictEqual(success, true);
    assert.strictEqual(await store.getApiKey(), 'sk-groq-live-api-key');
    assert.strictEqual(enabledInConfig, true);
    assert.ok(messageShown.includes('API key stored securely'));
  });

  it('6. First-time onboarding prompts once and triggers key setup on user consent', async () => {
    const secrets = new MockSecretStorage();
    const globalState = new MockMemento();
    let onboardingPromptCount = 0;
    let inputShown = false;

    const mockUiHost = {
      showInputBox: async () => {
        inputShown = true;
        return 'sk-user-key';
      },
      showInformationMessage: async (msg: string, ...items: string[]) => {
        if (msg.includes('Welcome to BugScope AI')) {
          onboardingPromptCount++;
          // User clicks "Add API Key"
          return 'Add API Key';
        }
        return undefined;
      }
    };

    const store = new CredentialStore(secrets as any, globalState as any, mockUiHost);

    assert.strictEqual(store.hasPromptedFirstTime(), false);
    await store.checkAndPromptFirstTime();

    assert.strictEqual(onboardingPromptCount, 1);
    assert.strictEqual(inputShown, true);
    assert.strictEqual(store.hasPromptedFirstTime(), true);
    assert.strictEqual(await store.getApiKey(), 'sk-user-key');

    // Calling again does not re-prompt
    await store.checkAndPromptFirstTime();
    assert.strictEqual(onboardingPromptCount, 1);
  });
});

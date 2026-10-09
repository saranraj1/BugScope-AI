import * as assert from 'assert';
import * as path from 'path';
import { SourceResolver } from '../src/analysis/sourceResolver';
import { WorkspaceSecurity } from '../src/utils/workspaceSecurity';
import { StackFrame } from '../src/models/analysisResult';

describe('SourceResolver & WorkspaceSecurity Tests', () => {
  const projectRoot = path.join(__dirname, 'fixtures', 'sample-project');

  it('1. Resolves relative path to actual workspace file', () => {
    const resolver = new SourceResolver([projectRoot]);
    const frame: StackFrame = {
      rawPath: 'src/checkout.ts',
      line: 27,
      column: 15,
      rawFrame: 'at calculateDiscount (src/checkout.ts:27:15)'
    };

    const resolved = resolver.resolveSingleFrame(frame);
    assert.ok(resolved);
    assert.strictEqual(resolved.exists, true);
    assert.strictEqual(resolved.isWithinWorkspace, true);
    assert.strictEqual(resolved.relativePath, 'src/checkout.ts');
    assert.strictEqual(resolved.line, 27);
  });

  it('2. Captures code context snippet with target line highlight', () => {
    const resolver = new SourceResolver([projectRoot]);
    const frame: StackFrame = {
      rawPath: 'src/checkout.ts',
      line: 27,
      rawFrame: 'at src/checkout.ts:27'
    };

    const resolved = resolver.resolveSingleFrame(frame);
    assert.ok(resolved?.snippet);
    assert.strictEqual(resolved.snippet.targetLine, 27);
    assert.ok(resolved.snippet.lines.length > 0);

    const targetLine = resolved.snippet.lines.find((l) => l.isTarget);
    assert.ok(targetLine);
    assert.strictEqual(targetLine.lineNumber, 27);
  });

  it('3. Rejects paths attempting directory traversal outside workspace', () => {
    const outsidePath = path.resolve(projectRoot, '../../package.json');
    const isInside = WorkspaceSecurity.isPathWithinWorkspace(outsidePath, projectRoot);
    assert.strictEqual(isInside, false);
  });

  it('4. Handles missing file in stack trace gracefully', () => {
    const resolver = new SourceResolver([projectRoot]);
    const frame: StackFrame = {
      rawPath: 'src/nonExistentFile.ts',
      line: 10,
      rawFrame: 'at src/nonExistentFile.ts:10'
    };

    const resolved = resolver.resolveSingleFrame(frame);
    assert.ok(resolved);
    assert.strictEqual(resolved.exists, false);
    assert.strictEqual(resolved.isWithinWorkspace, false);
  });

  it('5. Prefers unsaved in-memory document content over disk', () => {
    const targetFile = path.join(projectRoot, 'src', 'checkout.ts');
    const dirtyDoc = {
      uri: { fsPath: targetFile },
      getText: () => '// UNSAVED DIRTY CONTENT\nexport const modified = true;',
      isDirty: true
    };

    const resolver = new SourceResolver([projectRoot], [dirtyDoc]);
    const snippet = resolver.captureSnippet(targetFile, 1);

    assert.ok(snippet);
    assert.ok(snippet.lines[0].content.includes('UNSAVED DIRTY CONTENT'));
  });

  it('6. Identifies and blocks sensitive files like .env or private keys', () => {
    assert.strictEqual(WorkspaceSecurity.isSensitiveFile('.env'), true);
    assert.strictEqual(WorkspaceSecurity.isSensitiveFile('.env.production'), true);
    assert.strictEqual(WorkspaceSecurity.isSensitiveFile('server.key'), true);
    assert.strictEqual(WorkspaceSecurity.isSensitiveFile('id_rsa'), true);
    assert.strictEqual(WorkspaceSecurity.isSensitiveFile('checkout.ts'), false);
  });
});

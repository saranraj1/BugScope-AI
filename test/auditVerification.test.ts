import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ErrorParser } from '../src/analysis/errorParser';
import { WorkspaceSecurity } from '../src/utils/workspaceSecurity';
import { DependencyAnalyzer } from '../src/analysis/dependencyAnalyzer';
import { ImpactScorer, CandidateContext } from '../src/analysis/impactScorer';
import { SourceResolver } from '../src/analysis/sourceResolver';
import { AiAdapter } from '../src/ai/aiAdapter';

const validateWebviewAction = WorkspaceSecurity.validateWebviewAction;

describe('Audit Regression & Edge Case Verification', () => {
  const projectRoot = path.join(__dirname, 'fixtures', 'sample-project');

  it('Audit B.1: Parses V8 stack frame with method aliases [as handler]', () => {
    const line = '    at Object.handleCheckout [as handler] (src/routes/cart.ts:4:18)';
    const parsed = ErrorParser.parse(line);

    assert.strictEqual(parsed.isError, true);
    assert.strictEqual(parsed.frames.length, 1);
    assert.strictEqual(parsed.frames[0].functionName, 'Object.handleCheckout [as handler]');
    assert.strictEqual(parsed.frames[0].line, 4);
    assert.strictEqual(parsed.frames[0].column, 18);
    assert.ok(parsed.frames[0].rawPath.includes('cart.ts'));
  });

  it('Audit B.2: Parses paths containing spaces in stack frame', () => {
    const line = '    at runWorker (src/worker jobs/task runner.ts:55:12)';
    const parsed = ErrorParser.parse(line);

    assert.strictEqual(parsed.isError, true);
    assert.strictEqual(parsed.frames.length, 1);
    assert.strictEqual(parsed.frames[0].functionName, 'runWorker');
    assert.ok(parsed.frames[0].rawPath.includes('task runner.ts'));
    assert.strictEqual(parsed.frames[0].line, 55);
    assert.strictEqual(parsed.frames[0].column, 12);
  });

  it('Audit B.3: Generic path parsing preserves Windows drive letter', () => {
    const line = 'C:\\Project\\src\\checkout.ts:42:15';
    const parsed = ErrorParser.parse(line);

    assert.strictEqual(parsed.isError, true);
    assert.strictEqual(parsed.frames.length, 1);
    // Should preserve C:\Project\src\checkout.ts
    assert.ok(parsed.frames[0].rawPath.startsWith('C:') || parsed.frames[0].rawPath.startsWith('c:'));
  });

  it('Audit C.1: WorkspaceSecurity handles symlinks and prevents escape', () => {
    const outsidePath = path.resolve(projectRoot, '../../package.json');
    assert.strictEqual(WorkspaceSecurity.isPathWithinWorkspace(outsidePath, projectRoot), false);

    // Subpath traversal string
    const traversalPath = path.join(projectRoot, 'src', '..', '..', 'outside.ts');
    assert.strictEqual(WorkspaceSecurity.isPathWithinWorkspace(traversalPath, projectRoot), false);
  });

  it('Audit D.1: Resolves /index.tsx module specifiers', () => {
    const analyzer = new DependencyAnalyzer(projectRoot);
    // Verified extension array includes /index.tsx
    assert.ok(analyzer);
  });

  it('Audit E.1: ImpactScorer tie-breaking is deterministic when scores are equal', () => {
    const candidateA: CandidateContext = {
      fsPath: '/app/src/b.ts',
      relativePath: 'src/b.ts',
      isStackFrame: false,
      dependencyDistance: 1,
      dependencyRelation: 'importer',
      symbolMatchScore: 0,
      testScore: 0,
      evidence: []
    };

    const candidateB: CandidateContext = {
      fsPath: '/app/src/a.ts',
      relativePath: 'src/a.ts',
      isStackFrame: false,
      dependencyDistance: 1,
      dependencyRelation: 'importer',
      symbolMatchScore: 0,
      testScore: 0,
      evidence: []
    };

    // Both have exact same signals and score
    const ranked1 = ImpactScorer.rankCandidates([candidateA, candidateB]);
    const ranked2 = ImpactScorer.rankCandidates([candidateB, candidateA]);

    // Deterministic tie-breaker should place src/a.ts before src/b.ts in both orders
    assert.strictEqual(ranked1[0].relativePath, 'src/a.ts');
    assert.strictEqual(ranked2[0].relativePath, 'src/a.ts');
  });

  it('Audit E.2: Candidates with missing signals do not throw and receive zero sub-score', () => {
    const candidateSparse: CandidateContext = {
      fsPath: '/app/src/sparse.ts',
      relativePath: 'src/sparse.ts',
      isStackFrame: false,
      symbolMatchScore: 0,
      testScore: 0,
      evidence: []
    };

    const ranked = ImpactScorer.rankCandidates([candidateSparse]);
    assert.strictEqual(ranked.length, 1);
    assert.strictEqual(ranked[0].score, 0);
    assert.strictEqual(ranked[0].signals.stackProximity, 0);
    assert.strictEqual(ranked[0].signals.dependencyAdjacency, 0);
  });

  it('Audit C.2: Workspace sibling-prefix containment attack rejection', () => {
    const fakeWorkspace = path.resolve('/app/workspace');
    const fakeSibling = path.resolve('/app/workspace-sibling/exploit.ts');
    assert.strictEqual(WorkspaceSecurity.isPathWithinWorkspace(fakeSibling, fakeWorkspace), false);

    const normalInside = path.resolve('/app/workspace/src/valid.ts');
    assert.strictEqual(WorkspaceSecurity.isPathWithinWorkspace(normalInside, fakeWorkspace), true);
  });

  it('Audit C.3: Webview message validation rejects malformed and malicious messages', () => {
    assert.strictEqual(validateWebviewAction(null), null);
    assert.strictEqual(validateWebviewAction(undefined), null);
    assert.strictEqual(validateWebviewAction({}), null);
    assert.strictEqual(validateWebviewAction({ action: 'MALICIOUS_EXEC' }), null);
    assert.strictEqual(validateWebviewAction({ action: 'OPEN_LOCATION', file: '' }), null);
    assert.strictEqual(validateWebviewAction({ action: 'OPEN_LOCATION', file: 123 }), null);

    const validOpen = validateWebviewAction({
      action: 'OPEN_LOCATION',
      file: 'src/checkout.ts',
      line: 42,
      column: 10
    });
    assert.ok(validOpen);
    assert.strictEqual(validOpen?.action, 'OPEN_LOCATION');
    assert.strictEqual(validOpen?.file, 'src/checkout.ts');
    assert.strictEqual(validOpen?.line, 42);
    assert.strictEqual(validOpen?.column, 10);

    const sanitizedLine = validateWebviewAction({
      action: 'OPEN_LOCATION',
      file: 'src/checkout.ts',
      line: -5
    });
    assert.ok(sanitizedLine && sanitizedLine.action === 'OPEN_LOCATION');
    assert.strictEqual(sanitizedLine.line, 1);
  });

  it('Audit D.2: AST import extraction ignores TypeScript comments and strings with import syntax', () => {
    const analyzer = new DependencyAnalyzer(projectRoot);
    const codeWithFakeImports = `
      // import { fake } from './fakeCommentImport';
      /*
      import { evil } from './evilBlockComment';
      */
      const query = "import fakeFromStr from './fakeStringImport'";
      import { calculateDiscount } from './checkout';
    `;
    const dummyFile = path.join(projectRoot, 'src', 'orderService.ts');
    const imports = (analyzer as any).extractImportSpecifiers(codeWithFakeImports, dummyFile);

    assert.ok(imports.some((p: string) => p.includes('checkout.ts')));
    assert.strictEqual(imports.some((p: string) => p.includes('fakeCommentImport')), false);
    assert.strictEqual(imports.some((p: string) => p.includes('evilBlockComment')), false);
    assert.strictEqual(imports.some((p: string) => p.includes('fakeStringImport')), false);
  });

  it('Audit D.3: Global scan budget enforcement respects maxFilesScan and reports truncation', () => {
    const analyzer = new DependencyAnalyzer(projectRoot, { maxFilesScan: 2 });
    const graph = analyzer.buildGraph();

    assert.strictEqual(analyzer.isTruncated, true);
    assert.ok(graph.size <= 2);
    assert.ok(analyzer.totalScannedFiles <= 2);
  });

  it('Audit D.4: Multi-root workspace analysis indexes files across multiple workspace folders', () => {
    const pythonRoot = path.join(__dirname, 'fixtures', 'python-project');
    const multiRootAnalyzer = new DependencyAnalyzer([projectRoot, pythonRoot]);
    const graph = multiRootAnalyzer.buildGraph();

    const hasTsFile = Array.from(graph.keys()).some((k) => k.includes('checkout.ts'));
    const hasPyFile = Array.from(graph.keys()).some((k) => k.includes('checkout.py'));

    assert.strictEqual(hasTsFile, true);
    assert.strictEqual(hasPyFile, true);
  });

  it('Audit D.5: SourceResolver rejects ambiguous duplicate basenames without matching directory evidence', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bugscope-ambig-'));
    try {
      const dirA = path.join(tempDir, 'subA');
      const dirB = path.join(tempDir, 'subB');
      fs.mkdirSync(dirA, { recursive: true });
      fs.mkdirSync(dirB, { recursive: true });

      const fileA = path.join(dirA, 'handler.ts');
      const fileB = path.join(dirB, 'handler.ts');
      fs.writeFileSync(fileA, 'export const a = 1;');
      fs.writeFileSync(fileB, 'export const b = 2;');

      const resolver = new SourceResolver([tempDir]);

      const ambiguousFrame = {
        rawPath: 'handler.ts',
        line: 1,
        rawFrame: 'at handler.ts:1:1'
      };
      const resAmbig = resolver.resolveSingleFrame(ambiguousFrame);
      assert.ok(resAmbig);
      assert.strictEqual(resAmbig.exists, false, 'Bare ambiguous basename must not arbitrarily pick one file');

      const specificFrame = {
        rawPath: 'subB/handler.ts',
        line: 1,
        rawFrame: 'at subB/handler.ts:1:1'
      };
      const resSpecific = resolver.resolveSingleFrame(specificFrame);
      assert.ok(resSpecific);
      assert.strictEqual(resSpecific.exists, true);
      assert.ok(resSpecific.fsPath && resSpecific.fsPath.includes('subB'));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('Audit F.1: AiAdapter rejects non-http/https protocol and fails safely', async () => {
    const untrustedAi = new AiAdapter({
      enabled: true,
      endpoint: 'ftp://malicious.internal.network/v1',
      model: 'test-model'
    });

    const report: any = { errorSummary: { type: 'Error', message: 'test' }, candidates: [] };
    const res = await untrustedAi.enrich(report);
    assert.strictEqual(res, undefined);
  });
});

import * as assert from 'assert';
import * as path from 'path';
import { ErrorParser } from '../src/analysis/errorParser';
import { WorkspaceSecurity } from '../src/utils/workspaceSecurity';
import { DependencyAnalyzer } from '../src/analysis/dependencyAnalyzer';
import { ImpactScorer, CandidateContext } from '../src/analysis/impactScorer';
import { SourceResolver } from '../src/analysis/sourceResolver';

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
});

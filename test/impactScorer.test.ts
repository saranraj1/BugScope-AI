import * as assert from 'assert';
import { ImpactScorer, CandidateContext } from '../src/analysis/impactScorer';

describe('ImpactScorer Tests', () => {
  it('1. Correctly prioritizes direct throw site over callers', () => {
    const candidates: CandidateContext[] = [
      {
        fsPath: '/app/src/orderService.ts',
        relativePath: 'src/orderService.ts',
        isStackFrame: true,
        stackDepth: 1, // Caller frame
        dependencyDistance: 1,
        dependencyRelation: 'importer',
        symbolMatchScore: 0.5,
        testScore: 0.0,
        evidence: []
      },
      {
        fsPath: '/app/src/checkout.ts',
        relativePath: 'src/checkout.ts',
        isStackFrame: true,
        stackDepth: 0, // Point of throw!
        symbolMatchScore: 1.0,
        testScore: 1.0,
        evidence: []
      },
      {
        fsPath: '/app/src/routes/cart.ts',
        relativePath: 'src/routes/cart.ts',
        isStackFrame: false,
        dependencyDistance: 2,
        dependencyRelation: 'importer',
        symbolMatchScore: 0.0,
        testScore: 0.0,
        evidence: []
      }
    ];

    const ranked = ImpactScorer.rankCandidates(candidates);

    assert.strictEqual(ranked.length, 3);
    // checkout.ts must be Rank #1
    assert.strictEqual(ranked[0].relativePath, 'src/checkout.ts');
    assert.strictEqual(ranked[0].rank, 1);
    assert.ok(ranked[0].score > ranked[1].score);

    // orderService must be Rank #2
    assert.strictEqual(ranked[1].relativePath, 'src/orderService.ts');
    assert.strictEqual(ranked[1].rank, 2);

    // cart.ts must be Rank #3
    assert.strictEqual(ranked[2].relativePath, 'src/routes/cart.ts');
    assert.strictEqual(ranked[2].rank, 3);

    // Check signals exist and are formatted
    assert.ok(ranked[0].signals.stackProximity === 1.0);
    assert.ok(ranked[0].reasons.length > 0);
  });
});

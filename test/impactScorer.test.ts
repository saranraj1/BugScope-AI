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

  it('2. Prioritizes upstream caller (importer) over downstream dependency (callee)', () => {
    const caller: CandidateContext = {
      fsPath: '/app/src/controller.ts',
      relativePath: 'src/controller.ts',
      isStackFrame: false,
      dependencyDistance: 1,
      dependencyRelation: 'importer', // Upstream caller
      symbolMatchScore: 0.0,
      testScore: 0.0,
      evidence: []
    };

    const dependency: CandidateContext = {
      fsPath: '/app/src/formatHelper.ts',
      relativePath: 'src/formatHelper.ts',
      isStackFrame: false,
      dependencyDistance: 1,
      dependencyRelation: 'dependency', // Downstream utility
      symbolMatchScore: 0.0,
      testScore: 0.0,
      evidence: []
    };

    const ranked = ImpactScorer.rankCandidates([dependency, caller]);

    assert.strictEqual(ranked[0].relativePath, 'src/controller.ts', 'Upstream caller should rank above callee');
    assert.strictEqual(ranked[0].rank, 1);
    assert.ok(ranked[0].signals.dependencyAdjacency > ranked[1].signals.dependencyAdjacency);
    assert.ok(ranked[0].score > ranked[1].score);
    assert.ok(ranked[0].reasons.some(r => r.includes('Direct caller: directly imports the failing module')));
  });

  it('3. Rewards high fan-in centrality with blast radius boost', () => {
    const lowFanIn: CandidateContext = {
      fsPath: '/app/src/isolated.ts',
      relativePath: 'src/isolated.ts',
      isStackFrame: false,
      dependencyDistance: 1,
      dependencyRelation: 'dependency',
      importedByCount: 1,
      symbolMatchScore: 0.0,
      testScore: 0.0,
      evidence: []
    };

    const highFanIn: CandidateContext = {
      fsPath: '/app/src/coreUtils.ts',
      relativePath: 'src/coreUtils.ts',
      isStackFrame: false,
      dependencyDistance: 1,
      dependencyRelation: 'dependency',
      importedByCount: 5, // Imported by 5 modules in workspace
      symbolMatchScore: 0.0,
      testScore: 0.0,
      evidence: []
    };

    const ranked = ImpactScorer.rankCandidates([lowFanIn, highFanIn]);

    assert.strictEqual(ranked[0].relativePath, 'src/coreUtils.ts');
    assert.ok(ranked[0].signals.dependencyAdjacency > ranked[1].signals.dependencyAdjacency);
    assert.ok(ranked[0].reasons.some(r => r.includes('High fan-in component: imported by 5 workspace modules')));
  });

  it('4. Multi-vector compound synergy boosts candidate with converging evidence', () => {
    const singleSignalCandidate: CandidateContext = {
      fsPath: '/app/src/single.ts',
      relativePath: 'src/single.ts',
      isStackFrame: true,
      stackDepth: 0, // only stack signal
      symbolMatchScore: 0.0,
      testScore: 0.0,
      evidence: []
    };

    const multiSignalCandidate: CandidateContext = {
      fsPath: '/app/src/convergent.ts',
      relativePath: 'src/convergent.ts',
      isStackFrame: true,
      stackDepth: 1, // stack signal
      dependencyDistance: 1,
      dependencyRelation: 'importer', // dependency signal
      symbolMatchScore: 0.9, // symbol signal
      testScore: 1.0, // test signal
      evidence: []
    };

    const ranked = ImpactScorer.rankCandidates([singleSignalCandidate, multiSignalCandidate]);

    const convergent = ranked.find(c => c.relativePath === 'src/convergent.ts')!;
    assert.ok(convergent.signals.synergyBonus !== undefined && convergent.signals.synergyBonus > 0);
    assert.ok(convergent.reasons.some(r => r.includes('Multi-vector corroboration')));
  });

  it('5. Normalizes top workspace frame when underlying throw is in external runtime', () => {
    const candidate: CandidateContext = {
      fsPath: '/app/src/apiHandler.ts',
      relativePath: 'src/apiHandler.ts',
      isStackFrame: true,
      stackDepth: 3, // Frame 0, 1, 2 were node_modules/express
      workspaceStackDepth: 0, // Topmost workspace frame!
      isTopWorkspaceFrame: true,
      symbolMatchScore: 0.0,
      testScore: 0.0,
      evidence: []
    };

    const ranked = ImpactScorer.rankCandidates([candidate]);

    assert.strictEqual(ranked[0].signals.stackProximity, 0.95);
    assert.ok(ranked[0].reasons.some(r => r.includes('Primary workspace entry point')));
  });

  it('6. Accurately classifies confidence tiers (CRITICAL, HIGH, MEDIUM, LOW)', () => {
    const criticalCandidate: CandidateContext = {
      fsPath: '/app/src/crit.ts',
      relativePath: 'src/crit.ts',
      isStackFrame: true,
      stackDepth: 0,
      dependencyDistance: 1,
      dependencyRelation: 'importer',
      symbolMatchScore: 1.0,
      testScore: 1.0,
      evidence: []
    };

    const lowCandidate: CandidateContext = {
      fsPath: '/app/src/low.ts',
      relativePath: 'src/low.ts',
      isStackFrame: false,
      dependencyDistance: 3,
      dependencyRelation: 'dependency',
      symbolMatchScore: 0.0,
      testScore: 0.0,
      evidence: []
    };

    const ranked = ImpactScorer.rankCandidates([criticalCandidate, lowCandidate]);

    assert.strictEqual(ranked[0].signals.confidenceTier, 'CRITICAL');
    assert.strictEqual(ranked[1].signals.confidenceTier, 'LOW');
  });
});

import * as path from 'path';
import {
  CandidateFile,
  ImpactSignals,
  EvidenceRecord,
  ResolvedSourceLocation
} from '../models/analysisResult';

export interface CandidateContext {
  fsPath: string;
  relativePath: string;
  isStackFrame: boolean;
  stackDepth?: number; // 0 = point of throw
  dependencyDistance?: number;
  dependencyRelation?: 'importer' | 'dependency';
  symbolMatchScore: number;
  testScore: number;
  evidence: EvidenceRecord[];
}

/**
 * ImpactScorer - Transparent, multi-factor impact scoring engine.
 * Computes R(f) = w_s*S(f) + w_d*D(f) + w_m*M(f) + w_t*T(f)
 */
export class ImpactScorer {
  // Documented weights
  private static readonly WEIGHT_STACK = 0.40;
  private static readonly WEIGHT_DEP = 0.30;
  private static readonly WEIGHT_SYMBOL = 0.15;
  private static readonly WEIGHT_TEST = 0.15;

  /**
   * Scores and ranks all candidates.
   */
  public static rankCandidates(contexts: CandidateContext[]): CandidateFile[] {
    const scored: CandidateFile[] = [];

    for (const ctx of contexts) {
      // 1. Stack Proximity Signal S(f)
      let S = 0.0;
      if (ctx.isStackFrame && ctx.stackDepth !== undefined) {
        if (ctx.stackDepth === 0) {
          S = 1.0; // Top of stack (throw site)
        } else if (ctx.stackDepth === 1) {
          S = 0.75;
        } else if (ctx.stackDepth === 2) {
          S = 0.55;
        } else {
          S = Math.max(0.2, 0.5 - ctx.stackDepth * 0.1);
        }
      }

      // 2. Dependency Adjacency Signal D(f)
      let D = 0.0;
      if (ctx.dependencyDistance !== undefined) {
        if (ctx.dependencyDistance === 1) {
          D = 0.85; // Direct import or caller
        } else if (ctx.dependencyDistance === 2) {
          D = 0.45; // 2nd hop
        } else {
          D = 0.20;
        }
      }

      // 3. Symbol Match Signal M(f)
      const M = Math.min(1.0, ctx.symbolMatchScore || 0.0);

      // 4. Test Correlation Signal T(f)
      const T = Math.min(1.0, ctx.testScore || 0.0);

      // Compute weighted sum
      const rawScore =
        this.WEIGHT_STACK * S +
        this.WEIGHT_DEP * D +
        this.WEIGHT_SYMBOL * M +
        this.WEIGHT_TEST * T;

      // Rounded to 2 decimals
      const finalScore = Math.round(rawScore * 100) / 100;

      const signals: ImpactSignals = {
        stackProximity: Math.round(S * 100) / 100,
        dependencyAdjacency: Math.round(D * 100) / 100,
        symbolMatch: Math.round(M * 100) / 100,
        testCorrelation: Math.round(T * 100) / 100
      };

      const reasons = this.generateExplanations(ctx, signals);

      scored.push({
        fsPath: ctx.fsPath,
        relativePath: ctx.relativePath,
        score: finalScore,
        rank: 0, // Assigned after sorting
        signals,
        evidence: ctx.evidence,
        reasons
      });
    }

    // Sort descending by score with deterministic tie-breaking:
    // 1. Higher score first
    // 2. Direct stack frame match first
    // 3. Dependency adjacency strength
    // 4. Alphabetical tie-breaker on relativePath
    scored.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (b.signals.stackProximity !== a.signals.stackProximity) {
        return b.signals.stackProximity - a.signals.stackProximity;
      }
      if (b.signals.dependencyAdjacency !== a.signals.dependencyAdjacency) {
        return b.signals.dependencyAdjacency - a.signals.dependencyAdjacency;
      }
      return a.relativePath.localeCompare(b.relativePath);
    });

    // Assign 1-indexed ranks
    return scored.map((c, index) => ({
      ...c,
      rank: index + 1
    }));
  }

  /**
   * Generates clear, non-speculative explanations for why this candidate was ranked.
   */
  private static generateExplanations(ctx: CandidateContext, signals: ImpactSignals): string[] {
    const reasons: string[] = [];

    if (ctx.isStackFrame) {
      if (ctx.stackDepth === 0) {
        reasons.push('Primary throw origin (top frame in stack trace)');
      } else {
        reasons.push(`Active caller in execution stack (frame depth: ${ctx.stackDepth})`);
      }
    }

    if (ctx.dependencyDistance !== undefined) {
      if (ctx.dependencyDistance === 1) {
        reasons.push(
          ctx.dependencyRelation === 'importer'
            ? 'Direct caller: directly imports the failing module'
            : 'Direct dependency: imported by the failing module'
        );
      } else if (ctx.dependencyDistance > 1) {
        reasons.push(`Indirect dependency relationship (${ctx.dependencyDistance} hops away)`);
      }
    }

    if (signals.symbolMatch > 0) {
      reasons.push('Contains identifiers matching the error message or throw context');
    }

    if (signals.testCorrelation > 0) {
      reasons.push('Covered by an existing automated test suite');
    }

    return reasons;
  }
}

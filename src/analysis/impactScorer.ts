import * as path from 'path';
import {
  CandidateFile,
  ImpactSignals,
  EvidenceRecord,
  ConfidenceTier
} from '../models/analysisResult';

export interface CandidateContext {
  fsPath: string;
  relativePath: string;
  isStackFrame: boolean;
  stackDepth?: number; // 0 = point of throw
  workspaceStackDepth?: number; // 0 = topmost workspace frame
  isTopWorkspaceFrame?: boolean;
  dependencyDistance?: number;
  dependencyRelation?: 'importer' | 'dependency';
  importedByCount?: number;
  symbolMatchScore: number;
  testScore: number;
  evidence: EvidenceRecord[];
}

/**
 * ImpactScorer - Transparent, multi-factor impact scoring engine.
 * Computes R(f) = w_s*S(f) + w_d*D(f) + w_m*M(f) + w_t*T(f) + B_synergy(f)
 * 
 * Calibrated weights:
 * - Stack Proximity (w_s = 0.38): Direct throw site or caller frame proximity
 * - Dependency Adjacency (w_d = 0.32): Upstream caller blast radius & fan-in centrality
 * - Symbol Match (w_m = 0.16): Identifier, function declaration & property specificity
 * - Test Correlation (w_t = 0.14): Existing test suite coverage
 * - Compound Synergy: Bonus when candidate is verified across >= 3 independent static dimensions
 */
export class ImpactScorer {
  private static readonly WEIGHT_STACK = 0.38;
  private static readonly WEIGHT_DEP = 0.32;
  private static readonly WEIGHT_SYMBOL = 0.16;
  private static readonly WEIGHT_TEST = 0.14;

  /**
   * Scores and ranks all candidates using multi-factor static analysis signals.
   */
  public static rankCandidates(contexts: CandidateContext[]): CandidateFile[] {
    const scored: CandidateFile[] = [];

    for (const ctx of contexts) {
      // 1. Stack Proximity Signal S(f)
      let S = 0.0;
      if (ctx.isStackFrame) {
        if (ctx.stackDepth === 0) {
          S = 1.0; // Top of stack (direct throw site)
        } else if (ctx.isTopWorkspaceFrame && ctx.workspaceStackDepth === 0) {
          // Topmost internal workspace frame when absolute throw was in runtime/library
          S = 0.95;
        } else if (ctx.stackDepth === 1 || ctx.workspaceStackDepth === 1) {
          S = 0.75; // Immediate caller frame
        } else if (ctx.stackDepth === 2 || ctx.workspaceStackDepth === 2) {
          S = 0.55;
        } else if (ctx.stackDepth === 3 || ctx.workspaceStackDepth === 3) {
          S = 0.40;
        } else {
          const depth = ctx.workspaceStackDepth ?? ctx.stackDepth ?? 4;
          S = Math.max(0.15, 0.45 - depth * 0.05);
        }
      }

      // 2. Dependency Adjacency & Centrality Signal D(f)
      let D = 0.0;
      if (ctx.dependencyDistance !== undefined) {
        let baseD = 0.0;
        if (ctx.dependencyRelation === 'importer') {
          // Upstream caller: halts/fails when callee throws (highest blast radius)
          if (ctx.dependencyDistance === 1) {
            baseD = 0.85;
          } else if (ctx.dependencyDistance === 2) {
            baseD = 0.50;
          } else {
            baseD = 0.25;
          }
        } else if (ctx.dependencyRelation === 'dependency') {
          // Downstream dependency: imported by throwing module (potential source of bad data or passive utility)
          if (ctx.dependencyDistance === 1) {
            baseD = 0.70;
          } else if (ctx.dependencyDistance === 2) {
            baseD = 0.35;
          } else {
            baseD = 0.15;
          }
        } else {
          // Unspecified relation fallback
          if (ctx.dependencyDistance === 1) {
            baseD = 0.80;
          } else if (ctx.dependencyDistance === 2) {
            baseD = 0.45;
          } else {
            baseD = 0.20;
          }
        }

        // Fan-in / Centrality boost (modules imported by multiple workspace modules have higher blast radius)
        const fanIn = ctx.importedByCount || 0;
        const centralityBoost = fanIn > 1 ? Math.min(0.10, (fanIn - 1) * 0.025) : 0;
        D = Math.min(1.0, baseD + centralityBoost);
      } else if ((ctx.importedByCount || 0) > 1) {
        // Not a direct hop, but a shared workspace hub
        D = Math.min(0.15, (ctx.importedByCount! - 1) * 0.03);
      }

      // 3. Symbol Match Signal M(f)
      const M = Math.min(1.0, ctx.symbolMatchScore || 0.0);

      // 4. Test Correlation Signal T(f)
      const T = Math.min(1.0, ctx.testScore || 0.0);

      // 5. Multi-Vector Compound Synergy Bonus
      const activeSignalsCount = [S > 0.05, D > 0.05, M > 0.05, T > 0.05].filter(Boolean).length;
      let synergyBonus = 0.0;
      if (activeSignalsCount >= 4) {
        synergyBonus = 0.08;
      } else if (activeSignalsCount === 3) {
        synergyBonus = 0.04;
      }

      // Compute weighted sum + synergy
      const rawScore =
        this.WEIGHT_STACK * S +
        this.WEIGHT_DEP * D +
        this.WEIGHT_SYMBOL * M +
        this.WEIGHT_TEST * T +
        synergyBonus;

      // Clamped and rounded to 2 decimals
      const finalScore = Math.min(1.0, Math.round(rawScore * 100) / 100);

      // Confidence tier
      let confidenceTier: ConfidenceTier = 'LOW';
      if (finalScore >= 0.80) {
        confidenceTier = 'CRITICAL';
      } else if (finalScore >= 0.55) {
        confidenceTier = 'HIGH';
      } else if (finalScore >= 0.30) {
        confidenceTier = 'MEDIUM';
      }

      const signals: ImpactSignals = {
        stackProximity: Math.round(S * 100) / 100,
        dependencyAdjacency: Math.round(D * 100) / 100,
        symbolMatch: Math.round(M * 100) / 100,
        testCorrelation: Math.round(T * 100) / 100,
        synergyBonus: synergyBonus > 0 ? synergyBonus : undefined,
        confidenceTier
      };

      const reasons = this.generateExplanations(ctx, signals, activeSignalsCount);

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
    // 2. Direct stack proximity first
    // 3. Dependency adjacency strength
    // 4. Symbol match strength
    // 5. Test correlation strength
    // 6. Alphabetical tie-breaker on relativePath
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
      if (b.signals.symbolMatch !== a.signals.symbolMatch) {
        return b.signals.symbolMatch - a.signals.symbolMatch;
      }
      if (b.signals.testCorrelation !== a.signals.testCorrelation) {
        return b.signals.testCorrelation - a.signals.testCorrelation;
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
  private static generateExplanations(
    ctx: CandidateContext,
    signals: ImpactSignals,
    activeSignalsCount: number
  ): string[] {
    const reasons: string[] = [];

    if (ctx.isStackFrame) {
      if (ctx.stackDepth === 0) {
        reasons.push('Primary throw origin (top frame in stack trace)');
      } else if (ctx.isTopWorkspaceFrame && ctx.workspaceStackDepth === 0) {
        reasons.push('Primary workspace entry point (first internal frame in stack)');
      } else {
        const depth = ctx.workspaceStackDepth ?? ctx.stackDepth;
        reasons.push(`Active caller in execution stack (frame depth: ${depth})`);
      }
    }

    if (ctx.dependencyDistance !== undefined) {
      if (ctx.dependencyDistance === 1) {
        reasons.push(
          ctx.dependencyRelation === 'importer'
            ? 'Direct caller: directly imports the failing module (high blast radius)'
            : 'Direct dependency: imported by the failing module'
        );
      } else if (ctx.dependencyDistance > 1) {
        const chain = ctx.dependencyRelation === 'importer' ? 'caller chain' : 'dependency chain';
        reasons.push(`Indirect ${chain} (${ctx.dependencyDistance} hops away)`);
      }
    }

    if ((ctx.importedByCount || 0) > 1) {
      reasons.push(`High fan-in component: imported by ${ctx.importedByCount} workspace modules`);
    }

    if (signals.symbolMatch > 0) {
      reasons.push('Contains identifiers matching the error message or throw context');
    }

    if (signals.testCorrelation > 0) {
      reasons.push('Covered by an existing automated test suite');
    }

    if (signals.synergyBonus && signals.synergyBonus > 0) {
      reasons.push(
        `Multi-vector corroboration: verified across ${activeSignalsCount} independent static dimensions (+${Math.round(signals.synergyBonus * 100)}% synergy)`
      );
    }

    return reasons;
  }
}

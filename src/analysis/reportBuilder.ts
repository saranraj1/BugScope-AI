import * as path from 'path';
import {
  AnalysisReport,
  ParsedError,
  ResolvedSourceLocation,
  EvidenceRecord,
  CandidateFile,
  TestRecommendation
} from '../models/analysisResult';
import { ErrorParser } from './errorParser';
import { SourceResolver, TextDocumentLike } from './sourceResolver';
import { DependencyAnalyzer } from './dependencyAnalyzer';
import { SymbolAnalyzer } from './symbolAnalyzer';
import { TestDiscovery } from './testDiscovery';
import { ImpactScorer, CandidateContext } from './impactScorer';

export interface AnalyzerOptions {
  workspaceRoots: string[];
  openDocuments?: readonly TextDocumentLike[];
  maxFilesScan?: number;
  maxHops?: number;
}

/**
 * ReportBuilder - Coordinates local-first static analysis and assembles
 * the verified AnalysisReport.
 */
export class ReportBuilder {
  /**
   * Runs the full deterministic analysis pipeline.
   */
  public static async analyze(
    selectedText: string,
    options: AnalyzerOptions
  ): Promise<AnalysisReport> {
    const timestamp = new Date().toISOString();
    const limitations: string[] = [];
    const allEvidence: EvidenceRecord[] = [];

    // 1. Error Parsing
    const parsedError = ErrorParser.parse(selectedText);
    if (!parsedError.isError) {
      return {
        timestamp,
        errorSummary: {
          type: parsedError.errorType,
          message: parsedError.message,
          rawSelection: selectedText
        },
        resolvedFrames: [],
        candidates: [],
        suggestedTests: [],
        evidence: [],
        limitations: [
          parsedError.parseNotice ||
            'Selection did not contain standard error patterns. Try selecting a stack trace or log error.'
        ]
      };
    }

    // 2. Safe Workspace Source Resolution
    const sourceResolver = new SourceResolver(options.workspaceRoots, options.openDocuments || []);
    const resolvedFrames = sourceResolver.resolveFrames(parsedError.frames);

    const primaryLocation = resolvedFrames.find((f) => f.exists && f.isWithinWorkspace);

    // Record observed stack frame evidence and classify unresolvable frames
    const runtimeInternalFrames: string[] = [];
    const missingWorkspaceFiles: string[] = [];

    for (let i = 0; i < resolvedFrames.length; i++) {
      const frame = resolvedFrames[i];
      if (frame.exists && frame.isWithinWorkspace) {
        allEvidence.push({
          tier: 'observed',
          category: 'stack_frame',
          description: `Stack frame ${i + 1} points to ${frame.relativePath}:${frame.line}`,
          location: {
            relativePath: frame.relativePath,
            line: frame.line
          },
          weight: i === 0 ? 1.0 : 0.7
        });
      } else if (!frame.exists) {
        const p = (frame.relativePath || '').toLowerCase().replace(/\\/g, '/');
        const isRuntime =
          p.startsWith('node:') ||
          p.startsWith('node:internal') ||
          p.includes('[eval]') ||
          p.includes('[eval]-wrapper') ||
          p.startsWith('<') ||
          p.includes('internal/process') ||
          p.includes('internal/vm') ||
          p.includes('internal/modules') ||
          p.includes('site-packages') ||
          p.includes('/lib/python') ||
          p.includes('\\lib\\python') ||
          p.includes('<frozen');

        if (isRuntime) {
          runtimeInternalFrames.push(frame.relativePath);
        } else {
          missingWorkspaceFiles.push(frame.relativePath);
        }
      }
    }

    if (runtimeInternalFrames.length > 0) {
      const distinctTypes = Array.from(
        new Set(
          runtimeInternalFrames.map((f) => {
            const lower = f.toLowerCase();
            if (lower.startsWith('node:')) return 'node:internal/*';
            if (lower.includes('eval')) return '[eval]';
            if (lower.includes('site-packages')) return 'python:site-packages/*';
            if (lower.includes('lib/python') || lower.includes('\\lib\\python')) return 'python:lib/*';
            if (lower.startsWith('<')) return lower.includes('frozen') ? '<frozen importlib>' : lower;
            return f;
          })
        )
      );
      limitations.push(
        `${runtimeInternalFrames.length} external runtime engine frame(s) (${distinctTypes.join(', ')}) excluded from workspace blast radius.`
      );
    }

    for (const missing of missingWorkspaceFiles) {
      limitations.push(`File in stack trace could not be resolved in workspace: ${missing}`);
    }

    // Identify primary workspace root
    const primaryRoot = options.workspaceRoots[0] || process.cwd();

    // 3. Dependency Mapping
    const depAnalyzer = new DependencyAnalyzer(primaryRoot, options.maxFilesScan || 300);
    const targetFsPaths = resolvedFrames
      .filter((f) => f.exists && f.isWithinWorkspace)
      .map((f) => f.fsPath);

    const { connectedFiles, evidence: depEvidence } = depAnalyzer.findConnectedModules(
      targetFsPaths,
      options.maxHops || 2
    );
    allEvidence.push(...depEvidence);

    // 4. Symbol Extraction
    const errorTokens = SymbolAnalyzer.extractTokens(parsedError);

    // 5. Candidate Context Collation
    const candidateMap = new Map<string, CandidateContext>();

    // Add resolved stack frame files
    let workspaceDepth = 0;
    for (let i = 0; i < resolvedFrames.length; i++) {
      const f = resolvedFrames[i];
      if (f.exists && f.isWithinWorkspace) {
        const key = f.fsPath.toLowerCase();
        if (!candidateMap.has(key)) {
          const symResult = SymbolAnalyzer.matchSymbolsInFile(f.fsPath, errorTokens);
          allEvidence.push(...symResult.evidence);

          const node = depAnalyzer.getNode(f.fsPath);
          const importedByCount = node ? node.importedBy.length : 0;

          candidateMap.set(key, {
            fsPath: f.fsPath,
            relativePath: f.relativePath,
            isStackFrame: true,
            stackDepth: i,
            workspaceStackDepth: workspaceDepth,
            isTopWorkspaceFrame: workspaceDepth === 0,
            importedByCount,
            symbolMatchScore: symResult.score,
            testScore: 0,
            evidence: []
          });
          workspaceDepth++;
        }
      }
    }

    // Add connected dependency files and enrich existing stack candidates
    for (const [key, depInfo] of connectedFiles.entries()) {
      const existing = candidateMap.get(key);
      if (existing) {
        // Corroborate existing stack frame candidate with dependency graph evidence
        if (existing.dependencyDistance === undefined || depInfo.distance < existing.dependencyDistance) {
          existing.dependencyDistance = depInfo.distance;
          existing.dependencyRelation = depInfo.relation;
        }
        if (depInfo.importedByCount !== undefined) {
          existing.importedByCount = Math.max(existing.importedByCount || 0, depInfo.importedByCount);
        }
      } else {
        const relPath = path.relative(primaryRoot, key).replace(/\\/g, '/');
        const symResult = SymbolAnalyzer.matchSymbolsInFile(key, errorTokens);
        allEvidence.push(...symResult.evidence);

        candidateMap.set(key, {
          fsPath: key,
          relativePath: relPath,
          isStackFrame: false,
          dependencyDistance: depInfo.distance,
          dependencyRelation: depInfo.relation,
          importedByCount: depInfo.importedByCount,
          symbolMatchScore: symResult.score,
          testScore: 0,
          evidence: []
        });
      }
    }

    // 6. Test Discovery
    const testDiscovery = new TestDiscovery(primaryRoot);
    const candidatePaths = Array.from(candidateMap.values()).map((c) => c.fsPath);
    const { recommendations, evidence: testEvidence, testScores } = testDiscovery.discoverForCandidates(
      candidatePaths
    );
    allEvidence.push(...testEvidence);

    // Apply test scores and evidence to candidate contexts
    for (const [key, ctx] of candidateMap.entries()) {
      const score = testScores.get(key) || 0;
      ctx.testScore = score;
      ctx.evidence = allEvidence.filter(
        (e) => e.location?.relativePath && e.location.relativePath.toLowerCase() === ctx.relativePath.toLowerCase()
      );
    }

    // 7. Impact Ranking
    const rankedCandidates = ImpactScorer.rankCandidates(Array.from(candidateMap.values()));

    if (rankedCandidates.length === 0) {
      limitations.push('No candidate source files could be linked to this error inside the workspace.');
    }

    return {
      timestamp,
      errorSummary: {
        type: parsedError.errorType,
        message: parsedError.message,
        rawSelection: selectedText
      },
      primaryLocation,
      resolvedFrames,
      candidates: rankedCandidates,
      suggestedTests: recommendations,
      evidence: allEvidence,
      limitations
    };
  }
}

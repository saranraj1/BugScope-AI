/**
 * BugScope AI - Shared Analysis Models & Types
 * Defines strict data contracts between parser, analyzers, ranker, and presentation layer.
 */

export interface StackFrame {
  /** Function or method name where frame occurred */
  functionName?: string;
  /** Raw file path extracted from stack trace */
  rawPath: string;
  /** Normalized path or relative workspace path */
  normalizedPath?: string;
  /** Line number (1-indexed) */
  line?: number;
  /** Column number (1-indexed) */
  column?: number;
  /** Raw original line from stack trace */
  rawFrame: string;
  /** Whether the path resolves to an internal workspace file */
  isWorkspaceFile?: boolean;
}

export interface ParsedError {
  /** Whether the input text resembles an error or stack trace */
  isError: boolean;
  /** Type of error (e.g., TypeError, ReferenceError, NullPointerException) */
  errorType: string;
  /** Extracted human-readable error message */
  message: string;
  /** Parsed stack frames in order (top frame is point of throw) */
  frames: StackFrame[];
  /** Original user selection */
  rawText: string;
  /** Reason why parsing might be incomplete or why text was rejected */
  parseNotice?: string;
}

export interface SourceContextSnippet {
  /** Target line number */
  targetLine: number;
  /** Array of lines with line numbers surrounding target */
  lines: Array<{
    lineNumber: number;
    content: string;
    isTarget: boolean;
  }>;
}

export interface ResolvedSourceLocation {
  /** Full filesystem path */
  fsPath: string;
  /** Workspace-relative path */
  relativePath: string;
  /** Target line number */
  line: number;
  /** Target column number */
  column: number;
  /** Surrounding code snippet context */
  snippet?: SourceContextSnippet;
  /** Whether the file exists on disk */
  exists: boolean;
  /** Whether the file is within active workspace boundaries */
  isWithinWorkspace: boolean;
}

export type EvidenceTier = 'observed' | 'inferred' | 'hypothesis';

export type EvidenceCategory = 
  | 'stack_frame' 
  | 'dependency_import' 
  | 'dependency_caller'
  | 'symbol_match' 
  | 'test_coverage';

export interface EvidenceRecord {
  /** Evidence tier (Observed fact, Inferred relationship, or Unverified hypothesis) */
  tier: EvidenceTier;
  /** Category of signal */
  category: EvidenceCategory;
  /** Human-readable explanation of why this evidence matters */
  description: string;
  /** Optional file/location reference */
  location?: {
    relativePath: string;
    line?: number;
  };
  /** Relevance weight contribution (0.0 to 1.0) */
  weight: number;
}

export interface ImpactSignals {
  /** Stack trace proximity score (0.0 - 1.0) */
  stackProximity: number;
  /** Dependency adjacency distance score (0.0 - 1.0) */
  dependencyAdjacency: number;
  /** Symbol or error keyword match score (0.0 - 1.0) */
  symbolMatch: number;
  /** Test suite correlation score (0.0 - 1.0) */
  testCorrelation: number;
}

export interface CandidateFile {
  /** Absolute filesystem path */
  fsPath: string;
  /** Workspace-relative display path */
  relativePath: string;
  /** Overall computed impact score (0.0 - 1.0) */
  score: number;
  /** Investigation ranking position (1 = highest priority) */
  rank: number;
  /** Multi-factor signal breakdown */
  signals: ImpactSignals;
  /** Evidence backing this candidate */
  evidence: EvidenceRecord[];
  /** Clear explanation of why this file is prioritized */
  reasons: string[];
}

export interface TestRecommendation {
  /** Test file path */
  testPath: string;
  /** Workspace-relative test path */
  relativePath: string;
  /** Target source file this test covers */
  targetSourcePath: string;
  /** Test status */
  testType: 'existing_suite' | 'recommended_suite';
  /** Rationale for running this test */
  reason: string;
}

export interface AiEnrichment {
  /** High-level executive synthesis */
  summary: string;
  /** Candidate cause hypotheses */
  hypotheses: string[];
  /** Recommended debugging checklist */
  recommendedActions: string[];
  /** Model used for enrichment */
  model: string;
  /** Strict disclaimer separating hypotheses from verified facts */
  disclaimer: string;
}

export interface AnalysisReport {
  /** ISO timestamp */
  timestamp: string;
  /** Parsed error summary */
  errorSummary: {
    type: string;
    message: string;
    rawSelection: string;
  };
  /** Primary throw location if resolved */
  primaryLocation?: ResolvedSourceLocation;
  /** All resolved stack frames */
  resolvedFrames: ResolvedSourceLocation[];
  /** Ranked candidate files ordered by impact */
  candidates: CandidateFile[];
  /** Suggested test suites */
  suggestedTests: TestRecommendation[];
  /** Complete evidence ledger */
  evidence: EvidenceRecord[];
  /** Transparency disclosures (unresolved files, depth limits reached, etc.) */
  limitations: string[];
  /** Optional AI enrichment if enabled */
  aiEnrichment?: AiEnrichment;
}

export type WebviewMessage =
  | { type: 'STATE_IDLE' }
  | { type: 'STATE_LOADING'; selectionText: string }
  | { type: 'STATE_SUCCESS'; report: AnalysisReport }
  | { type: 'STATE_EMPTY'; message: string; hint: string }
  | { type: 'STATE_ERROR'; errorMessage: string; details?: string };

export type WebviewAction =
  | { action: 'OPEN_LOCATION'; file: string; line: number; column?: number }
  | { action: 'RERUN_ANALYSIS' }
  | { action: 'CLEAR' };

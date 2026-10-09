import * as path from 'path';
import * as fs from 'fs';
import { StackFrame, ResolvedSourceLocation, SourceContextSnippet } from '../models/analysisResult';
import { WorkspaceSecurity } from '../utils/workspaceSecurity';

export interface WorkspaceFolderLike {
  uri: { fsPath: string };
  name: string;
}

export interface TextDocumentLike {
  uri: { fsPath: string };
  getText(): string;
  isDirty?: boolean;
}

/**
 * SourceResolver - Resolves stack frames against workspace files,
 * validates boundaries, and captures safe source snippets.
 */
export class SourceResolver {
  private workspaceRoots: string[];
  private openDocuments: Map<string, TextDocumentLike>;

  constructor(workspaceRoots: string[], openDocuments: readonly TextDocumentLike[] = []) {
    this.workspaceRoots = workspaceRoots.map((r) => path.resolve(r));
    this.openDocuments = new Map();
    for (const doc of openDocuments) {
      this.openDocuments.set(WorkspaceSecurity.normalizeForComparison(path.resolve(doc.uri.fsPath)), doc);
    }
  }

  /**
   * Resolves a list of parsed frames against the workspace.
   */
  public resolveFrames(frames: StackFrame[]): ResolvedSourceLocation[] {
    const resolved: ResolvedSourceLocation[] = [];

    for (const frame of frames) {
      const loc = this.resolveSingleFrame(frame);
      if (loc) {
        resolved.push(loc);
      }
    }

    return resolved;
  }

  /**
   * Resolves a single stack frame to a verified workspace file.
   */
  public resolveSingleFrame(frame: StackFrame): ResolvedSourceLocation | null {
    const candidatePath = frame.rawPath;
    if (!candidatePath) {
      return null;
    }

    const matchedFsPath = this.findMatchingWorkspaceFile(candidatePath);

    if (!matchedFsPath) {
      return {
        fsPath: candidatePath,
        relativePath: candidatePath,
        line: frame.line || 1,
        column: frame.column || 1,
        exists: false,
        isWithinWorkspace: false
      };
    }

    // Verify it is strictly within one of the workspace roots
    const root = this.findOwningWorkspaceRoot(matchedFsPath);
    if (!root) {
      return {
        fsPath: matchedFsPath,
        relativePath: path.basename(matchedFsPath),
        line: frame.line || 1,
        column: frame.column || 1,
        exists: true,
        isWithinWorkspace: false
      };
    }

    const relativePath = path.relative(root, matchedFsPath).replace(/\\/g, '/');
    const targetLine = frame.line || 1;
    const targetCol = frame.column || 1;

    // Capture surrounding source context snippet
    const snippet = this.captureSnippet(matchedFsPath, targetLine);

    return {
      fsPath: matchedFsPath,
      relativePath,
      line: targetLine,
      column: targetCol,
      snippet,
      exists: true,
      isWithinWorkspace: true
    };
  }

  /**
   * Finds the actual filesystem path for a raw path from stack trace.
   * Prefers exact absolute matches, then exact workspace-relative matches.
   * Uses verified suffix matching and rejects ambiguous matches when multiple candidates exist.
   */
  private findMatchingWorkspaceFile(rawPath: string): string | null {
    // 1. Direct absolute path check
    if (path.isAbsolute(rawPath)) {
      if (fs.existsSync(rawPath) && !fs.statSync(rawPath).isDirectory()) {
        return path.resolve(rawPath);
      }
    }

    // 2. Relative to each workspace root
    for (const root of this.workspaceRoots) {
      const joined = path.resolve(root, rawPath);
      if (fs.existsSync(joined) && !fs.statSync(joined).isDirectory()) {
        return joined;
      }
    }

    // 3. Normalized suffix or verified filename match across workspace trees
    const targetNorm = rawPath.replace(/\\/g, '/').replace(/^\.\//, '');
    const hasDirectoryContext = targetNorm.includes('/');
    const targetBase = path.basename(targetNorm);

    const candidates: string[] = [];
    for (const root of this.workspaceRoots) {
      this.collectMatchingFiles(root, 0, 7, candidates, 1000);
    }

    const isCaseInsensitive = WorkspaceSecurity.isCaseInsensitivePlatform();
    const targetNormCmp = isCaseInsensitive ? targetNorm.toLowerCase() : targetNorm;
    const targetBaseCmp = isCaseInsensitive ? targetBase.toLowerCase() : targetBase;

    if (hasDirectoryContext) {
      // Must match directory suffix (e.g., 'analysis/reportBuilder.ts' must match '.../analysis/reportBuilder.ts')
      const matched = candidates.filter((cand) => {
        const candNorm = cand.replace(/\\/g, '/');
        const candNormCmp = isCaseInsensitive ? candNorm.toLowerCase() : candNorm;
        return candNormCmp.endsWith('/' + targetNormCmp) || candNormCmp === targetNormCmp;
      });

      if (matched.length === 1) {
        return matched[0];
      }
      if (matched.length > 1) {
        // If multiple matches exist, pick the one with the closest path depth or longest common prefix
        // If exact tie, return null to avoid picking arbitrarily
        matched.sort((a, b) => a.length - b.length);
        if (matched[0].length < matched[1].length) {
          return matched[0];
        }
        return null; // Ambiguous match
      }
      return null;
    }

    // Bare filename (no directory context in stack trace)
    const matchedByBase = candidates.filter((cand) => {
      const base = path.basename(cand);
      const baseCmp = isCaseInsensitive ? base.toLowerCase() : base;
      return baseCmp === targetBaseCmp;
    });

    // If exactly one file in the workspace has this name, resolve it.
    // If multiple distinct files exist with this name, refuse to guess arbitrarily.
    if (matchedByBase.length === 1) {
      return matchedByBase[0];
    }

    return null;
  }

  /**
   * Bounded depth-first collection of source files in the workspace directory.
   */
  private collectMatchingFiles(
    dir: string,
    depth: number,
    maxDepth: number,
    results: string[],
    maxLimit: number
  ): void {
    if (depth > maxDepth || results.length >= maxLimit || !fs.existsSync(dir)) {
      return;
    }

    const dirName = path.basename(dir);
    if (WorkspaceSecurity.isIgnoredDirectory(dirName)) {
      return;
    }

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (results.length >= maxLimit) {
          break;
        }

        if (entry.isFile()) {
          results.push(path.join(dir, entry.name));
        } else if (entry.isDirectory() && !WorkspaceSecurity.isIgnoredDirectory(entry.name)) {
          this.collectMatchingFiles(
            path.join(dir, entry.name),
            depth + 1,
            maxDepth,
            results,
            maxLimit
          );
        }
      }
    } catch {
      // Permission or unreadable directory
    }
  }

  /**
   * Identifies which workspace root contains the given file path.
   */
  private findOwningWorkspaceRoot(filePath: string): string | null {
    for (const root of this.workspaceRoots) {
      if (WorkspaceSecurity.isPathWithinWorkspace(filePath, root)) {
        return root;
      }
    }
    return null;
  }

  /**
   * Captures surrounding lines for the target line.
   * Checks open unsaved documents first, then disk.
   */
  public captureSnippet(fsPath: string, targetLine: number, contextRadius: number = 4): SourceContextSnippet | undefined {
    let content: string | null = null;

    // Check open documents first for unsaved edits
    const openDoc = this.openDocuments.get(WorkspaceSecurity.normalizeForComparison(path.resolve(fsPath)));
    if (openDoc) {
      content = openDoc.getText();
    } else {
      content = WorkspaceSecurity.readBoundedTextFile(fsPath);
    }

    if (!content) {
      return undefined;
    }

    const allLines = content.split(/\r?\n/);
    const startLine = Math.max(1, targetLine - contextRadius);
    const endLine = Math.min(allLines.length, targetLine + contextRadius);

    const snippetLines: Array<{ lineNumber: number; content: string; isTarget: boolean }> = [];

    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      snippetLines.push({
        lineNumber: lineNum,
        content: allLines[lineNum - 1] ?? '',
        isTarget: lineNum === targetLine
      });
    }

    return {
      targetLine,
      lines: snippetLines
    };
  }
}

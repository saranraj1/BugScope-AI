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
      this.openDocuments.set(path.resolve(doc.uri.fsPath).toLowerCase(), doc);
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

    // 3. Search by relative path suffix or filename in workspace roots
    const targetBase = path.basename(rawPath);
    for (const root of this.workspaceRoots) {
      const found = this.searchFileInTree(root, rawPath, targetBase, 0, 5);
      if (found) {
        return found;
      }
    }

    return null;
  }

  /**
   * Bounded depth-first search for a matching file in the workspace directory.
   */
  private searchFileInTree(
    dir: string,
    rawPath: string,
    targetBase: string,
    depth: number,
    maxDepth: number
  ): string | null {
    if (depth > maxDepth || !fs.existsSync(dir)) {
      return null;
    }

    const dirName = path.basename(dir);
    if (WorkspaceSecurity.isIgnoredDirectory(dirName)) {
      return null;
    }

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      // First pass: check files
      for (const entry of entries) {
        if (entry.isFile()) {
          const fullPath = path.join(dir, entry.name);
          // Check exact filename match
          if (entry.name.toLowerCase() === targetBase.toLowerCase()) {
            const normalized = fullPath.replace(/\\/g, '/');
            const targetNorm = rawPath.replace(/\\/g, '/');
            if (normalized.endsWith(targetNorm) || entry.name.toLowerCase() === targetBase.toLowerCase()) {
              return fullPath;
            }
          }
        }
      }

      // Second pass: recurse into subdirectories
      for (const entry of entries) {
        if (entry.isDirectory() && !WorkspaceSecurity.isIgnoredDirectory(entry.name)) {
          const result = this.searchFileInTree(
            path.join(dir, entry.name),
            rawPath,
            targetBase,
            depth + 1,
            maxDepth
          );
          if (result) {
            return result;
          }
        }
      }
    } catch {
      return null;
    }

    return null;
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
    const openDoc = this.openDocuments.get(path.resolve(fsPath).toLowerCase());
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

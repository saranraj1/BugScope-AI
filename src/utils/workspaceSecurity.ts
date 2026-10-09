import * as path from 'path';
import * as fs from 'fs';
import { WebviewAction } from '../models/analysisResult';

/**
 * WorkspaceSecurity - Enforces boundaries, path traversal protections,
 * and sensitive file exclusion.
 */
export class WorkspaceSecurity {
  private static readonly SENSITIVE_PATTERNS = [
    /^\.env(\..+)?$/i,
    /\.(pem|key|pfx|pkcs12|crt|cer|der)$/i,
    /id_rsa/i,
    /credentials/i,
    /secrets?\.(json|yaml|yml)/i,
    /\.npmrc$/i,
    /\.dockercfg$/i
  ];

  private static readonly IGNORED_DIRS = new Set([
    'node_modules',
    '.git',
    '.reentry',
    'dist',
    'out',
    'build',
    '.next',
    '.nuxt',
    'coverage',
    '.vscode-test',
    '__pycache__',
    '.venv',
    'venv',
    'env',
    '.pytest_cache',
    '.mypy_cache',
    '.tox',
    '.ruff_cache'
  ]);

  /**
   * Checks if a relative or absolute directory path should be skipped.
   */
  public static isIgnoredDirectory(dirName: string): boolean {
    const base = path.basename(dirName).toLowerCase();
    return this.IGNORED_DIRS.has(base) || base.endsWith('.egg-info') || base.endsWith('.dist-info');
  }

  /**
   * Checks if a filename matches sensitive patterns (secrets, credentials, certs).
   */
  public static isSensitiveFile(filePath: string): boolean {
    const base = path.basename(filePath);
    return this.SENSITIVE_PATTERNS.some((pattern) => pattern.test(base));
  }

  /**
   * Helper to determine if current operating system has a case-insensitive filesystem by default.
   */
  public static isCaseInsensitivePlatform(): boolean {
    return process.platform === 'win32' || process.platform === 'darwin';
  }

  /**
   * Canonicalizes a path for comparison without destructively lowercasing on Linux.
   */
  public static normalizeForComparison(filePath: string): string {
    const resolved = path.resolve(filePath);
    return WorkspaceSecurity.isCaseInsensitivePlatform()
      ? resolved.toLowerCase()
      : resolved;
  }

  /**
   * Safely resolves a path and ensures it stays strictly within the workspace root.
   * Uses path-relative containment rather than naive string prefixes to prevent sibling-prefix traversal.
   * Resolves symlinks using fs.realpathSync to prevent symlink directory escapes.
   */
  public static isPathWithinWorkspace(targetPath: string, workspaceRoot: string): boolean {
    if (!targetPath || !workspaceRoot) {
      return false;
    }

    try {
      let resolvedTarget = path.resolve(targetPath);
      let resolvedRoot = path.resolve(workspaceRoot);

      // Resolve real filesystem paths to catch symlink escapes
      try {
        if (fs.existsSync(resolvedTarget)) {
          resolvedTarget = fs.realpathSync(resolvedTarget);
        } else {
          // If the target file doesn't exist yet, resolve the closest existing parent directory
          let parent = path.dirname(resolvedTarget);
          while (parent && parent !== path.dirname(parent)) {
            if (fs.existsSync(parent)) {
              const realParent = fs.realpathSync(parent);
              const remainder = path.relative(parent, resolvedTarget);
              resolvedTarget = path.resolve(realParent, remainder);
              break;
            }
            parent = path.dirname(parent);
          }
        }
      } catch {}

      try {
        if (fs.existsSync(resolvedRoot)) {
          resolvedRoot = fs.realpathSync(resolvedRoot);
        }
      } catch {}

      const compareTarget = WorkspaceSecurity.normalizeForComparison(resolvedTarget);
      const compareRoot = WorkspaceSecurity.normalizeForComparison(resolvedRoot);

      // Exact match
      if (compareTarget === compareRoot) {
        return true;
      }

      // Compute relative path from root to target
      const rel = path.relative(compareRoot, compareTarget);

      // If relative path starts with '..' or is absolute (different drive on Windows), it is outside!
      if (
        rel === '..' ||
        rel.startsWith('..' + path.sep) ||
        rel.startsWith('../') ||
        path.isAbsolute(rel)
      ) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Reads a file safely with byte bounds and sensitive file filters.
   */
  public static readBoundedTextFile(
    filePath: string,
    maxBytes: number = 250_000,
    workspaceRoot?: string
  ): string | null {
    try {
      if (!filePath || this.isSensitiveFile(filePath)) {
        return null;
      }

      if (workspaceRoot && !this.isPathWithinWorkspace(filePath, workspaceRoot)) {
        return null;
      }

      if (!fs.existsSync(filePath)) {
        return null;
      }

      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        return null;
      }

      if (stat.size > maxBytes) {
        // Read only first maxBytes
        const fd = fs.openSync(filePath, 'r');
        const buffer = Buffer.alloc(maxBytes);
        const bytesRead = fs.readSync(fd, buffer, 0, maxBytes, 0);
        fs.closeSync(fd);
        return buffer.toString('utf8', 0, bytesRead);
      }

      return fs.readFileSync(filePath, 'utf8');
    } catch {
      return null;
    }
  }

  /**
   * Sanitizes a path string extracted from an untrusted stack trace.
   */
  public static sanitizePathString(rawPath: string): string {
    if (!rawPath) {
      return '';
    }

    // Strip file:// protocol if present
    let cleaned = rawPath.replace(/^file:\/\//i, '');

    // Strip query strings or line wrappers like :42:15 or (path:42)
    cleaned = cleaned.replace(/[?#].*$/, '');
    cleaned = cleaned.trim();

    return path.normalize(cleaned);
  }

  /**
   * Validates untrusted incoming webview messages against an explicit schema.
   */
  public static validateWebviewAction(msg: unknown): WebviewAction | null {
    if (!msg || typeof msg !== 'object') {
      return null;
    }
    const m = msg as Record<string, unknown>;
    if (typeof m.action !== 'string') {
      return null;
    }
    switch (m.action) {
      case 'OPEN_LOCATION': {
        if (typeof m.file !== 'string' || !m.file.trim()) {
          return null;
        }
        const line = typeof m.line === 'number' && Number.isInteger(m.line) && m.line >= 1 ? m.line : 1;
        const col = typeof m.column === 'number' && Number.isInteger(m.column) && m.column >= 1 ? m.column : undefined;
        return {
          action: 'OPEN_LOCATION',
          file: m.file.trim(),
          line,
          column: col
        };
      }
      case 'RERUN_ANALYSIS':
        return { action: 'RERUN_ANALYSIS' };
      case 'CLEAR':
        return { action: 'CLEAR' };
      case 'COPY_REPORT':
        return { action: 'COPY_REPORT' };
      case 'CONFIGURE_KEY':
        return { action: 'CONFIGURE_KEY' };
      default:
        return null;
    }
  }
}

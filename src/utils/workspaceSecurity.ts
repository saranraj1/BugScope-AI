import * as path from 'path';
import * as fs from 'fs';

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
   * Safely resolves a path and ensures it stays strictly within the workspace root.
   * Resolves symlinks using fs.realpathSync to prevent symlink directory escape.
   */
  public static isPathWithinWorkspace(targetPath: string, workspaceRoot: string): boolean {
    if (!targetPath || !workspaceRoot) {
      return false;
    }

    try {
      let resolvedTarget = path.resolve(targetPath);
      let resolvedRoot = path.resolve(workspaceRoot);

      // Resolve real filesystem paths to catch symlink escapes
      if (fs.existsSync(resolvedTarget)) {
        try {
          resolvedTarget = fs.realpathSync(resolvedTarget);
        } catch {}
      }
      if (fs.existsSync(resolvedRoot)) {
        try {
          resolvedRoot = fs.realpathSync(resolvedRoot);
        } catch {}
      }

      const normalizedTarget = resolvedTarget.toLowerCase();
      const normalizedRoot = resolvedRoot.toLowerCase();

      // Ensure root ends with separator for prefix check or exact match
      const rootPrefix = normalizedRoot.endsWith(path.sep)
        ? normalizedRoot
        : normalizedRoot + path.sep;

      return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(rootPrefix);
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
}

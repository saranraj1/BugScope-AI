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
    '.vscode-test'
  ]);

  /**
   * Checks if a relative or absolute directory path should be skipped.
   */
  public static isIgnoredDirectory(dirName: string): boolean {
    const base = path.basename(dirName).toLowerCase();
    return this.IGNORED_DIRS.has(base);
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
   * Prevents directory traversal attacks.
   */
  public static isPathWithinWorkspace(targetPath: string, workspaceRoot: string): boolean {
    if (!targetPath || !workspaceRoot) {
      return false;
    }

    try {
      const normalizedTarget = path.resolve(targetPath).toLowerCase();
      const normalizedRoot = path.resolve(workspaceRoot).toLowerCase();

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
   * Reads a file safely with byte bounds to avoid freezing the IDE host.
   */
  public static readBoundedTextFile(filePath: string, maxBytes: number = 250_000): string | null {
    try {
      if (this.isSensitiveFile(filePath)) {
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

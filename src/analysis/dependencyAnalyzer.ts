import * as path from 'path';
import * as fs from 'fs';
import { WorkspaceSecurity } from '../utils/workspaceSecurity';
import { EvidenceRecord } from '../models/analysisResult';

export interface ModuleNode {
  fsPath: string;
  relativePath: string;
  /** Files imported by this file */
  imports: string[];
  /** Files that import this file */
  importedBy: string[];
}

/**
 * DependencyAnalyzer - Lightweight, fast AST/regex dependency mapper
 * for TypeScript & JavaScript files.
 */
export class DependencyAnalyzer {
  private workspaceRoot: string;
  private maxFilesScan: number;
  private moduleGraph: Map<string, ModuleNode> = new Map();

  constructor(workspaceRoot: string, maxFilesScan: number = 300) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.maxFilesScan = maxFilesScan;
  }

  /**
   * Scans workspace source files and builds the import/export relationship graph.
   */
  public buildGraph(): Map<string, ModuleNode> {
    this.moduleGraph.clear();
    const sourceFiles = this.collectSourceFiles(this.workspaceRoot, 0, 8);

    // Initialize nodes
    for (const file of sourceFiles) {
      const rel = path.relative(this.workspaceRoot, file).replace(/\\/g, '/');
      this.moduleGraph.set(path.resolve(file).toLowerCase(), {
        fsPath: file,
        relativePath: rel,
        imports: [],
        importedBy: []
      });
    }

    // Parse imports for each file
    for (const [key, node] of this.moduleGraph.entries()) {
      const content = WorkspaceSecurity.readBoundedTextFile(node.fsPath);
      if (!content) {
        continue;
      }

      const importedPaths = this.extractImportSpecifiers(content, node.fsPath);
      for (const targetPath of importedPaths) {
        const targetKey = path.resolve(targetPath).toLowerCase();
        node.imports.push(targetPath);

        const targetNode = this.moduleGraph.get(targetKey);
        if (targetNode) {
          targetNode.importedBy.push(node.fsPath);
        }
      }
    }

    return this.moduleGraph;
  }

  /**
   * Finds all modules connected to target files within maxHops.
   */
  public findConnectedModules(
    targetFsPaths: string[],
    maxHops: number = 2
  ): {
    connectedFiles: Map<string, { distance: number; relation: 'importer' | 'dependency'; via: string }>;
    evidence: EvidenceRecord[];
  } {
    if (this.moduleGraph.size === 0) {
      this.buildGraph();
    }

    const connected = new Map<string, { distance: number; relation: 'importer' | 'dependency'; via: string }>();
    const evidence: EvidenceRecord[] = [];

    const queue: Array<{ fsPath: string; hop: number; via: string }> = [];

    for (const target of targetFsPaths) {
      const key = path.resolve(target).toLowerCase();
      queue.push({ fsPath: target, hop: 0, via: 'target' });
    }

    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      const key = path.resolve(current.fsPath).toLowerCase();

      if (visited.has(key)) {
        continue;
      }
      visited.add(key);

      const node = this.moduleGraph.get(key);
      if (!node) {
        continue;
      }

      if (current.hop > 0 && !connected.has(key)) {
        const isDirect = current.hop === 1;
        connected.set(key, {
          distance: current.hop,
          relation: 'importer',
          via: current.via
        });

        const targetBase = path.basename(current.via);
        const currBase = path.basename(node.fsPath);

        evidence.push({
          tier: isDirect ? 'observed' : 'inferred',
          category: 'dependency_caller',
          description: isDirect
            ? `${node.relativePath} directly imports ${targetBase}`
            : `${node.relativePath} is in the call/import chain of ${targetBase} (${current.hop} hops)`,
          location: {
            relativePath: node.relativePath
          },
          weight: isDirect ? 0.8 : 0.4
        });
      }

      if (current.hop < maxHops) {
        // Trace files that import current (callers/dependents)
        for (const caller of node.importedBy) {
          if (!visited.has(caller.toLowerCase())) {
            queue.push({ fsPath: caller, hop: current.hop + 1, via: node.fsPath });
          }
        }

        // Trace files imported by current (dependencies)
        for (const dep of node.imports) {
          if (!visited.has(dep.toLowerCase())) {
            const depKey = dep.toLowerCase();
            if (!connected.has(depKey) && current.hop + 1 <= maxHops) {
              const isDirect = current.hop === 0;
              const depNode = this.moduleGraph.get(depKey);
              if (depNode) {
                connected.set(depKey, {
                  distance: current.hop + 1,
                  relation: 'dependency',
                  via: node.fsPath
                });

                evidence.push({
                  tier: isDirect ? 'observed' : 'inferred',
                  category: 'dependency_import',
                  description: `${node.relativePath} imports ${depNode.relativePath}`,
                  location: {
                    relativePath: depNode.relativePath
                  },
                  weight: isDirect ? 0.7 : 0.35
                });
              }
            }
          }
        }
      }
    }

    return { connectedFiles: connected, evidence };
  }

  /**
   * Recursively finds source files (.ts, .tsx, .js, .jsx) avoiding ignored folders.
   */
  private collectSourceFiles(dir: string, depth: number, maxDepth: number): string[] {
    const results: string[] = [];
    if (depth > maxDepth || results.length >= this.maxFilesScan || !fs.existsSync(dir)) {
      return results;
    }

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (results.length >= this.maxFilesScan) {
          break;
        }

        if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(ext)) {
            // Ignore declaration files
            if (!entry.name.endsWith('.d.ts')) {
              results.push(path.join(dir, entry.name));
            }
          }
        } else if (entry.isDirectory()) {
          if (!WorkspaceSecurity.isIgnoredDirectory(entry.name)) {
            const sub = this.collectSourceFiles(path.join(dir, entry.name), depth + 1, maxDepth);
            results.push(...sub);
          }
        }
      }
    } catch {
      // Ignore directory access errors
    }

    return results;
  }

  /**
   * Extracts static import specifiers from file content and resolves them to disk.
   */
  private extractImportSpecifiers(content: string, sourceFilePath: string): string[] {
    const resolvedImports: string[] = [];
    const sourceDir = path.dirname(sourceFilePath);

    // Regex matching:
    // import ... from './target'
    // import './target'
    // export ... from './target'
    // const x = require('./target')
    const importRegex = /(?:import\s+(?:[\w\s{},*]+from\s+)?|export\s+(?:[\w\s{},*]+from\s+)?|require\s*\(\s*)['"]([^'"]+)['"]/g;

    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(content)) !== null) {
      const specifier = match[1];

      // Only resolve relative project imports (starts with ./ or ../)
      if (specifier.startsWith('.')) {
        const resolved = this.resolveRelativeModule(sourceDir, specifier);
        if (resolved) {
          resolvedImports.push(resolved);
        }
      }
    }

    return resolvedImports;
  }

  /**
   * Resolves relative import specifiers to real files with extensions (.ts, .js, /index.ts).
   */
  private resolveRelativeModule(sourceDir: string, specifier: string): string | null {
    const basePath = path.resolve(sourceDir, specifier);

    // Direct check
    if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) {
      return basePath;
    }

    // Try extensions
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'];
    for (const ext of extensions) {
      const candidate = basePath + ext;
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }

    return null;
  }
}

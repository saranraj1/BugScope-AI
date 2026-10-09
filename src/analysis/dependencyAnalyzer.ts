import * as path from 'path';
import * as fs from 'fs';
import * as ts from 'typescript';
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
 * DependencyAnalyzer - TypeScript/JavaScript AST & Python dependency mapper.
 * Enforces a strict global file-scan budget across the entire workspace.
 */
export class DependencyAnalyzer {
  private workspaceRoots: string[];
  private maxFilesScan: number;
  private moduleGraph: Map<string, ModuleNode> = new Map();
  private tsConfigPathsCache: Map<string, string[]> = new Map();

  /** Whether the workspace file scan was truncated due to budget exhaustion */
  public isTruncated: boolean = false;
  /** Total number of source files scanned */
  public totalScannedFiles: number = 0;

  constructor(workspaceRootOrRoots: string | string[], maxFilesScanOrOptions: number | { maxFilesScan?: number } = 300) {
    if (Array.isArray(workspaceRootOrRoots)) {
      this.workspaceRoots = workspaceRootOrRoots.map((r) => path.resolve(r));
    } else {
      this.workspaceRoots = [path.resolve(workspaceRootOrRoots)];
    }
    if (typeof maxFilesScanOrOptions === 'number') {
      this.maxFilesScan = maxFilesScanOrOptions;
    } else if (maxFilesScanOrOptions && typeof maxFilesScanOrOptions.maxFilesScan === 'number') {
      this.maxFilesScan = maxFilesScanOrOptions.maxFilesScan;
    } else {
      this.maxFilesScan = 300;
    }
    this.loadTsConfigPaths();
  }

  public get workspaceRoot(): string {
    return this.workspaceRoots[0] || process.cwd();
  }

  /**
   * Identifies which workspace root owns a given file path.
   */
  public findOwningWorkspaceRoot(filePath: string): string {
    for (const root of this.workspaceRoots) {
      if (WorkspaceSecurity.isPathWithinWorkspace(filePath, root)) {
        return root;
      }
    }
    return this.workspaceRoot;
  }

  /**
   * Scans workspace source files and builds the import/export relationship graph.
   * Enforces global maxFilesScan budget across all directory branches and workspace roots.
   */
  public buildGraph(): Map<string, ModuleNode> {
    this.moduleGraph.clear();
    this.isTruncated = false;

    const collected = new Set<string>();
    for (const root of this.workspaceRoots) {
      this.collectSourceFiles(root, 0, 8, collected);
    }
    this.totalScannedFiles = collected.size;

    // Initialize nodes
    for (const file of collected) {
      const root = this.findOwningWorkspaceRoot(file);
      const rel = path.relative(root, file).replace(/\\/g, '/');
      const key = WorkspaceSecurity.normalizeForComparison(file);

      this.moduleGraph.set(key, {
        fsPath: file,
        relativePath: rel,
        imports: [],
        importedBy: []
      });
    }

    // Parse imports for each file
    for (const [_key, node] of this.moduleGraph.entries()) {
      const content = WorkspaceSecurity.readBoundedTextFile(node.fsPath);
      if (!content) {
        continue;
      }

      const ext = path.extname(node.fsPath).toLowerCase();
      const importedPaths = ext === '.py'
        ? this.extractPythonImports(content, node.fsPath)
        : this.extractImportSpecifiers(content, node.fsPath);

      // Deduplicate edges
      const uniqueTargets = Array.from(new Set(importedPaths));

      for (const targetPath of uniqueTargets) {
        const targetKey = WorkspaceSecurity.normalizeForComparison(targetPath);
        node.imports.push(targetPath);

        const targetNode = this.moduleGraph.get(targetKey);
        if (targetNode) {
          if (!targetNode.importedBy.includes(node.fsPath)) {
            targetNode.importedBy.push(node.fsPath);
          }
        }
      }
    }

    return this.moduleGraph;
  }

  /**
   * Returns the module graph node for a given file path if indexed.
   */
  public getNode(fsPath: string): ModuleNode | undefined {
    return this.moduleGraph.get(WorkspaceSecurity.normalizeForComparison(fsPath));
  }

  /**
   * Finds all modules connected to target files within maxHops.
   */
  public findConnectedModules(
    targetFsPaths: string[],
    maxHops: number = 2
  ): {
    connectedFiles: Map<string, { distance: number; relation: 'importer' | 'dependency'; via: string; importedByCount?: number }>;
    evidence: EvidenceRecord[];
  } {
    if (this.moduleGraph.size === 0) {
      this.buildGraph();
    }

    const connected = new Map<string, { distance: number; relation: 'importer' | 'dependency'; via: string; importedByCount?: number }>();
    const evidence: EvidenceRecord[] = [];

    const queue: Array<{
      fsPath: string;
      hop: number;
      via: string;
      relation: 'importer' | 'dependency';
    }> = [];

    for (const target of targetFsPaths) {
      queue.push({ fsPath: target, hop: 0, via: target, relation: 'importer' });
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
          relation: current.relation,
          via: current.via,
          importedByCount: node.importedBy.length
        });

        const viaBase = path.basename(current.via);

        if (current.relation === 'importer') {
          evidence.push({
            tier: isDirect ? 'observed' : 'inferred',
            category: 'dependency_caller',
            description: isDirect
              ? `${node.relativePath} directly imports ${viaBase}`
              : `${node.relativePath} is in the call/import chain of ${viaBase} (${current.hop} hops)`,
            location: {
              relativePath: node.relativePath
            },
            weight: isDirect ? 0.8 : 0.4
          });
        } else {
          evidence.push({
            tier: isDirect ? 'observed' : 'inferred',
            category: 'dependency_import',
            description: isDirect
              ? `${viaBase} directly imports ${node.relativePath}`
              : `${viaBase} depends on ${node.relativePath} (${current.hop} hops)`,
            location: {
              relativePath: node.relativePath
            },
            weight: isDirect ? 0.7 : 0.35
          });
        }
      }

      if (current.hop < maxHops) {
        // Trace files that import current (callers/dependents)
        for (const caller of node.importedBy) {
          if (!visited.has(caller.toLowerCase())) {
            queue.push({
              fsPath: caller,
              hop: current.hop + 1,
              via: node.fsPath,
              relation: 'importer'
            });
          }
        }

        // Trace files imported by current (dependencies)
        for (const dep of node.imports) {
          if (!visited.has(dep.toLowerCase())) {
            queue.push({
              fsPath: dep,
              hop: current.hop + 1,
              via: node.fsPath,
              relation: 'dependency'
            });
          }
        }
      }
    }

    return { connectedFiles: connected, evidence };
  }

  /**
   * Recursively finds source files (.ts, .tsx, .js, .jsx, .py) avoiding ignored folders.
   * Enforces global maxFilesScan across all recursive subtrees.
   */
  private collectSourceFiles(
    dir: string,
    depth: number,
    maxDepth: number,
    collected: Set<string>
  ): void {
    if (depth > maxDepth || collected.size >= this.maxFilesScan || !fs.existsSync(dir)) {
      if (collected.size >= this.maxFilesScan) {
        this.isTruncated = true;
      }
      return;
    }

    const dirName = path.basename(dir);
    if (WorkspaceSecurity.isIgnoredDirectory(dirName)) {
      return;
    }

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (collected.size >= this.maxFilesScan) {
          this.isTruncated = true;
          break;
        }

        if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py'].includes(ext)) {
            // Ignore declaration files
            if (!entry.name.endsWith('.d.ts')) {
              collected.add(path.resolve(dir, entry.name));
            }
          }
        } else if (entry.isDirectory()) {
          if (!WorkspaceSecurity.isIgnoredDirectory(entry.name)) {
            this.collectSourceFiles(path.join(dir, entry.name), depth + 1, maxDepth, collected);
          }
        }
      }
    } catch {
      // Ignore unreadable directories
    }
  }

  /**
   * Loads compilerOptions.paths and baseUrl from any tsconfig.json in workspace roots.
   */
  private loadTsConfigPaths(): void {
    for (const root of this.workspaceRoots) {
      const tsConfigPath = path.join(root, 'tsconfig.json');
      if (fs.existsSync(tsConfigPath)) {
        try {
          const content = fs.readFileSync(tsConfigPath, 'utf8');
          const cleaned = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
          const parsed = JSON.parse(cleaned);
          const compilerOptions = parsed.compilerOptions || {};
          const baseUrl = compilerOptions.baseUrl ? path.resolve(root, compilerOptions.baseUrl) : root;
          const pathsObj = compilerOptions.paths || {};

          for (const [aliasPattern, targetList] of Object.entries(pathsObj)) {
            if (Array.isArray(targetList)) {
              const cleanAlias = aliasPattern.replace(/\/\*$/, '');
              const resolvedTargets = targetList.map((t: string) =>
                path.resolve(baseUrl, t.replace(/\/\*$/, ''))
              );
              this.tsConfigPathsCache.set(cleanAlias, resolvedTargets);
            }
          }
        } catch {}
      }
    }
  }

  /**
   * Resolves path alias specifiers using tsconfig.json or convention (@/, ~/).
   */
  private resolveAliasModule(specifier: string): string | null {
    // 1. Configured tsconfig paths
    for (const [aliasPrefix, targetDirs] of this.tsConfigPathsCache.entries()) {
      if (specifier === aliasPrefix || specifier.startsWith(aliasPrefix + '/')) {
        const subPath = specifier.substring(aliasPrefix.length).replace(/^\/+/, '');
        for (const targetDir of targetDirs) {
          const candidateBase = subPath ? path.join(targetDir, subPath) : targetDir;
          const resolved = this.resolveFileWithExtensions(candidateBase);
          if (resolved) {
            return resolved;
          }
        }
      }
    }

    // 2. Modern Next.js / TypeScript path aliases (@/ or ~/)
    if (specifier.startsWith('@/') || specifier.startsWith('~/')) {
      const aliasSub = specifier.substring(2);
      for (const root of this.workspaceRoots) {
        const candidates = [
          path.join(root, 'src', aliasSub),
          path.join(root, aliasSub)
        ];
        for (const cand of candidates) {
          const resolved = this.resolveFileWithExtensions(cand);
          if (resolved) {
            return resolved;
          }
        }
      }
    }

    return null;
  }

  /**
   * Extracts static import specifiers using TypeScript Compiler AST (or lexical fallback)
   * completely ignoring comments and string literals.
   */
  private extractImportSpecifiers(content: string, sourceFilePath: string): string[] {
    const rawSpecifiers: string[] = [];
    const sourceDir = path.dirname(sourceFilePath);

    try {
      const sourceFile = ts.createSourceFile(
        sourceFilePath,
        content,
        ts.ScriptTarget.Latest,
        false
      );

      const visit = (node: ts.Node) => {
        // 1. Static import: import ... from '...'
        if (ts.isImportDeclaration(node)) {
          if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
            rawSpecifiers.push(node.moduleSpecifier.text);
          }
        }
        // 2. Static re-export: export ... from '...'
        else if (ts.isExportDeclaration(node)) {
          if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
            rawSpecifiers.push(node.moduleSpecifier.text);
          }
        }
        // 3. Dynamic import(...) or require(...)
        else if (ts.isCallExpression(node)) {
          if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            const firstArg = node.arguments[0];
            if (firstArg && ts.isStringLiteral(firstArg)) {
              rawSpecifiers.push(firstArg.text);
            }
          } else if (
            ts.isIdentifier(node.expression) &&
            node.expression.text === 'require'
          ) {
            const firstArg = node.arguments[0];
            if (firstArg && ts.isStringLiteral(firstArg)) {
              rawSpecifiers.push(firstArg.text);
            }
          }
        }

        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
    } catch {
      // Fallback: Strip comments first and use regex if AST throws
      const stripped = content
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      const importRegex = /(?:import\s+(?:[\w\s{},*]+from\s+)?|import\s*\(\s*|export\s+(?:[\w\s{},*]+from\s+)?|require\s*\(\s*)['"]([^'"]+)['"]/g;
      let m: RegExpExecArray | null;
      while ((m = importRegex.exec(stripped)) !== null) {
        rawSpecifiers.push(m[1]);
      }
    }

    const resolvedImports = new Set<string>();

    for (const specifier of rawSpecifiers) {
      if (specifier.startsWith('.')) {
        const resolved = this.resolveRelativeModule(sourceDir, specifier);
        if (resolved) {
          resolvedImports.add(resolved);
        }
      } else {
        const resolved = this.resolveAliasModule(specifier);
        if (resolved) {
          resolvedImports.add(resolved);
        }
      }
    }

    return Array.from(resolvedImports);
  }

  /**
   * Resolves a file path candidate against standard source code extensions.
   */
  private resolveFileWithExtensions(basePath: string): string | null {
    // Direct check
    if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) {
      return basePath;
    }

    // Try extensions (including .tsx, .jsx, /index.tsx, .mjs, .cjs)
    const extensions = [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.mjs',
      '.cjs',
      '/index.ts',
      '/index.tsx',
      '/index.js',
      '/index.jsx'
    ];
    for (const ext of extensions) {
      const candidate = basePath + ext;
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }

    return null;
  }

  /**
   * Resolves relative import specifiers to real files with extensions.
   */
  private resolveRelativeModule(sourceDir: string, specifier: string): string | null {
    const basePath = path.resolve(sourceDir, specifier);
    return this.resolveFileWithExtensions(basePath);
  }

  /**
   * Extracts Python imports (relative 'from . import ...' and workspace 'import ...')
   * and resolves them to concrete workspace .py or __init__.py files.
   */
  private extractPythonImports(content: string, sourceFilePath: string): string[] {
    const resolvedImports = new Set<string>();
    const sourceDir = path.dirname(sourceFilePath);
    const searchRoots = [
      sourceDir,
      this.workspaceRoot,
      path.join(this.workspaceRoot, 'src')
    ].filter((dir) => fs.existsSync(dir));

    // Fold multi-line parenthesized imports into single logical statements
    // e.g. from checkout import (\n  calculate_discount,\n  apply_coupon\n)
    const foldedContent = content
      .replace(/(from\s+[^\n]+?import\s*)\(([^)]+)\)/gs, (_, prefix, inner) => {
        const cleanedInner = inner
          .split(/\r?\n/)
          .map((l: string) => l.split('#')[0].trim())
          .filter(Boolean)
          .join(' ');
        return `${prefix} ${cleanedInner}`;
      })
      .replace(/(import\s*)\(([^)]+)\)/gs, (_, prefix, inner) => {
        const cleanedInner = inner
          .split(/\r?\n/)
          .map((l: string) => l.split('#')[0].trim())
          .filter(Boolean)
          .join(' ');
        return `${prefix} ${cleanedInner}`;
      });

    const lines = foldedContent.split(/\r?\n/);

    for (const rawLine of lines) {
      // Strip comments
      const line = rawLine.split('#')[0].trim();
      if (!line) {
        continue;
      }

      // Pattern 1: from <module> import <items>
      const fromMatch = line.match(/^from\s+(\.+[\w.]*|[\w.]+)\s+import\s+(.+)$/);
      if (fromMatch) {
        const mod = fromMatch[1];
        const items = fromMatch[2]
          .replace(/[()]/g, '')
          .split(',')
          .map((i) => i.trim().split(/\s+as\s+/)[0].trim())
          .filter(Boolean);

        if (mod.startsWith('.')) {
          // Relative Python import (e.g. from . import x, from .utils import y, from ..models import z)
          const dotsMatch = mod.match(/^\.+/);
          const dotCount = dotsMatch ? dotsMatch[0].length : 1;
          const remainingMod = mod.substring(dotCount);

          let baseDir = sourceDir;
          for (let i = 1; i < dotCount; i++) {
            baseDir = path.dirname(baseDir);
          }

          if (remainingMod) {
            const modRel = remainingMod.replace(/\./g, path.sep);
            const targetPath = path.join(baseDir, modRel);
            this.tryAddPythonFile(targetPath + '.py', resolvedImports);
            this.tryAddPythonFile(path.join(targetPath, '__init__.py'), resolvedImports);

            // Also check if any imported items are submodules/files inside targetPath
            for (const item of items) {
              this.tryAddPythonFile(path.join(targetPath, item + '.py'), resolvedImports);
              this.tryAddPythonFile(path.join(targetPath, item, '__init__.py'), resolvedImports);
            }
          } else {
            // from . import a, b
            for (const item of items) {
              this.tryAddPythonFile(path.join(baseDir, item + '.py'), resolvedImports);
              this.tryAddPythonFile(path.join(baseDir, item, '__init__.py'), resolvedImports);
            }
          }
        } else {
          // Absolute / package import (e.g. from checkout import calculate, from src.checkout import calculate)
          for (const root of searchRoots) {
            const modRel = mod.replace(/\./g, path.sep);
            const candidate = path.join(root, modRel);

            this.tryAddPythonFile(candidate + '.py', resolvedImports);
            this.tryAddPythonFile(path.join(candidate, '__init__.py'), resolvedImports);

            // Also check if any imported item is a submodule
            for (const item of items) {
              this.tryAddPythonFile(path.join(candidate, item + '.py'), resolvedImports);
              this.tryAddPythonFile(path.join(candidate, item, '__init__.py'), resolvedImports);
            }
          }
        }
        continue;
      }

      // Pattern 2: import <module1>, <module2>
      const importMatch = line.match(/^import\s+(.+)$/);
      if (importMatch) {
        const mods = importMatch[1]
          .split(',')
          .map((m) => m.trim().split(/\s+as\s+/)[0].trim())
          .filter(Boolean);

        for (const mod of mods) {
          for (const root of searchRoots) {
            const modRel = mod.replace(/\./g, path.sep);
            const candidate = path.join(root, modRel);

            this.tryAddPythonFile(candidate + '.py', resolvedImports);
            this.tryAddPythonFile(path.join(candidate, '__init__.py'), resolvedImports);
          }
        }
      }
    }

    return Array.from(resolvedImports);
  }

  private tryAddPythonFile(candidatePath: string, set: Set<string>): void {
    if (
      fs.existsSync(candidatePath) &&
      fs.statSync(candidatePath).isFile() &&
      this.workspaceRoots.some((r) => WorkspaceSecurity.isPathWithinWorkspace(candidatePath, r))
    ) {
      set.add(path.resolve(candidatePath));
    }
  }
}

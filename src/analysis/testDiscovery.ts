import * as path from 'path';
import * as fs from 'fs';
import { TestRecommendation, EvidenceRecord } from '../models/analysisResult';
import { WorkspaceSecurity } from '../utils/workspaceSecurity';

/**
 * TestDiscovery - Locates existing workspace test suites covering candidate files
 * and suggests targeted regression tests.
 */
export class TestDiscovery {
  private workspaceRoots: string[];
  private allTestFiles: string[] = [];

  constructor(workspaceRootOrRoots: string | string[]) {
    if (Array.isArray(workspaceRootOrRoots)) {
      this.workspaceRoots = workspaceRootOrRoots.map((r) => path.resolve(r));
    } else {
      this.workspaceRoots = [path.resolve(workspaceRootOrRoots)];
    }
  }

  public get workspaceRoot(): string {
    return this.workspaceRoots[0] || process.cwd();
  }

  public findOwningWorkspaceRoot(filePath: string): string {
    for (const root of this.workspaceRoots) {
      if (WorkspaceSecurity.isPathWithinWorkspace(filePath, root)) {
        return root;
      }
    }
    return this.workspaceRoot;
  }

  /**
   * Indexes all test files across all workspace roots up to a global budget.
   */
  public indexTests(): string[] {
    const collected = new Set<string>();
    for (const root of this.workspaceRoots) {
      this.collectTests(root, 0, 7, collected, 500);
    }
    this.allTestFiles = Array.from(collected);
    return this.allTestFiles;
  }

  /**
   * Discovers tests matching the given candidate source files.
   */
  public discoverForCandidates(candidateFsPaths: string[]): {
    recommendations: TestRecommendation[];
    evidence: EvidenceRecord[];
    testScores: Map<string, number>;
  } {
    if (this.allTestFiles.length === 0) {
      this.indexTests();
    }

    const recommendations: TestRecommendation[] = [];
    const evidence: EvidenceRecord[] = [];
    const testScores = new Map<string, number>();

    for (const srcPath of candidateFsPaths) {
      const srcBase = path.basename(srcPath, path.extname(srcPath));
      const root = this.findOwningWorkspaceRoot(srcPath);
      const srcRel = path.relative(root, srcPath).replace(/\\/g, '/');

      let foundDirectTest = false;

      // 1. Look for matching test file by standard test conventions:
      // - <name>.test.<ext>
      // - <name>.spec.<ext>
      // - test_<name>.<ext>
      // - <name>_test.<ext>
      for (const testFile of this.allTestFiles) {
        const testBase = path.basename(testFile);
        const testRoot = this.findOwningWorkspaceRoot(testFile);
        const testRel = path.relative(testRoot, testFile).replace(/\\/g, '/');

        const matchesConvention =
          testBase.startsWith(srcBase + '.test.') ||
          testBase.startsWith(srcBase + '.spec.') ||
          testBase.startsWith(srcBase + '_test.') ||
          testBase.startsWith('test_' + srcBase + '.') ||
          testBase === `${srcBase}.test` ||
          testBase === `${srcBase}.spec`;

        if (matchesConvention) {
          foundDirectTest = true;
          recommendations.push({
            testPath: testFile,
            relativePath: testRel,
            targetSourcePath: srcPath,
            testType: 'existing_suite',
            reason: `Targeted test file matching module name convention (${srcBase})`
          });

          evidence.push({
            tier: 'inferred',
            category: 'test_coverage',
            description: `Discovered related test file candidate: ${testRel} (matches ${srcRel})`,
            location: { relativePath: testRel },
            weight: 0.9
          });

          testScores.set(WorkspaceSecurity.normalizeForComparison(srcPath), 1.0);
          break;
        }

        // 2. Check if test file explicitly imports the source module
        const content = WorkspaceSecurity.readBoundedTextFile(testFile, 50_000);
        if (content) {
          const importPattern = new RegExp(`(?:import|from|require)\\s*['"][^'"]*\\b${srcBase}\\b['"]`, 'i');
          if (importPattern.test(content)) {
            foundDirectTest = true;
            recommendations.push({
              testPath: testFile,
              relativePath: testRel,
              targetSourcePath: srcPath,
              testType: 'existing_suite',
              reason: `Test imports or references target module ${srcBase}`
            });

            evidence.push({
              tier: 'inferred',
              category: 'test_coverage',
              description: `Test candidate ${testRel} imports target module ${srcRel}`,
              location: { relativePath: testRel },
              weight: 0.7
            });

            testScores.set(WorkspaceSecurity.normalizeForComparison(srcPath), 0.7);
            break;
          }
        }
      }

      // If no test found, add recommended suite guidance
      if (!foundDirectTest) {
        const isPy = path.extname(srcPath).toLowerCase() === '.py';
        const defaultTestPath = isPy ? `tests/test_${srcBase}.py` : `test/${srcBase}.test.ts`;
        recommendations.push({
          testPath: '',
          relativePath: defaultTestPath,
          targetSourcePath: srcPath,
          testType: 'recommended_suite',
          reason: `No automated test suite discovered for ${srcRel}. Consider adding a unit test to verify error boundary.`
        });
        testScores.set(WorkspaceSecurity.normalizeForComparison(srcPath), 0.0);
      }
    }

    return { recommendations, evidence, testScores };
  }

  private collectTests(
    dir: string,
    depth: number,
    maxDepth: number,
    collected: Set<string>,
    maxLimit: number
  ): void {
    if (depth > maxDepth || collected.size >= maxLimit || !fs.existsSync(dir)) {
      return;
    }

    const dirName = path.basename(dir);
    if (WorkspaceSecurity.isIgnoredDirectory(dirName)) {
      return;
    }

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (collected.size >= maxLimit) {
          break;
        }

        if (entry.isFile()) {
          const name = entry.name.toLowerCase();
          if (
            name.includes('.test.') ||
            name.includes('.spec.') ||
            name.startsWith('test_') ||
            name.endsWith('_test.py') ||
            name.endsWith('_test.go')
          ) {
            collected.add(path.resolve(dir, entry.name));
          }
        } else if (entry.isDirectory() && !WorkspaceSecurity.isIgnoredDirectory(entry.name)) {
          this.collectTests(path.join(dir, entry.name), depth + 1, maxDepth, collected, maxLimit);
        }
      }
    } catch {
      // Ignore unreadable directory
    }
  }
}

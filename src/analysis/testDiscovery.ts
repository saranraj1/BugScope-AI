import * as path from 'path';
import * as fs from 'fs';
import { TestRecommendation, EvidenceRecord } from '../models/analysisResult';
import { WorkspaceSecurity } from '../utils/workspaceSecurity';

/**
 * TestDiscovery - Locates existing workspace test suites covering candidate files
 * and suggests targeted regression tests.
 */
export class TestDiscovery {
  private workspaceRoot: string;
  private allTestFiles: string[] = [];

  constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  /**
   * Indexes all test files in the workspace.
   */
  public indexTests(): string[] {
    this.allTestFiles = [];
    this.collectTests(this.workspaceRoot, 0, 7);
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
      const srcRel = path.relative(this.workspaceRoot, srcPath).replace(/\\/g, '/');

      let foundDirectTest = false;

      // 1. Look for matching test file by filename
      for (const testFile of this.allTestFiles) {
        const testBase = path.basename(testFile);
        const testRel = path.relative(this.workspaceRoot, testFile).replace(/\\/g, '/');

        // Pattern match: checkout.test.ts, checkout.spec.ts, test_checkout.py
        if (
          testBase.startsWith(srcBase + '.') ||
          testBase.startsWith(srcBase + '_') ||
          testBase.includes(srcBase)
        ) {
          foundDirectTest = true;
          recommendations.push({
            testPath: testFile,
            relativePath: testRel,
            targetSourcePath: srcPath,
            testType: 'existing_suite',
            reason: `Existing test file explicitly matches module name (${srcBase})`
          });

          evidence.push({
            tier: 'observed',
            category: 'test_coverage',
            description: `Found active test suite covering ${srcRel}: ${testRel}`,
            location: { relativePath: testRel },
            weight: 0.9
          });

          testScores.set(srcPath.toLowerCase(), 1.0);
          break;
        }

        // 2. Check if test file imports the source file
        const content = WorkspaceSecurity.readBoundedTextFile(testFile, 50_000);
        if (content && content.includes(srcBase)) {
          foundDirectTest = true;
          recommendations.push({
            testPath: testFile,
            relativePath: testRel,
            targetSourcePath: srcPath,
            testType: 'existing_suite',
            reason: `Test imports or references ${srcBase}`
          });

          evidence.push({
            tier: 'inferred',
            category: 'test_coverage',
            description: `${testRel} references ${srcRel}`,
            location: { relativePath: testRel },
            weight: 0.7
          });

          testScores.set(srcPath.toLowerCase(), 0.7);
          break;
        }
      }

      // If no test found, add recommended suite guidance
      if (!foundDirectTest) {
        recommendations.push({
          testPath: '',
          relativePath: `test/${srcBase}.test.ts`,
          targetSourcePath: srcPath,
          testType: 'recommended_suite',
          reason: `No automated test suite discovered for ${srcRel}. Add unit test to verify error boundary.`
        });
        testScores.set(srcPath.toLowerCase(), 0.0);
      }
    }

    return { recommendations, evidence, testScores };
  }

  private collectTests(dir: string, depth: number, maxDepth: number) {
    if (depth > maxDepth || !fs.existsSync(dir)) {
      return;
    }

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile()) {
          const name = entry.name.toLowerCase();
          if (
            name.includes('.test.') ||
            name.includes('.spec.') ||
            name.startsWith('test_') ||
            name.endsWith('_test.go')
          ) {
            this.allTestFiles.push(path.join(dir, entry.name));
          }
        } else if (entry.isDirectory()) {
          if (!WorkspaceSecurity.isIgnoredDirectory(entry.name)) {
            this.collectTests(path.join(dir, entry.name), depth + 1, maxDepth);
          }
        }
      }
    } catch {
      // Ignore directory access error
    }
  }
}

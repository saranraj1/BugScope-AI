import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { ReportBuilder } from '../src/analysis/reportBuilder';
import { AiAdapter } from '../src/ai/aiAdapter';

describe('BugScope AI - End-to-End Workflow Tests', () => {
  const projectRoot = path.join(__dirname, 'fixtures', 'sample-project');
  const tracePath = path.join(__dirname, 'fixtures', 'traces', 'valid-typescript.log');

  it('1. Executes complete local analysis on valid error fixture', async () => {
    const rawTrace = fs.readFileSync(tracePath, 'utf8');

    const report = await ReportBuilder.analyze(rawTrace, {
      workspaceRoots: [projectRoot]
    });

    // 1. Error summary
    assert.strictEqual(report.errorSummary.type, 'TypeError');
    assert.ok(report.errorSummary.message.includes("Cannot read properties of undefined"));

    // 2. Primary location
    assert.ok(report.primaryLocation);
    assert.strictEqual(report.primaryLocation.relativePath, 'src/checkout.ts');
    assert.strictEqual(report.primaryLocation.line, 27);
    assert.ok(report.primaryLocation.snippet);

    // 3. Candidates
    assert.ok(report.candidates.length >= 2);
    assert.strictEqual(report.candidates[0].rank, 1);
    assert.strictEqual(report.candidates[0].relativePath, 'src/checkout.ts');

    // 4. Test discovery
    assert.ok(report.suggestedTests.length > 0);
    const hasCheckoutTest = report.suggestedTests.some(
      (t) => t.relativePath.includes('checkout.test.ts') && t.testType === 'existing_suite'
    );
    assert.strictEqual(hasCheckoutTest, true);

    // 5. Evidence
    assert.ok(report.evidence.length > 0);
    assert.ok(report.evidence.some((e) => e.tier === 'observed'));
    assert.ok(report.evidence.some((e) => e.tier === 'inferred'));

    // 6. 100% offline baseline
    assert.strictEqual(report.aiEnrichment, undefined);
  });

  it('2. Gracefully handles unavailable AI endpoint without failing local report', async () => {
    const rawTrace = fs.readFileSync(tracePath, 'utf8');

    const report = await ReportBuilder.analyze(rawTrace, {
      workspaceRoots: [projectRoot]
    });

    const aiAdapter = new AiAdapter({
      enabled: true,
      endpoint: 'http://127.0.0.1:59999/v1', // Non-existent offline endpoint
      model: 'test-model',
      timeoutMs: 500
    });

    const enrichment = await aiAdapter.enrich(report);
    // Must gracefully return undefined without throwing
    assert.strictEqual(enrichment, undefined);
    assert.ok(report.candidates.length > 0);
  });
});

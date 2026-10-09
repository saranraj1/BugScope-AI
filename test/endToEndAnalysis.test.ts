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

  it('3. AiAdapter safely accepts apiKey and fails gracefully if endpoint is unreachable', async () => {
    const rawTrace = fs.readFileSync(tracePath, 'utf8');
    const report = await ReportBuilder.analyze(rawTrace, {
      workspaceRoots: [projectRoot]
    });

    const aiAdapter = new AiAdapter({
      enabled: true,
      endpoint: 'http://127.0.0.1:59998/v1',
      model: 'gpt-4o-mini',
      apiKey: 'sk-test-mock-key-12345',
      timeoutMs: 300
    });

    const enrichment = await aiAdapter.enrich(report);
    assert.strictEqual(enrichment, undefined);
  });

  it('4. Executes complete local analysis on native Python traceback fixture', async () => {
    const pythonRoot = path.join(__dirname, 'fixtures', 'python-project');
    const pythonTracePath = path.join(__dirname, 'fixtures', 'traces', 'python-traceback.log');
    const rawTrace = fs.readFileSync(pythonTracePath, 'utf8');

    const report = await ReportBuilder.analyze(rawTrace, {
      workspaceRoots: [pythonRoot]
    });

    // 1. Error summary
    assert.strictEqual(report.errorSummary.type, 'KeyError');
    assert.ok(report.errorSummary.message.includes("'discount'"));

    // 2. Primary location
    assert.ok(report.primaryLocation);
    assert.strictEqual(report.primaryLocation.relativePath, 'src/checkout.py');
    assert.strictEqual(report.primaryLocation.line, 28);
    assert.ok(report.primaryLocation.snippet);
    assert.ok(
      report.primaryLocation.snippet.lines.some(
        (l) => l.isTarget && l.content.includes("discount_rate = cart['discount']['rate']")
      )
    );

    // 3. Candidates and rankings
    assert.ok(report.candidates.length >= 3);
    assert.strictEqual(report.candidates[0].rank, 1);
    assert.strictEqual(report.candidates[0].relativePath, 'src/checkout.py');
    assert.strictEqual(report.candidates[0].signals.confidenceTier, 'HIGH');

    // 4. Test recommendations
    assert.ok(report.suggestedTests.length > 0);
    const hasPythonTest = report.suggestedTests.some(
      (t) => t.relativePath.includes('test_checkout.py') && t.testType === 'existing_suite'
    );
    assert.strictEqual(hasPythonTest, true);

    // 5. Evidence records
    assert.ok(report.evidence.length > 0);
    assert.ok(report.evidence.some((e) => e.category === 'stack_frame'));
    assert.ok(report.evidence.some((e) => e.category === 'dependency_caller'));
  });

  it('5. Formats AnalysisReport into structured, shareable Markdown summary', async () => {
    const rawTrace = fs.readFileSync(tracePath, 'utf8');
    const report = await ReportBuilder.analyze(rawTrace, {
      workspaceRoots: [projectRoot]
    });

    const md = ReportBuilder.formatReportToMarkdown(report);

    assert.ok(md.includes('### 🔍 BugScope AI Diagnostic Report'));
    assert.ok(md.includes('TypeError'));
    assert.ok(md.includes('#### 🎯 Ranked Impact Candidates'));
    assert.ok(md.includes('| #1 |'));
    assert.ok(md.includes('checkout.ts'));
    assert.ok(md.includes('#### 🧪 Targeted Test Coverage'));
  });
});

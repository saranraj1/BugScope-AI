import * as assert from 'assert';
import * as path from 'path';
import { DependencyAnalyzer } from '../src/analysis/dependencyAnalyzer';

describe('DependencyAnalyzer Tests', () => {
  const projectRoot = path.join(__dirname, 'fixtures', 'sample-project');

  it('1. Extracts static imports and builds relationship graph', () => {
    const analyzer = new DependencyAnalyzer(projectRoot);
    const graph = analyzer.buildGraph();

    assert.ok(graph.size >= 3);

    const checkoutKey = path.join(projectRoot, 'src', 'checkout.ts').toLowerCase();
    const checkoutNode = graph.get(checkoutKey);
    assert.ok(checkoutNode, 'checkout.ts should be indexed in graph');

    // orderService.ts imports checkout.ts
    const hasOrderServiceAsCaller = checkoutNode.importedBy.some((p) =>
      p.toLowerCase().includes('orderservice.ts')
    );
    assert.strictEqual(hasOrderServiceAsCaller, true);
  });

  it('2. Discovers 1-hop and 2-hop connected modules', () => {
    const analyzer = new DependencyAnalyzer(projectRoot);
    const checkoutPath = path.join(projectRoot, 'src', 'checkout.ts');

    const { connectedFiles, evidence } = analyzer.findConnectedModules([checkoutPath], 2);

    assert.ok(connectedFiles.size >= 1);

    // orderService should be distance 1
    const orderServiceKey = path.join(projectRoot, 'src', 'orderService.ts').toLowerCase();
    const orderInfo = connectedFiles.get(orderServiceKey);
    assert.ok(orderInfo);
    assert.strictEqual(orderInfo.distance, 1);

    // cart.ts should be distance 2 (via orderService)
    const cartKey = path.join(projectRoot, 'src', 'routes', 'cart.ts').toLowerCase();
    const cartInfo = connectedFiles.get(cartKey);
    assert.ok(cartInfo);
    assert.strictEqual(cartInfo.distance, 2);

    // Evidence checks
    assert.ok(evidence.length > 0);
    assert.ok(evidence.some((e) => e.tier === 'observed'));
    assert.ok(evidence.some((e) => e.tier === 'inferred'));
  });
});

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

  it('3. Extracts native Python imports and builds dependency graph', () => {
    const pythonRoot = path.join(__dirname, 'fixtures', 'python-project');
    const analyzer = new DependencyAnalyzer(pythonRoot);
    const graph = analyzer.buildGraph();

    assert.ok(graph.size >= 3, `Expected at least 3 python files indexed, got ${graph.size}`);

    const checkoutKey = path.join(pythonRoot, 'src', 'checkout.py').toLowerCase();
    const checkoutNode = graph.get(checkoutKey);
    assert.ok(checkoutNode, 'checkout.py should be indexed in graph');

    // order_service.py imports checkout.py
    const hasOrderService = checkoutNode.importedBy.some((p) =>
      p.toLowerCase().includes('order_service.py')
    );
    assert.strictEqual(hasOrderService, true, 'order_service.py should be an importer of checkout.py');

    // order_service.py should be imported by routes/cart.py
    const orderServiceKey = path.join(pythonRoot, 'src', 'order_service.py').toLowerCase();
    const orderNode = graph.get(orderServiceKey);
    assert.ok(orderNode);
    const hasCartRoute = orderNode.importedBy.some((p) =>
      p.toLowerCase().includes('cart.py')
    );
    assert.strictEqual(hasCartRoute, true, 'cart.py should be an importer of order_service.py');
  });

  it('4. Discovers 1-hop and 2-hop connected modules in Python project', () => {
    const pythonRoot = path.join(__dirname, 'fixtures', 'python-project');
    const analyzer = new DependencyAnalyzer(pythonRoot);
    const checkoutPath = path.join(pythonRoot, 'src', 'checkout.py');

    const { connectedFiles, evidence } = analyzer.findConnectedModules([checkoutPath], 2);

    assert.ok(connectedFiles.size >= 2);

    const orderServiceKey = path.join(pythonRoot, 'src', 'order_service.py').toLowerCase();
    const orderInfo = connectedFiles.get(orderServiceKey);
    assert.ok(orderInfo, 'order_service.py should be connected');
    assert.strictEqual(orderInfo.distance, 1);
    assert.strictEqual(orderInfo.relation, 'importer');

    const cartKey = path.join(pythonRoot, 'src', 'routes', 'cart.py').toLowerCase();
    const cartInfo = connectedFiles.get(cartKey);
    assert.ok(cartInfo, 'cart.py should be connected at distance 2');
    assert.strictEqual(cartInfo.distance, 2);
    assert.strictEqual(cartInfo.relation, 'importer');

    assert.ok(evidence.length > 0);
  });
});

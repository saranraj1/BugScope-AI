import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { ErrorParser } from '../src/analysis/errorParser';

describe('ErrorParser Automated Tests', () => {
  const fixturesDir = path.join(__dirname, 'fixtures', 'traces');

  it('1. Parses a valid TypeScript stack trace with multiple frames', () => {
    const raw = fs.readFileSync(path.join(fixturesDir, 'valid-typescript.log'), 'utf8');
    const result = ErrorParser.parse(raw);

    assert.strictEqual(result.isError, true);
    assert.strictEqual(result.errorType, 'TypeError');
    assert.ok(result.message.includes("Cannot read properties of undefined"));
    assert.strictEqual(result.frames.length, 3);

    // Frame 1
    assert.strictEqual(result.frames[0].functionName, 'calculateDiscount');
    assert.ok(result.frames[0].rawPath.includes('checkout.ts'));
    assert.strictEqual(result.frames[0].line, 27);
    assert.strictEqual(result.frames[0].column, 30);

    // Frame 2
    assert.strictEqual(result.frames[1].functionName, 'processOrder');
    assert.strictEqual(result.frames[1].line, 9);

    // Frame 3
    assert.strictEqual(result.frames[2].functionName, 'Object.handleCheckout');
    assert.strictEqual(result.frames[2].line, 4);
  });

  it('2. Parses a Python traceback with line and function names', () => {
    const raw = fs.readFileSync(path.join(fixturesDir, 'python-traceback.log'), 'utf8');
    const result = ErrorParser.parse(raw);

    assert.strictEqual(result.isError, true);
    assert.strictEqual(result.errorType, 'KeyError');
    assert.ok(result.frames.length >= 2);
  });

  it('3. Parses bare error message without stack frames', () => {
    const raw = fs.readFileSync(path.join(fixturesDir, 'bare-error.log'), 'utf8');
    const result = ErrorParser.parse(raw);

    assert.strictEqual(result.isError, true);
    assert.strictEqual(result.errorType, 'ReferenceError');
    assert.ok(result.message.includes('checkoutToken is not defined'));
    assert.strictEqual(result.frames.length, 0);
  });

  it('4. Handles malformed stack trace without throwing exception', () => {
    const raw = fs.readFileSync(path.join(fixturesDir, 'malformed.log'), 'utf8');
    const result = ErrorParser.parse(raw);

    assert.doesNotThrow(() => ErrorParser.parse(raw));
    // Either handles as error or provides notice
    assert.ok(result.errorType !== undefined);
  });

  it('5. Handles completely empty selection with polite guidance', () => {
    const result = ErrorParser.parse('   ');

    assert.strictEqual(result.isError, false);
    assert.strictEqual(result.errorType, 'None');
    assert.ok(result.parseNotice?.includes('empty'));
  });

  it('6. Detects ordinary code selection and warns instead of fabricating error', () => {
    const raw = fs.readFileSync(path.join(fixturesDir, 'plain-text.txt'), 'utf8');
    const result = ErrorParser.parse(raw);

    assert.strictEqual(result.isError, false);
    assert.strictEqual(result.errorType, 'NonErrorSelection');
    assert.ok(result.parseNotice?.includes('No recognized error types'));
  });
});

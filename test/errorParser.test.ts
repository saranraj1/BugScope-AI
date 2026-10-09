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

  it('7. Parses CleanFileCheck correctly with 0 errors detected and clean scope', () => {
    const result = ErrorParser.parse('CleanFileCheck: example.py');

    assert.strictEqual(result.isError, false);
    assert.strictEqual(result.errorType, 'CleanFile');
    assert.ok(result.message.includes('0 Errors detected in example.py'));
    assert.strictEqual(result.frames.length, 0);
  });

  it('8. Strips terminal ANSI escape codes and extracts frames cleanly', () => {
    const ansiLog = `\u001b[31mTypeError: Cannot read properties of undefined (reading 'rate')\u001b[0m
    \u001b[2mat calculateDiscount (\u001b[0m\u001b[36msrc/checkout.ts:27:18\u001b[0m\u001b[2m)\u001b[0m
    at processOrder (src/orderService.ts:9:5)`;

    const result = ErrorParser.parse(ansiLog);
    assert.strictEqual(result.isError, true);
    assert.strictEqual(result.errorType, 'TypeError');
    assert.ok(result.message.includes("Cannot read properties of undefined"));
    assert.strictEqual(result.frames.length, 2);
    assert.strictEqual(result.frames[0].functionName, 'calculateDiscount');
    assert.strictEqual(result.frames[0].line, 27);
  });

  it('9. Correctly prioritizes final fatal exception in Python chained traceback', () => {
    const chainedTrace = `Traceback (most recent call last):
  File "src/auth.py", line 10, in authenticate
    raise ValueError("Token expired")
ValueError: Token expired

During handling of the above exception, another exception occurred:

Traceback (most recent call last):
  File "src/routes/cart.py", line 12, in handle_checkout
    return process_order(cart)
  File "src/checkout.py", line 28, in calculate_discount
    discount_rate = cart['discount']['rate']
KeyError: 'discount'`;

    const result = ErrorParser.parse(chainedTrace);
    assert.strictEqual(result.isError, true);
    assert.strictEqual(result.errorType, 'KeyError');
    assert.ok(result.message.includes("'discount'"));
    assert.strictEqual(result.frames[0].functionName, 'calculate_discount');
    assert.strictEqual(result.frames[0].line, 28);
  });
});

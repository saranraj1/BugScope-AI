import { ParsedError, StackFrame } from '../models/analysisResult';
import { WorkspaceSecurity } from '../utils/workspaceSecurity';

/**
 * ErrorParser - Deterministic, multi-grammar parser for stack traces and error logs.
 */
export class ErrorParser {
  // Common JS/TS error names
  private static readonly KNOWN_ERROR_TYPES = [
    'TypeError',
    'ReferenceError',
    'SyntaxError',
    'RangeError',
    'URIError',
    'EvalError',
    'AggregateError',
    'AssertionError',
    'UnhandledPromiseRejection',
    'UnhandledPromiseRejectionWarning',
    'NullPointerException',
    'IndexOutOfBoundsException',
    'KeyError',
    'ValueError',
    'AttributeError',
    'NameError',
    'RuntimeError',
    'Exception',
    'Error'
  ];

  /**
   * Main entry point: Parses raw selected text into structured ParsedError.
   */
  public static parse(rawInput: string): ParsedError {
    const trimmed = (rawInput || '').trim();

    if (!trimmed) {
      return {
        isError: false,
        errorType: 'None',
        message: 'No text was selected.',
        frames: [],
        rawText: rawInput,
        parseNotice: 'Selection was empty. Please highlight an error or stack trace in the editor.'
      };
    }

    const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

    // 1. Extract frames across all known formats
    const frames = this.extractStackFrames(lines);

    // 2. Extract error type and message header
    const headerInfo = this.extractErrorHeader(lines);

    // 3. Detect if this is actually an error
    const isError = this.validateIsError(trimmed, headerInfo, frames);

    if (!isError) {
      return {
        isError: false,
        errorType: 'NonErrorSelection',
        message: 'Selected text does not resemble an error message or stack trace.',
        frames: [],
        rawText: rawInput,
        parseNotice:
          'No recognized error types, exception banners, or stack frames found. Highlight a runtime error, log output, or stack trace.'
      };
    }

    return {
      isError: true,
      errorType: headerInfo.type,
      message: headerInfo.message,
      frames,
      rawText: rawInput
    };
  }

  /**
   * Attempts to extract stack frames across V8/JS, Python, and generic file:line patterns.
   */
  private static extractStackFrames(lines: string[]): StackFrame[] {
    const frames: StackFrame[] = [];
    const seenSignatures = new Set<string>();

    for (const line of lines) {
      const frame =
        this.parseV8Frame(line) ||
        this.parsePythonFrame(line) ||
        this.parseGenericPathFrame(line);

      if (frame) {
        const sig = `${frame.rawPath}:${frame.line}:${frame.column}:${frame.functionName}`;
        if (!seenSignatures.has(sig)) {
          seenSignatures.add(sig);
          frames.push(frame);
        }
      }
    }

    return frames;
  }

  /**
   * Parses standard Node.js / V8 / TypeScript stack frame:
   * e.g. "at calculateDiscount (checkout.ts:42:18)"
   * e.g. "at checkout.ts:42:18"
   * e.g. "at async processOrder (/app/src/order.ts:115:9)"
   */
  private static parseV8Frame(line: string): StackFrame | null {
    // Case 1: "at functionName (path:line:col)" or "at async functionName (path:line:col)"
    const matchWithFunc = line.match(/^at\s+(?:async\s+)?([^\s(]+)?\s*\((.+):(\d+):(\d+)\)$/);
    if (matchWithFunc) {
      const rawPath = matchWithFunc[2].trim();
      return {
        functionName: matchWithFunc[1] || undefined,
        rawPath: WorkspaceSecurity.sanitizePathString(rawPath),
        line: parseInt(matchWithFunc[3], 10),
        column: parseInt(matchWithFunc[4], 10),
        rawFrame: line
      };
    }

    // Case 2: "at path:line:col" (anonymous top-level)
    const matchDirectPath = line.match(/^at\s+(?:async\s+)?(.+):(\d+):(\d+)$/);
    if (matchDirectPath) {
      const rawPath = matchDirectPath[1].trim();
      return {
        functionName: '<anonymous>',
        rawPath: WorkspaceSecurity.sanitizePathString(rawPath),
        line: parseInt(matchDirectPath[2], 10),
        column: parseInt(matchDirectPath[3], 10),
        rawFrame: line
      };
    }

    // Case 3: "at functionName (path:line)" without column
    const matchNoCol = line.match(/^at\s+([^\s(]+)?\s*\((.+):(\d+)\)$/);
    if (matchNoCol) {
      const rawPath = matchNoCol[2].trim();
      return {
        functionName: matchNoCol[1] || undefined,
        rawPath: WorkspaceSecurity.sanitizePathString(rawPath),
        line: parseInt(matchNoCol[3], 10),
        column: 1,
        rawFrame: line
      };
    }

    return null;
  }

  /**
   * Parses Python traceback frame:
   * e.g. 'File "checkout.py", line 42, in calculate_discount'
   */
  private static parsePythonFrame(line: string): StackFrame | null {
    const match = line.match(/^File\s+["'](.+?)["'],\s+line\s+(\d+)(?:,\s+in\s+(.+))?$/);
    if (match) {
      return {
        functionName: match[3]?.trim(),
        rawPath: WorkspaceSecurity.sanitizePathString(match[1].trim()),
        line: parseInt(match[2], 10),
        column: 1,
        rawFrame: line
      };
    }
    return null;
  }

  /**
   * Parses generic path:line:col reference:
   * e.g. "src/routes/cart.ts:88:24" or "checkout.ts:42"
   */
  private static parseGenericPathFrame(line: string): StackFrame | null {
    // Skip if it looks like arbitrary code or markdown header
    if (line.startsWith('#') || line.startsWith('//') || line.includes('const ') || line.includes('import ')) {
      return null;
    }

    const match = line.match(/([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+):(\d+)(?::(\d+))?/);
    if (match) {
      const candidatePath = match[1];
      // Basic sanity check on extension
      const validExts = /\.(ts|tsx|js|jsx|mjs|cjs|py|java|go|rs|cpp|c|h|cs|rb|php)$/i;
      if (validExts.test(candidatePath)) {
        return {
          rawPath: WorkspaceSecurity.sanitizePathString(candidatePath),
          line: parseInt(match[2], 10),
          column: match[3] ? parseInt(match[3], 10) : 1,
          rawFrame: line
        };
      }
    }

    return null;
  }

  /**
   * Extracts error type and message from the first or last lines (supporting both JS and Python tracebacks).
   */
  private static extractErrorHeader(lines: string[]): { type: string; message: string } {
    // Check first 5 lines (JS/TS style) and last 3 lines (Python/Go style)
    const candidateLines = [
      ...lines.slice(0, 5),
      ...lines.slice(-3).reverse()
    ];

    for (const line of candidateLines) {
      // Pattern: "TypeError: Cannot read properties of undefined" or "KeyError: 'discount'"
      const match = line.match(/^([A-Z][a-zA-Z0-9_]*Error|[A-Z][a-zA-Z0-9_]*Exception|Error):\s*(.*)$/);
      if (match) {
        return {
          type: match[1],
          message: match[2]?.trim() || line
        };
      }

      // Check for known keyword headers: e.g. "UnhandledPromiseRejection: ..."
      for (const known of this.KNOWN_ERROR_TYPES) {
        if (line.startsWith(known + ':') || line.startsWith(known)) {
          const rest = line.substring(known.length).replace(/^:\s*/, '').trim();
          return {
            type: known,
            message: rest || line
          };
        }
      }
    }

    // If no explicit "Error:" found, check for failure prefixes
    const firstLine = lines[0] || '';
    if (firstLine.match(/^(failed|failure|fatal|panic|abort|exception):/i)) {
      return {
        type: 'RuntimeError',
        message: firstLine
      };
    }

    return {
      type: 'UnknownError',
      message: firstLine
    };
  }

  /**
   * Validates whether the given text actually looks like an error,
   * guarding against arbitrary code selection.
   */
  private static validateIsError(
    rawText: string,
    header: { type: string; message: string },
    frames: StackFrame[]
  ): boolean {
    // 1. If we parsed at least one stack frame, it's definitely a stack trace/error
    if (frames.length > 0) {
      return true;
    }

    // 2. If it matches a recognized Error type
    if (header.type !== 'UnknownError') {
      return true;
    }

    // 3. Keyword heuristic on the text
    const lower = rawText.toLowerCase();
    const errorKeywords = [
      'exception',
      'stack trace',
      'traceback',
      'cannot read propert',
      'undefined is not',
      'nullpointer',
      'segmentation fault',
      'unhandled rejection',
      'failed to compile',
      'fatal error',
      'panic:'
    ];

    return errorKeywords.some((kw) => lower.includes(kw));
  }
}

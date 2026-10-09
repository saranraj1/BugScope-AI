import { ParsedError, EvidenceRecord } from '../models/analysisResult';
import { WorkspaceSecurity } from '../utils/workspaceSecurity';
import * as path from 'path';

/**
 * SymbolAnalyzer - Extracts symbols from error messages and checks
 * occurrence in candidate source files.
 */
export class SymbolAnalyzer {
  /**
   * Extracts candidate identifier tokens from the error message and stack frames.
   */
  public static extractTokens(error: ParsedError): string[] {
    const tokens = new Set<string>();

    // 1. From function names in stack frames
    for (const frame of error.frames) {
      if (frame.functionName && frame.functionName !== '<anonymous>') {
        tokens.add(frame.functionName);
      }
    }

    // 2. From error message (e.g., "Cannot read properties of undefined (reading 'rate')")
    const quotedMatches = error.message.match(/['"`]([a-zA-Z0-9_$]+)['"`]/g);
    if (quotedMatches) {
      for (const m of quotedMatches) {
        const cleaned = m.replace(/['"`]/g, '').trim();
        if (cleaned.length > 1) {
          tokens.add(cleaned);
        }
      }
    }

    // 3. Word tokens from message (identifiers)
    const wordMatches = error.message.match(/[a-zA-Z_$][a-zA-Z0-9_$]{2,}/g);
    if (wordMatches) {
      const stopWords = new Set([
        'cannot', 'read', 'properties', 'undefined', 'null', 'reading', 'error',
        'typeerror', 'referenceerror', 'failed', 'call', 'function', 'object'
      ]);
      for (const w of wordMatches) {
        if (!stopWords.has(w.toLowerCase())) {
          tokens.add(w);
        }
      }
    }

    return Array.from(tokens);
  }

  /**
   * Scans a target file for occurrences of extracted tokens.
   */
  public static matchSymbolsInFile(
    filePath: string,
    tokens: string[]
  ): { score: number; matchedTokens: string[]; evidence: EvidenceRecord[] } {
    if (tokens.length === 0) {
      return { score: 0, matchedTokens: [], evidence: [] };
    }

    const content = WorkspaceSecurity.readBoundedTextFile(filePath);
    if (!content) {
      return { score: 0, matchedTokens: [], evidence: [] };
    }

    const matched: string[] = [];
    const evidence: EvidenceRecord[] = [];
    const relName = path.basename(filePath);

    for (const token of tokens) {
      // Word boundary check
      const regex = new RegExp(`\\b${token}\\b`);
      if (regex.test(content)) {
        matched.push(token);
      }
    }

    if (matched.length > 0) {
      const ratio = Math.min(1.0, matched.length / Math.max(1, tokens.length));
      evidence.push({
        tier: 'inferred',
        category: 'symbol_match',
        description: `${relName} contains error-relevant symbol(s): [${matched.join(', ')}]`,
        weight: ratio * 0.6
      });

      return {
        score: ratio,
        matchedTokens: matched,
        evidence
      };
    }

    return { score: 0, matchedTokens: [], evidence: [] };
  }
}

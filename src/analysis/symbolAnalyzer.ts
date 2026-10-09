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
    const definedSymbols: string[] = [];
    const evidence: EvidenceRecord[] = [];
    const relName = path.basename(filePath);

    for (const token of tokens) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Word boundary check
      const regex = new RegExp(`\\b${escaped}\\b`);
      if (regex.test(content)) {
        matched.push(token);

        // Check for symbol definition or direct call/property pattern
        const defPattern = new RegExp(`\\b(function|class|interface|type|const|let|var|def|async\\s+def)\\s+${escaped}\\b|${escaped}\\s*\\(|\\.${escaped}\\b|\\b${escaped}\\s*[:=]`, 'm');
        if (defPattern.test(content)) {
          definedSymbols.push(token);
        }
      }
    }

    if (matched.length > 0) {
      const baseRatio = matched.length / Math.max(1, tokens.length);
      // Give definition/call occurrences an evidential boost
      const score = definedSymbols.length > 0
        ? Math.min(1.0, Math.round((baseRatio * 0.75 + 0.25) * 100) / 100)
        : Math.min(1.0, Math.round(baseRatio * 100) / 100);

      const description = definedSymbols.length > 0
        ? `${relName} defines or invokes error-relevant symbol(s): [${matched.join(', ')}] (declares/uses: ${definedSymbols.join(', ')})`
        : `${relName} contains error-relevant symbol(s): [${matched.join(', ')}]`;

      evidence.push({
        tier: 'inferred',
        category: 'symbol_match',
        description,
        weight: Math.min(0.9, score * 0.7)
      });

      return {
        score,
        matchedTokens: matched,
        evidence
      };
    }

    return { score: 0, matchedTokens: [], evidence: [] };
  }
}

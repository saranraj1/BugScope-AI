import { AnalysisReport, AiEnrichment } from '../models/analysisResult';

export interface AiAdapterConfig {
  enabled: boolean;
  endpoint: string;
  model: string;
  apiKey?: string;
  timeoutMs?: number;
}

/**
 * AiAdapter - Strictly optional enrichment decorator.
 * Never required for core analysis. Baseline report remains 100% functional offline.
 */
export class AiAdapter {
  private config: AiAdapterConfig;

  constructor(config: AiAdapterConfig) {
    this.config = config;
  }

  /**
   * Enriches an existing deterministic report with hypotheses and debugging guidance.
   * Gracefully fails without interrupting local analysis.
   */
  public async enrich(report: AnalysisReport): Promise<AiEnrichment | undefined> {
    if (!this.config.enabled) {
      return undefined;
    }

    try {
      const prompt = this.buildPrompt(report);
      const response = await this.queryProvider(prompt);

      if (!response) {
        return undefined;
      }

      return {
        summary: response.summary,
        hypotheses: response.hypotheses,
        recommendedActions: response.recommendedActions,
        model: this.config.model,
        disclaimer:
          'AI-generated hypotheses are unverified inferences. Always verify against source code and test suite.'
      };
    } catch {
      // Intentional silent fallback to preserve local baseline reliability
      return undefined;
    }
  }

  private buildPrompt(report: AnalysisReport): string {
    const errorInfo = `${report.errorSummary.type}: ${report.errorSummary.message}`;
    const primary = report.primaryLocation
      ? `${report.primaryLocation.relativePath}:${report.primaryLocation.line}`
      : 'Unknown';

    const topCandidates = report.candidates
      .slice(0, 3)
      .map((c) => `- ${c.relativePath} (Score: ${c.score}, Signals: ${c.reasons.join(', ')})`)
      .join('\n');

    return `You are BugScope AI assistant. Analyze this verified static diagnostic:
Error: ${errorInfo}
Primary Throw Site: ${primary}
Top Impacted Modules:
${topCandidates}

Return a valid JSON object matching:
{
  "summary": "1-2 sentence technical summary",
  "hypotheses": ["hypothesis 1", "hypothesis 2"],
  "recommendedActions": ["action 1", "action 2"]
}`;
  }

  private async queryProvider(
    prompt: string,
    externalSignal?: AbortSignal
  ): Promise<{ summary: string; hypotheses: string[]; recommendedActions: string[] } | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs || 5000);

    // If external signal is aborted, abort our controller
    if (externalSignal) {
      externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      // Validate endpoint URL format
      const parsedUrl = new URL(`${this.config.endpoint.replace(/\/+$/, '')}/chat/completions`);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return null;
      }

      const res = await fetch(parsedUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {})
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens: 400
        }),
        signal: controller.signal,
        // Prevent redirecting authenticated requests to unintended hosts
        redirect: 'error'
      });

      if (!res.ok) {
        return null;
      }

      // Check content-length header if provided
      const contentLength = res.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > 200_000) {
        return null; // Bounded response size (200KB limit)
      }

      // Read text and enforce maximum byte bound
      const rawText = await res.text();
      if (!rawText || rawText.length > 200_000) {
        return null;
      }

      const json: any = JSON.parse(rawText);
      const content = json.choices?.[0]?.message?.content;
      if (!content || typeof content !== 'string') {
        return null;
      }

      // Extract JSON block
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        const summary = typeof parsed.summary === 'string' && parsed.summary.trim()
          ? parsed.summary.trim().slice(0, 500)
          : 'Analysis enriched.';

        const hypotheses = Array.isArray(parsed.hypotheses)
          ? parsed.hypotheses
              .filter((h: any) => typeof h === 'string' && h.trim().length > 0)
              .map((h: string) => h.trim().slice(0, 300))
              .slice(0, 5)
          : [];

        const recommendedActions = Array.isArray(parsed.recommendedActions)
          ? parsed.recommendedActions
              .filter((a: any) => typeof a === 'string' && a.trim().length > 0)
              .map((a: string) => a.trim().slice(0, 300))
              .slice(0, 5)
          : [];

        return {
          summary,
          hypotheses,
          recommendedActions
        };
      }

      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}

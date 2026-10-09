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
    prompt: string
  ): Promise<{ summary: string; hypotheses: string[]; recommendedActions: string[] } | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs || 4000);

    try {
      const url = `${this.config.endpoint.replace(/\/+$/, '')}/chat/completions`;
      const res = await fetch(url, {
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
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!res.ok) {
        return null;
      }

      const json: any = await res.json();
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        return null;
      }

      // Extract JSON block
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: typeof parsed.summary === 'string' ? parsed.summary : 'Analysis enriched.',
          hypotheses: Array.isArray(parsed.hypotheses) ? parsed.hypotheses : [],
          recommendedActions: Array.isArray(parsed.recommendedActions) ? parsed.recommendedActions : []
        };
      }

      return null;
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }
}

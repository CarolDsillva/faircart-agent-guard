import type { LLMProvider, Messages } from '@faircart/agent-core';

export class LLMError extends Error {
  constructor(readonly code: 'rate_limited' | 'overloaded' | 'timeout' | 'http_error' | 'no_plan', detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

/** Gemini planner: one forced `submit_plan` function call per page. */
export class GeminiProvider implements LLMProvider {
  constructor(private readonly cfg: { apiKey: string; model: string; timeoutMs?: number; retryDelayMs?: number }) {}

  async plan(messages: Messages, toolSchema: object): Promise<unknown> {
    const { $schema: _drop, ...schema } = toolSchema as Record<string, unknown>;
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: messages.system }] },
      contents: [{ role: 'user', parts: [{ text: messages.user }] }],
      tools: [{ functionDeclarations: [{ name: 'submit_plan', description: 'Submit the ordered plan of actions for the current page.', parametersJsonSchema: schema }] }],
      toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['submit_plan'] } },
      generationConfig: { temperature: 0, thinkingConfig: this.cfg.model.startsWith('gemini-2.5') ? { thinkingBudget: 0 } : { thinkingLevel: 'minimal' } },
    });

    for (let attempt = 0; ; attempt++) {
      const res = await this.send(body);
      if (res.status === 429) throw new LLMError('rate_limited');
      if ((res.status === 503 || res.status === 500) && attempt === 0) {
        await new Promise((r) => setTimeout(r, this.cfg.retryDelayMs ?? 1500));
        continue;
      }
      if (res.status === 503) throw new LLMError('overloaded');
      const json = (await res.json().catch(() => ({}))) as { candidates?: { content?: { parts?: { functionCall?: { name: string; args: unknown } }[] } }[]; error?: { message?: string } };
      if (!res.ok) throw new LLMError('http_error', `${res.status} ${json.error?.message ?? ''}`.trim());
      const call = json.candidates?.[0]?.content?.parts?.find((p) => p.functionCall)?.functionCall;
      if (!call) throw new LLMError('no_plan', 'Gemini replied without a plan');
      return call.args;
    }
  }

  private async send(body: string): Promise<Response> {
    try {
      return await fetch(`${BASE}/models/${encodeURIComponent(this.cfg.model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.cfg.apiKey },
        body,
        signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 20_000),
      });
    } catch (e) {
      throw new LLMError(e instanceof Error && e.name === 'TimeoutError' ? 'timeout' : 'http_error', e instanceof Error ? e.message : undefined);
    }
  }
}

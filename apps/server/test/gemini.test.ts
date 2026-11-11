import { PLAN_JSON_SCHEMA } from '@faircart/agent-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiProvider, LLMError } from '../src/llm/gemini';

const messages = { system: 'sys', user: 'page' };
const plan = { actions: [{ tool: 'request_checkout', explanation: 'Checking out.' }] };

afterEach(() => vi.unstubAllGlobals());

function stubFetch(status: number, body: unknown) {
  const f = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', f);
  return f;
}

describe('GeminiProvider', () => {
  it('forces a single submit_plan call and returns its arguments', async () => {
    const f = stubFetch(200, { candidates: [{ content: { parts: [{ functionCall: { name: 'submit_plan', args: plan } }] } }] });
    const out = await new GeminiProvider({ apiKey: 'k', model: 'gemini-test' }).plan(messages, PLAN_JSON_SCHEMA);
    expect(out).toEqual(plan);
    const [url, init] = f.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toContain('/models/gemini-test:generateContent');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('k');
    const sent = JSON.parse(init.body as string);
    expect(sent.systemInstruction.parts[0].text).toBe('sys');
    expect(sent.toolConfig.functionCallingConfig).toEqual({ mode: 'ANY', allowedFunctionNames: ['submit_plan'] });
    expect(sent.tools[0].functionDeclarations[0].name).toBe('submit_plan');
    expect(sent.tools[0].functionDeclarations[0].parametersJsonSchema.$schema).toBeUndefined();
  });

  it('reports rate limits as rate_limited', async () => {
    stubFetch(429, { error: { message: 'quota' } });
    await expect(new GeminiProvider({ apiKey: 'k', model: 'm' }).plan(messages, PLAN_JSON_SCHEMA)).rejects.toEqual(new LLMError('rate_limited'));
  });

  it('retries once when Gemini is briefly overloaded', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'high demand' } }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: 'submit_plan', args: plan } }] } }] }), { status: 200 }));
    vi.stubGlobal('fetch', f);
    expect(await new GeminiProvider({ apiKey: 'k', model: 'm', retryDelayMs: 1 }).plan(messages, PLAN_JSON_SCHEMA)).toEqual(plan);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('reports overload after the retry as overloaded', async () => {
    stubFetch(503, { error: { message: 'high demand' } });
    await expect(new GeminiProvider({ apiKey: 'k', model: 'm', retryDelayMs: 1 }).plan(messages, PLAN_JSON_SCHEMA)).rejects.toEqual(new LLMError('overloaded'));
  });

  it('reports a reply with no function call', async () => {
    stubFetch(200, { candidates: [{ content: { parts: [{ text: 'hello' }] } }] });
    await expect(new GeminiProvider({ apiKey: 'k', model: 'm' }).plan(messages, PLAN_JSON_SCHEMA)).rejects.toThrow(/no_plan/);
  });
});

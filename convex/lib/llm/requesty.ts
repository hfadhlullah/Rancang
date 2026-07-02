import type { LLMProvider, LLMMessage, LLMOptions } from "./types";

export function createRequestyProvider(apiKey: string, defaultModel?: string): LLMProvider {
  return {
    async complete(messages: LLMMessage[], options: LLMOptions = {}) {
      const model = options.model ?? defaultModel ?? "anthropic/claude-3-5-sonnet-20241022";
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);
      let res: Response;
      try {
        res = await fetch("https://router.requesty.ai/v1/chat/completions", {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            max_tokens: options.maxTokens ?? 4096,
            temperature: options.temperature ?? 0.3,
            response_format:
              options.responseFormat === "json" ? { type: "json_object" } : undefined,
          }),
        });
      } catch (err: unknown) {
        const name = err instanceof Error ? err.name : "";
        if (name === "AbortError") throw new Error(`Requesty timeout after 120s (model: ${model})`);
        throw err;
      } finally {
        clearTimeout(timeout);
      }
      const json = await res.json();
      if (!res.ok) throw new Error(`Requesty error (model: ${model}): ${json.error?.message ?? res.status}`);
      return json.choices[0].message.content as string;
    },
  };
}

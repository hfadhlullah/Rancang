import type { LLMProvider, LLMMessage, LLMOptions } from "./types";

export function createRequestyProvider(apiKey: string, defaultModel?: string): LLMProvider {
  return {
    async complete(messages: LLMMessage[], options: LLMOptions = {}) {
      const res = await fetch("https://router.requesty.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: options.model ?? defaultModel ?? "anthropic/claude-3-5-sonnet-20241022",
          messages,
          max_tokens: options.maxTokens ?? 4096,
          temperature: options.temperature ?? 0.3,
          response_format:
            options.responseFormat === "json" ? { type: "json_object" } : undefined,
        }),
      });
      const json = await res.json();
      const model = options.model ?? defaultModel ?? "anthropic/claude-3-5-sonnet-20241022";
      if (!res.ok) throw new Error(`Requesty error (model: ${model}): ${json.error?.message ?? res.status}`);
      return json.choices[0].message.content as string;
    },
  };
}

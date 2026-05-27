import type { LLMProvider, LLMMessage, LLMOptions } from "./types";

export const localProvider: LLMProvider = {
  async complete(messages: LLMMessage[], options: LLMOptions = {}) {
    const base = process.env.LOCAL_LLM_URL ?? "http://localhost:11434/v1";
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model:
          options.model ??
          process.env.LOCAL_LLM_MODEL ??
          "qwen2.5:32b-instruct",
        messages,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.3,
        response_format:
          options.responseFormat === "json"
            ? { type: "json_object" }
            : undefined,
      }),
    });
    const json = await res.json();
    return json.choices[0].message.content as string;
  },
};

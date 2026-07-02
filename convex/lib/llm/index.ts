import Anthropic from "@anthropic-ai/sdk";
import { anthropicProvider } from "./anthropic";
import { localProvider } from "./local";
import { createRequestyProvider } from "./requesty";
import type { LLMProvider, LLMMessage, LLMOptions } from "./types";

export const llm: LLMProvider =
  process.env.LLM_PROVIDER === "local" ? localProvider : anthropicProvider;

type UserSettings = {
  provider: string;
  anthropicApiKey?: string | null;
  requestyApiKey?: string | null;
  requestyModel?: string | null;
  localLlmUrl?: string | null;
  localLlmModel?: string | null;
} | null;

export function buildLLMFromSettings(settings: UserSettings): LLMProvider {
  if (!settings) return llm;

  switch (settings.provider) {
    case "requesty": {
      const key = settings.requestyApiKey;
      if (!key) throw new Error("Requesty API key not configured. Go to Settings to add it.");
      return createRequestyProvider(key, settings.requestyModel ?? undefined);
    }
    case "local": {
      const base = settings.localLlmUrl ?? process.env.LOCAL_LLM_URL ?? "http://localhost:11434/v1";
      const model = settings.localLlmModel ?? process.env.LOCAL_LLM_MODEL ?? "qwen2.5:32b-instruct";
      return {
        async complete(messages: LLMMessage[], options: LLMOptions = {}) {
          const res = await fetch(`${base}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: options.model ?? model,
              messages,
              max_tokens: options.maxTokens ?? 4096,
              temperature: options.temperature ?? 0.3,
              response_format:
                options.responseFormat === "json" ? { type: "json_object" } : undefined,
            }),
          });
          const json = await res.json();
          return json.choices[0].message.content as string;
        },
      };
    }
    case "anthropic":
    default: {
      const key = settings.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!key) throw new Error("Anthropic API key not configured. Go to Settings to add it.");
      return {
        async complete(messages: LLMMessage[], options: LLMOptions = {}) {
          const client = new Anthropic({ apiKey: key });
          const system = messages.find((m) => m.role === "system")?.content;
          const rest = messages.filter((m) => m.role !== "system");
          const res = await client.messages.create({
            model: options.model ?? "claude-sonnet-4-20250514",
            max_tokens: options.maxTokens ?? 4096,
            temperature: options.temperature ?? 0.3,
            ...(system ? { system } : {}),
            messages: rest.map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            })),
          });
          return res.content[0].type === "text" ? res.content[0].text : "";
        },
        async completeVision(messages: LLMMessage[], imageBase64: string, options: LLMOptions = {}) {
          const client = new Anthropic({ apiKey: key });
          const system = messages.find((m) => m.role === "system")?.content;
          const rest = messages.filter((m) => m.role !== "system");
          const lastUser = rest[rest.length - 1];
          const prior: Anthropic.MessageParam[] = rest.slice(0, -1).map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }));
          const imageMsg: Anthropic.MessageParam = {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageBase64 } },
              { type: "text", text: lastUser?.content ?? "" },
            ],
          };
          const res = await client.messages.create({
            model: options.model ?? "claude-sonnet-4-20250514",
            max_tokens: options.maxTokens ?? 4096,
            temperature: options.temperature ?? 0.3,
            ...(system ? { system } : {}),
            messages: [...prior, imageMsg],
          });
          return res.content[0].type === "text" ? res.content[0].text : "";
        },
      };
    }
  }
}

export type { LLMProvider, LLMMessage, LLMOptions } from "./types";

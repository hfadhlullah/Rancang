import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, LLMMessage, LLMOptions } from "./types";

export const anthropicProvider: LLMProvider = {
  async complete(messages: LLMMessage[], options: LLMOptions = {}) {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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

  async completeVision(
    messages: LLMMessage[],
    imageBase64: string,
    options: LLMOptions = {}
  ) {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const system = messages.find((m) => m.role === "system")?.content;
    const rest = messages.filter((m) => m.role !== "system");
    const lastUser = rest[rest.length - 1];
    const priorMessages: Anthropic.MessageParam[] = rest.slice(0, -1).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
    const imageMessage: Anthropic.MessageParam = {
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/jpeg",
            data: imageBase64,
          },
        },
        { type: "text", text: lastUser?.content ?? "" },
      ],
    };
    const res = await client.messages.create({
      model: options.model ?? "claude-sonnet-4-20250514",
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.3,
      ...(system ? { system } : {}),
      messages: [...priorMessages, imageMessage],
    });
    return res.content[0].type === "text" ? res.content[0].text : "";
  },
};

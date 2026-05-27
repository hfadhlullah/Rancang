import { anthropicProvider } from "./anthropic";
import { localProvider } from "./local";
import type { LLMProvider } from "./types";

export const llm: LLMProvider =
  process.env.LLM_PROVIDER === "local" ? localProvider : anthropicProvider;

export type { LLMProvider, LLMMessage, LLMOptions } from "./types";

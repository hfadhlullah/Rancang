export type LLMMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LLMOptions = {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: "text" | "json";
};

export interface LLMProvider {
  complete(messages: LLMMessage[], options?: LLMOptions): Promise<string>;
  completeVision?(
    messages: LLMMessage[],
    imageBase64: string,
    options?: LLMOptions
  ): Promise<string>;
}

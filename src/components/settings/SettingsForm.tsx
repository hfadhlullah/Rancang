"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState, useEffect } from "react";
import { Check, Eye, EyeOff } from "lucide-react";

type Provider = "anthropic" | "requesty" | "local";

export function SettingsForm() {
  const settings = useQuery(api.settings.getSettings);
  const upsert = useMutation(api.settings.upsertSettings);

  const [provider, setProvider] = useState<Provider>("anthropic");
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [requestyApiKey, setRequestyApiKey] = useState("");
  const [requestyModel, setRequestyModel] = useState("anthropic/claude-3-5-sonnet-20241022");
  const [localLlmUrl, setLocalLlmUrl] = useState("http://localhost:11434/v1");
  const [localLlmModel, setLocalLlmModel] = useState("qwen2.5:32b-instruct");
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showRequestyKey, setShowRequestyKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setProvider((settings.provider as Provider) ?? "anthropic");
    if (settings.anthropicApiKey) setAnthropicApiKey(settings.anthropicApiKey);
    if (settings.requestyApiKey) setRequestyApiKey(settings.requestyApiKey);
    if (settings.requestyModel) setRequestyModel(settings.requestyModel);
    if (settings.localLlmUrl) setLocalLlmUrl(settings.localLlmUrl);
    if (settings.localLlmModel) setLocalLlmModel(settings.localLlmModel);
  }, [settings]);

  async function handleSave() {
    await upsert({
      provider,
      anthropicApiKey: anthropicApiKey || undefined,
      requestyApiKey: requestyApiKey || undefined,
      requestyModel: requestyModel || undefined,
      localLlmUrl: localLlmUrl || undefined,
      localLlmModel: localLlmModel || undefined,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const providers: { id: Provider; label: string; description: string }[] = [
    { id: "anthropic", label: "Anthropic", description: "Claude models via Anthropic API" },
    { id: "requesty", label: "Requesty", description: "Multi-provider router — access Claude, GPT-4, Gemini and more" },
    { id: "local", label: "Local (Ollama)", description: "Self-hosted models via OpenAI-compatible endpoint" },
  ];

  return (
    <div className="max-w-xl space-y-8">
      {/* Provider selector */}
      <div className="space-y-3">
        <label className="text-sm font-medium">AI Provider</label>
        <div className="space-y-2">
          {providers.map((p) => (
            <button
              key={p.id}
              onClick={() => setProvider(p.id)}
              className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                provider === p.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{p.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{p.description}</div>
                </div>
                {provider === p.id && <Check size={16} className="text-primary shrink-0" />}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Anthropic fields */}
      {provider === "anthropic" && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">API Key</label>
            <div className="relative">
              <input
                type={showAnthropicKey ? "text" : "password"}
                value={anthropicApiKey}
                onChange={(e) => setAnthropicApiKey(e.target.value)}
                placeholder="sk-ant-..."
                className="w-full rounded-md border px-3 py-2 pr-10 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <button
                type="button"
                onClick={() => setShowAnthropicKey((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showAnthropicKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Get your key at{" "}
              <span className="font-mono">console.anthropic.com</span>
            </p>
          </div>
        </div>
      )}

      {/* Requesty fields */}
      {provider === "requesty" && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Requesty API Key</label>
            <div className="relative">
              <input
                type={showRequestyKey ? "text" : "password"}
                value={requestyApiKey}
                onChange={(e) => setRequestyApiKey(e.target.value)}
                placeholder="rq-..."
                className="w-full rounded-md border px-3 py-2 pr-10 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <button
                type="button"
                onClick={() => setShowRequestyKey((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showRequestyKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Get your key at{" "}
              <span className="font-mono">requesty.ai</span>
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Model</label>
            <input
              type="text"
              value={requestyModel}
              onChange={(e) => setRequestyModel(e.target.value)}
              placeholder="anthropic/claude-sonnet-4-20250514"
              className="w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <p className="text-xs text-muted-foreground">
              Format: <span className="font-mono">provider/model-name</span>.
              Examples: <span className="font-mono">anthropic/claude-3-5-sonnet-20241022</span>,{" "}
              <span className="font-mono">openai/gpt-4o</span>,{" "}
              <span className="font-mono">google/gemini-2.0-flash</span>
            </p>
          </div>
        </div>
      )}

      {/* Local fields */}
      {provider === "local" && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Endpoint URL</label>
            <input
              type="text"
              value={localLlmUrl}
              onChange={(e) => setLocalLlmUrl(e.target.value)}
              placeholder="http://localhost:11434/v1"
              className="w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <p className="text-xs text-muted-foreground">
              OpenAI-compatible endpoint (Ollama default: <span className="font-mono">http://localhost:11434/v1</span>)
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Model</label>
            <input
              type="text"
              value={localLlmModel}
              onChange={(e) => setLocalLlmModel(e.target.value)}
              placeholder="qwen2.5:32b-instruct"
              className="w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>
      )}

      <button
        onClick={handleSave}
        className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        {saved ? <><Check size={14} /> Saved</> : "Save settings"}
      </button>
    </div>
  );
}

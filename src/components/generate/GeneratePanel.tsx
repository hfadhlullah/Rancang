"use client";

import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Plan } from "@/lib/types/plan";
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

interface Props {
  plan: Plan;
  onPlanChange: (plan: Plan) => void;
}

const hasContent = (plan: Plan) => Object.keys(plan.walls).length > 0;

export function GeneratePanel({ plan, onPlanChange }: Props) {
  const generate = useAction(api.generate.generate);
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (!prompt.trim()) return;
    setRunning(true);
    setError(null);
    try {
      const result = (await generate({
        prompt,
        currentPlanJson: JSON.stringify(plan),
      })) as unknown as Plan;
      onPlanChange(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="p-4 space-y-3">
      <h2 className="font-semibold text-sm flex items-center gap-1.5">
        <Sparkles size={14} />
        Generate from prompt
      </h2>
      <p className="text-xs text-muted-foreground">
        Describe the project — rooms, size, style — and get a starting 2D layout you can iterate on.
      </p>

      {hasContent(plan) && (
        <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
          This will replace the current plan on the canvas. Undo (Ctrl+Z) if you change your mind.
        </div>
      )}

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="e.g. 3-bedroom single-storey home, ~120m², open-plan kitchen and living, north-facing living room"
        rows={5}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
      />

      <button
        onClick={handleGenerate}
        disabled={running || !prompt.trim()}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
      >
        {running ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            Designing…
          </>
        ) : (
          "Generate plan"
        )}
      </button>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}

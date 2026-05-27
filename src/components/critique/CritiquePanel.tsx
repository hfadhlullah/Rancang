"use client";

import { useQuery, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Plan } from "@/lib/types/plan";
import { CritiqueResult, CritiqueItem, CritiqueSeverity } from "@/lib/types/critique";
import { useState } from "react";
import { AlertTriangle, Info, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

const SEVERITY_CONFIG: Record<CritiqueSeverity, { icon: React.ReactNode; label: string; color: string }> = {
  critical: { icon: <AlertCircle size={13} />, label: "Critical", color: "text-red-600" },
  major: { icon: <AlertTriangle size={13} />, label: "Major", color: "text-orange-500" },
  minor: { icon: <Info size={13} />, label: "Minor", color: "text-yellow-500" },
  info: { icon: <CheckCircle2 size={13} />, label: "Info", color: "text-blue-500" },
};

function CritiqueItemCard({ item }: { item: CritiqueItem }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = SEVERITY_CONFIG[item.severity];
  return (
    <button
      onClick={() => setExpanded(!expanded)}
      className="w-full text-left rounded-md border p-3 space-y-1.5 hover:border-primary/30 transition-colors"
    >
      <div className="flex items-center gap-2">
        <span className={cfg.color}>{cfg.icon}</span>
        <span className="text-sm font-medium flex-1">{item.title}</span>
        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{item.category}</span>
      </div>
      {item.metric && (
        <p className="text-xs text-muted-foreground font-mono">{item.metric}</p>
      )}
      {expanded && (
        <div className="space-y-1.5 pt-1 border-t mt-1.5">
          <p className="text-xs text-muted-foreground">{item.description}</p>
          <p className="text-xs font-medium">→ {item.suggestion}</p>
          <p className="text-xs text-muted-foreground">
            Target: <span className="font-medium">{item.target.label}</span>
          </p>
        </div>
      )}
    </button>
  );
}

export function CritiquePanel({
  projectId,
  plan,
}: {
  projectId: Id<"projects">;
  plan: Plan;
}) {
  const critiques = useQuery(api.critique.list, { projectId });
  const runCritique = useAction(api.critique.run);
  const requirements = useQuery(api.requirements.get, { projectId });

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<CritiqueResult | null>(null);

  const wallCount = Object.keys(plan.walls).length;
  const canRun = wallCount >= 2 && requirements?.brief;

  async function handleRun() {
    if (!requirements?.brief) return;
    setRunning(true);
    setError(null);
    try {
      const result = await runCritique({
        projectId,
        planJson: JSON.stringify(plan),
        requirementsBrief: requirements.brief,
      });
      setLatest(result as unknown as CritiqueResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Critique failed");
    } finally {
      setRunning(false);
    }
  }

  const display: CritiqueResult | null =
    latest ??
    (critiques?.[0] ? JSON.parse(critiques[0].result) : null);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm">AI Critique</h2>
        {display && (
          <span className="text-xs text-muted-foreground">
            Score: <span className="font-medium text-foreground">{display.overallScore}/100</span>
          </span>
        )}
      </div>

      {!requirements?.brief && (
        <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
          Add a requirements brief first (click the document icon).
        </div>
      )}

      {requirements?.brief && wallCount < 2 && (
        <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
          Draw at least 2 walls before running critique.
        </div>
      )}

      <button
        onClick={handleRun}
        disabled={!canRun || running}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
      >
        {running ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            Analysing…
          </>
        ) : (
          "Run critique"
        )}
      </button>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
          {error}
        </div>
      )}

      {display && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{display.summary}</p>
          <div className="space-y-2">
            {display.items.map((item) => (
              <CritiqueItemCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

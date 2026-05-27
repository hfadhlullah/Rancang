"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { useState, useEffect } from "react";

export function RequirementsForm({ projectId }: { projectId: Id<"projects"> }) {
  const requirements = useQuery(api.requirements.get, { projectId });
  const upsert = useMutation(api.requirements.upsert);

  const [brief, setBrief] = useState("");
  const [constraints, setConstraints] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (requirements) {
      setBrief(requirements.brief ?? "");
      setConstraints(requirements.constraints ?? "");
    }
  }, [requirements]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await upsert({ projectId, brief, constraints: constraints || undefined });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-semibold text-sm">Requirements Brief</h2>
      <p className="text-xs text-muted-foreground">
        Describe the project. AI critique will use this to evaluate your plan.
      </p>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-medium">Project brief</label>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="e.g. 3-bedroom family home, 200m², north-facing plot, 2 bathrooms, open kitchen-dining…"
            rows={6}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">
            Constraints{" "}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <textarea
            value={constraints}
            onChange={(e) => setConstraints(e.target.value)}
            placeholder="e.g. wheelchair accessible master bedroom, budget favours smaller footprint, retain existing north wall…"
            rows={4}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </div>
        <button
          type="submit"
          disabled={saving || !brief.trim()}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save brief"}
        </button>
      </form>
    </div>
  );
}

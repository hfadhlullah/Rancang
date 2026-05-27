"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Plan } from "@/lib/types/plan";
import { useState } from "react";
import { Camera, Clock, ChevronRight } from "lucide-react";

interface Props {
  projectId: Id<"projects">;
  plan: Plan;
  onRestore: (plan: Plan) => void;
}

export function SnapshotPanel({ projectId, plan, onRestore }: Props) {
  const snapshots = useQuery(api.snapshots.list, { projectId });
  const createSnapshot = useMutation(api.snapshots.create);

  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [comparing, setComparing] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    setSaving(true);
    try {
      await createSnapshot({
        projectId,
        label: label.trim(),
        planJson: JSON.stringify(plan),
      });
      setLabel("");
    } finally {
      setSaving(false);
    }
  }

  function handleRestore(planJson: string) {
    if (confirm("Replace current plan with this snapshot?")) {
      onRestore(JSON.parse(planJson) as Plan);
    }
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-semibold text-sm">Snapshots</h2>
      <p className="text-xs text-muted-foreground">
        Save named versions of the plan. Restore any snapshot to go back.
      </p>

      <form onSubmit={handleSave} className="flex gap-2">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Option A — before kitchen move"
          className="flex-1 min-w-0 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={saving || !label.trim()}
          className="shrink-0 flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <Camera size={13} />
          {saving ? "…" : "Save"}
        </button>
      </form>

      <div className="space-y-2">
        {snapshots === undefined && (
          <div className="text-xs text-muted-foreground">Loading…</div>
        )}
        {snapshots?.length === 0 && (
          <div className="text-xs text-muted-foreground">No snapshots yet.</div>
        )}
        {snapshots?.map((snap: { _id: string; label: string; createdAt: number; planJson: string; projectId: string; ownerId: string }) => (
          <div
            key={snap._id}
            className="rounded-md border p-3 space-y-1.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-0.5 min-w-0">
                <p className="text-sm font-medium truncate">{snap.label}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock size={10} />
                  {new Date(snap.createdAt).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => handleRestore(snap.planJson)}
                className="shrink-0 text-xs text-primary hover:underline"
              >
                Restore
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

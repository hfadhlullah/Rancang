import type { RoomId, WallId } from "./plan";

export type CritiqueSeverity = "critical" | "major" | "minor" | "info";
export type CritiqueCategory =
  | "circulation"
  | "dimensions"
  | "natural_light"
  | "ventilation"
  | "adjacency"
  | "accessibility"
  | "structure"
  | "general";

export interface CritiqueTarget {
  type: "room" | "wall" | "opening" | "plan";
  id: RoomId | WallId | string;
  /** Human label for display (e.g. "Master Bedroom") */
  label: string;
}

export interface CritiqueItem {
  id: string;
  severity: CritiqueSeverity;
  category: CritiqueCategory;
  title: string;
  description: string;
  /** Specific, actionable suggestion */
  suggestion: string;
  /** What metric/measurement supports this finding */
  metric?: string;
  target: CritiqueTarget;
}

export interface CritiqueResult {
  id: string;
  planId: string;
  projectId: string;
  createdAt: number;
  items: CritiqueItem[];
  /** Overall score 0–100, higher = better */
  overallScore?: number;
  summary: string;
}

// Mock for scaffold phase
export const MOCK_CRITIQUE: CritiqueResult = {
  id: "mock-critique-1",
  planId: "mock-plan-1",
  projectId: "mock-project-1",
  createdAt: Date.now(),
  summary: "The plan shows a compact layout with potential circulation improvements.",
  overallScore: 72,
  items: [
    {
      id: "c1",
      severity: "major",
      category: "dimensions",
      title: "Narrow master corridor",
      description: "The corridor connecting the master bedroom to the bathroom is 1.1m wide over a 3.8m run.",
      suggestion: "Widen to 1.2m minimum. This reclaims flow without significant area loss.",
      metric: "Width: 1.1m (min recommended: 1.2m)",
      target: { type: "room", id: "mock-room-corridor", label: "Master Corridor" },
    },
    {
      id: "c2",
      severity: "minor",
      category: "natural_light",
      title: "Kitchen lacks direct north light",
      description: "Kitchen faces south with no window on the north wall. Morning light will be indirect.",
      suggestion: "Add a 0.9m window on the north-facing wall near the sink.",
      target: { type: "room", id: "mock-room-kitchen", label: "Kitchen" },
    },
    {
      id: "c3",
      severity: "info",
      category: "adjacency",
      title: "Good bedroom-bathroom adjacency",
      description: "All three bedrooms have direct or one-step access to a bathroom.",
      suggestion: "No change needed.",
      target: { type: "plan", id: "plan", label: "Overall Plan" },
    },
  ],
};

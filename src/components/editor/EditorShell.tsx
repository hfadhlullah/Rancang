"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Plan, DEFAULT_PLAN } from "@/lib/types/plan";
import { DrawingTool, ViewMode } from "@/lib/types/editor";
import { CritiquePanel } from "@/components/critique/CritiquePanel";
import { RequirementsForm } from "@/components/requirements/RequirementsForm";
import { SnapshotPanel } from "@/components/editor/SnapshotPanel";
import { RoomEditor } from "@/components/editor/RoomEditor";
import { GeneratePanel } from "@/components/generate/GeneratePanel";
import {
  ArrowLeft,
  Box,
  Layers,
  MessageSquare,
  Undo2,
  Redo2,
  MousePointer2,
  Minus,
  DoorOpen,
  Square,
  FileText,
  Camera,
  LayoutDashboard,
  Sparkles,
  Settings,
} from "lucide-react";

const Canvas2D = dynamic(
  () => import("@/components/canvas/Canvas2D").then((m) => ({ default: m.Canvas2D })),
  { ssr: false }
);
const Viewer3D = dynamic(
  () => import("@/components/viewer/Viewer3D").then((m) => ({ default: m.Viewer3D })),
  { ssr: false }
);

// ---------- History reducer ----------
type HistoryState = { past: Plan[]; present: Plan; future: Plan[] };
type HistoryAction =
  | { type: "SET"; plan: Plan }
  | { type: "UNDO" }
  | { type: "REDO" };

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case "SET":
      return {
        past: [...state.past.slice(-49), state.present],
        present: action.plan,
        future: [],
      };
    case "UNDO":
      if (!state.past.length) return state;
      return {
        past: state.past.slice(0, -1),
        present: state.past[state.past.length - 1],
        future: [state.present, ...state.future],
      };
    case "REDO":
      if (!state.future.length) return state;
      return {
        past: [...state.past, state.present],
        present: state.future[0],
        future: state.future.slice(1),
      };
    default:
      return state;
  }
}

type RightPanel = "critique" | "requirements" | "snapshots" | "rooms" | "generate" | null;

export function EditorShell({ projectId }: { projectId: string }) {
  const router = useRouter();
  const project = useQuery(api.projects.get, { id: projectId as Id<"projects"> });
  const updateProject = useMutation(api.projects.update);

  const [viewMode, setViewMode] = useState<ViewMode>("canvas");
  const [tool, setTool] = useState<DrawingTool>("select");
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [activeFloor, setActiveFloor] = useState(0);
  const [view3DFloor, setView3DFloor] = useState<number | null>(null); // null = all floors

  const saveTimer = useRef<NodeJS.Timeout | null>(null);

  const [history, dispatch] = useReducer(historyReducer, {
    past: [],
    present: DEFAULT_PLAN,
    future: [],
  });

  const plan = history.present;

  // Load plan on first fetch
  useEffect(() => {
    if (project && !initialized) {
      const loaded = project.planJson
        ? (JSON.parse(project.planJson) as Plan)
        : DEFAULT_PLAN;
      dispatch({ type: "SET", plan: loaded });
      setInitialized(true);
    }
  }, [project, initialized]);

  // Auto-save 1s debounce
  const scheduleSave = useCallback(
    (p: Plan) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        setSaving(true);
        try {
          await updateProject({
            id: projectId as Id<"projects">,
            planJson: JSON.stringify(p),
          });
        } finally {
          setSaving(false);
        }
      }, 1000);
    },
    [projectId, updateProject]
  );

  const setPlan = useCallback(
    (p: Plan) => {
      dispatch({ type: "SET", plan: p });
      scheduleSave(p);
    },
    [scheduleSave]
  );

  // Restore from snapshot — bypasses history to avoid giant undo stack
  const restorePlan = useCallback(
    (p: Plan) => {
      dispatch({ type: "SET", plan: p });
      scheduleSave(p);
    },
    [scheduleSave]
  );

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: "UNDO" });
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        (e.key === "y" || (e.key === "z" && e.shiftKey))
      ) {
        e.preventDefault();
        dispatch({ type: "REDO" });
      }
      if (e.key === "Escape") setTool("select");
      if (e.key === "w") setTool("wall");
      if (e.key === "d") setTool("door");
      if (e.key === "n") setTool("window");
      if (e.key === "r") setTool("room");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const tools: {
    id: DrawingTool;
    icon: React.ReactNode;
    label: string;
    key?: string;
  }[] = [
    { id: "select", icon: <MousePointer2 size={16} />, label: "Select", key: "Esc" },
    { id: "wall", icon: <Minus size={16} />, label: "Wall", key: "W" },
    { id: "door", icon: <DoorOpen size={16} />, label: "Door", key: "D" },
    { id: "window", icon: <Square size={16} />, label: "Window", key: "N" },
    { id: "room", icon: <Layers size={16} />, label: "Room", key: "R" },
  ];

  const panelToggles: {
    id: RightPanel;
    icon: React.ReactNode;
    title: string;
  }[] = [
    { id: "generate", icon: <Sparkles size={14} />, title: "Generate from prompt" },
    { id: "rooms", icon: <LayoutDashboard size={14} />, title: "Rooms" },
    { id: "requirements", icon: <FileText size={14} />, title: "Requirements" },
    { id: "critique", icon: <MessageSquare size={14} />, title: "AI Critique" },
    { id: "snapshots", icon: <Camera size={14} />, title: "Snapshots" },
  ];

  function togglePanel(id: RightPanel) {
    setRightPanel((p) => (p === id ? null : id));
  }

  if (!project) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      {/* Top bar */}
      <header className="border-b h-12 flex items-center gap-3 px-3 shrink-0">
        <button
          onClick={() => router.push("/dashboard")}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <span className="font-medium text-sm truncate max-w-[200px]">{project.name}</span>
        <div className="flex-1" />

        {/* View toggle */}
        <div className="flex items-center border rounded-md overflow-hidden text-sm">
          <button
            onClick={() => setViewMode("canvas")}
            className={`px-3 py-1.5 transition-colors ${
              viewMode === "canvas"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            }`}
          >
            2D
          </button>
          <button
            onClick={() => setViewMode("3d")}
            className={`px-3 py-1.5 flex items-center gap-1.5 transition-colors ${
              viewMode === "3d"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            }`}
          >
            <Box size={12} />
            3D
          </button>
        </div>

        {/* Floor selector — 2D: picks active drawing floor; 3D: filters view */}
        {(plan.metadata.floors ?? 1) > 1 || viewMode === "canvas" ? (
          <div className="flex items-center gap-1">
            {viewMode === "3d" && (
              <button
                onClick={() => setView3DFloor(null)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  view3DFloor === null
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-muted-foreground"
                }`}
              >
                All
              </button>
            )}
            {Array.from({ length: plan.metadata.floors ?? 1 }, (_, i) => (
              <button
                key={i}
                onClick={() => {
                  if (viewMode === "canvas") setActiveFloor(i);
                  else setView3DFloor(i);
                }}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  viewMode === "canvas"
                    ? activeFloor === i
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-muted-foreground"
                    : view3DFloor === i
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-muted-foreground"
                }`}
              >
                F{i + 1}
              </button>
            ))}
            {viewMode === "canvas" && (plan.metadata.floors ?? 1) < 6 && (
              <button
                onClick={() => {
                  const floors = (plan.metadata.floors ?? 1) + 1;
                  setPlan({ ...plan, metadata: { ...plan.metadata, floors } });
                  setActiveFloor(floors - 1);
                }}
                className="px-2 py-1 text-xs rounded hover:bg-muted text-muted-foreground transition-colors"
                title="Add floor"
              >
                +
              </button>
            )}
          </div>
        ) : null}

        {/* Undo/redo */}
        {viewMode === "canvas" && (
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => dispatch({ type: "UNDO" })}
              disabled={!history.past.length}
              className="p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 size={14} />
            </button>
            <button
              onClick={() => dispatch({ type: "REDO" })}
              disabled={!history.future.length}
              className="p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors"
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 size={14} />
            </button>
          </div>
        )}

        <span className="text-xs text-muted-foreground w-12 text-right">
          {saving ? "Saving…" : "Saved"}
        </span>

        <button
          onClick={() => router.push("/settings")}
          title="Settings"
          className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors"
        >
          <Settings size={14} />
        </button>

        {/* Right panel toggles */}
        <div className="flex items-center gap-0.5">
          {panelToggles.map((p) => (
            <button
              key={p.id}
              onClick={() => togglePanel(p.id)}
              title={p.title}
              className={`p-1.5 rounded transition-colors ${
                rightPanel === p.id
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-muted-foreground"
              }`}
            >
              {p.icon}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Tool sidebar — 2D only */}
        {viewMode === "canvas" && (
          <aside className="w-12 border-r flex flex-col items-center py-2 gap-1 shrink-0">
            {tools.map((t) => (
              <button
                key={t.id}
                onClick={() => setTool(t.id)}
                title={`${t.label}${t.key ? ` (${t.key})` : ""}`}
                className={`w-9 h-9 rounded-md flex items-center justify-center transition-colors ${
                  tool === t.id
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-muted-foreground"
                }`}
              >
                {t.icon}
              </button>
            ))}
          </aside>
        )}

        {/* Main canvas / viewer */}
        <main className="flex-1 overflow-hidden bg-muted/30">
          {viewMode === "canvas" ? (
            initialized && (
              <Canvas2D
                plan={plan}
                onPlanChange={setPlan}
                tool={tool}
                onToolChange={setTool}
                activeFloor={activeFloor}
              />
            )
          ) : (
            <Viewer3D plan={plan} activeFloor={activeFloor} viewFloor={view3DFloor} />
          )}
        </main>

        {/* Right panel */}
        {rightPanel && (
          <aside className="w-80 border-l overflow-y-auto shrink-0 bg-background">
            {rightPanel === "critique" && (
              <CritiquePanel
                projectId={projectId as Id<"projects">}
                plan={plan}
              />
            )}
            {rightPanel === "requirements" && (
              <RequirementsForm projectId={projectId as Id<"projects">} />
            )}
            {rightPanel === "snapshots" && (
              <SnapshotPanel
                projectId={projectId as Id<"projects">}
                plan={plan}
                onRestore={restorePlan}
              />
            )}
            {rightPanel === "rooms" && (
              <RoomEditor plan={plan} onPlanChange={setPlan} />
            )}
            {rightPanel === "generate" && (
              <GeneratePanel plan={plan} onPlanChange={setPlan} />
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

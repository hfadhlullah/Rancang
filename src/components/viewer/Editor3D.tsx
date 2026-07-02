/// <reference types="@react-three/fiber" />
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, ThreeEvent } from "@react-three/fiber";
import { Grid, Html } from "@react-three/drei";
import * as THREE from "three";
import { nanoid } from "nanoid";
import { Plan, Furniture, FurnitureKind, Opening } from "@/lib/types/plan";
import { reconcileAutoRooms } from "@/lib/rooms/detectRooms";
import { FURNITURE_CATALOG, FURNITURE_BY_KIND, FURNITURE_CATEGORIES } from "@/lib/furniture/catalog";
import { Furniture3D } from "./Furniture3D";
import { WallMesh, getPlanBounds, planToMeters } from "./Viewer3D";
import {
  MousePointer2,
  Minus,
  DoorOpen,
  Square,
  Armchair,
  Paintbrush,
  Hammer,
  RotateCw,
  Copy,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Tag,
} from "lucide-react";

const PPM = 50; // pixels per meter (matches plan metadata default)
const GRID_M = 0.5; // Sims-style build grid
const GRID_PX = GRID_M * PPM;
const VERTEX_SNAP_PX = 15;

function metersToPx(m: number) {
  return m * PPM;
}

export type EditTool = "select" | "wall" | "door" | "window" | "furniture" | "paint" | "delete";

const PAINT_COLORS = [
  "#f9fafb", "#e5e7eb", "#d1d5db", "#fca5a5", "#fdba74", "#fde68a",
  "#bef264", "#86efac", "#7dd3fc", "#93c5fd", "#c4b5fd", "#f9a8d4",
  "#a8a29e", "#78716c", "#475569", "#1e293b",
];

// ---------- Camera rig (Sims-style) ----------

interface RigState {
  target: { x: number; z: number };
  yaw: number;
  pitch: number; // elevation angle, radians
  dist: number;
}

interface PointerState {
  x: number; // client coords relative to container
  y: number;
  inside: boolean;
  w: number;
  h: number;
}

const EDGE_PAN_PX = 16;

function SimsCamera({
  rig,
  keys,
  pointer,
  edgePanEnabled,
}: {
  rig: React.MutableRefObject<RigState>;
  keys: React.MutableRefObject<Set<string>>;
  pointer: React.MutableRefObject<PointerState>;
  edgePanEnabled: React.MutableRefObject<boolean>;
}) {
  const { camera } = useThree();

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const r = rig.current;
    const k = keys.current;

    // Pan relative to camera yaw
    const panSpeed = Math.max(r.dist, 3) * 0.9 * dt;
    const fx = -Math.sin(r.yaw); // forward on ground plane
    const fz = -Math.cos(r.yaw);
    const rx = -fz;
    const rz = fx;
    let px = 0, pz = 0;
    if (k.has("w") || k.has("arrowup")) { px += fx; pz += fz; }
    if (k.has("s") || k.has("arrowdown")) { px -= fx; pz -= fz; }
    if (k.has("a") || k.has("arrowleft")) { px -= rx; pz -= rz; }
    if (k.has("d") || k.has("arrowright")) { px += rx; pz += rz; }

    // Edge pan (Sims-style) — pointer near container edge
    const p = pointer.current;
    if (edgePanEnabled.current && p.inside && p.w > 0) {
      if (p.x < EDGE_PAN_PX) { px -= rx; pz -= rz; }
      if (p.x > p.w - EDGE_PAN_PX) { px += rx; pz += rz; }
      if (p.y < EDGE_PAN_PX) { px += fx; pz += fz; }
      if (p.y > p.h - EDGE_PAN_PX) { px -= fx; pz -= fz; }
    }
    r.target.x += px * panSpeed;
    r.target.z += pz * panSpeed;

    // Q/E rotate
    if (k.has("q")) r.yaw += 1.6 * dt;
    if (k.has("e")) r.yaw -= 1.6 * dt;

    // Apply spherical position
    const cy = Math.cos(r.pitch);
    camera.position.set(
      r.target.x + Math.sin(r.yaw) * cy * r.dist,
      Math.sin(r.pitch) * r.dist,
      r.target.z + Math.cos(r.yaw) * cy * r.dist
    );
    camera.lookAt(r.target.x, 0, r.target.z);
  });

  return null;
}

// ---------- Plan mutation helpers ----------

function snapPoint(
  plan: Plan,
  floor: number,
  rawX: number,
  rawY: number,
  excludeIds: string[] = []
): { x: number; y: number; vid: string | null } {
  let best: { id: string; d: number; x: number; y: number } | null = null;
  for (const v of Object.values(plan.vertices)) {
    if ((v.floor ?? 0) !== floor || excludeIds.includes(v.id)) continue;
    const d = Math.hypot(v.x - rawX, v.y - rawY);
    if (d <= VERTEX_SNAP_PX && (!best || d < best.d)) best = { id: v.id, d, x: v.x, y: v.y };
  }
  if (best) return { x: best.x, y: best.y, vid: best.id };

  // Wall-body snap: snap to closest point along any wall segment
  let wallBest: { x: number; y: number; d: number } | null = null;
  for (const wall of Object.values(plan.walls)) {
    if ((wall.floor ?? 0) !== floor) continue;
    const sv = plan.vertices[wall.startId];
    const ev = plan.vertices[wall.endId];
    if (!sv || !ev) continue;
    const dx = ev.x - sv.x, dy = ev.y - sv.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1) continue;
    const t = Math.max(0.05, Math.min(0.95, ((rawX - sv.x) * dx + (rawY - sv.y) * dy) / lenSq));
    const cx = sv.x + t * dx, cy = sv.y + t * dy;
    const d = Math.hypot(rawX - cx, rawY - cy);
    if (d <= VERTEX_SNAP_PX && (!wallBest || d < wallBest.d)) wallBest = { x: cx, y: cy, d };
  }
  if (wallBest) return { x: wallBest.x, y: wallBest.y, vid: null };

  return {
    x: Math.round(rawX / GRID_PX) * GRID_PX,
    y: Math.round(rawY / GRID_PX) * GRID_PX,
    vid: null,
  };
}

/** If vertex (x,y) lies on the body of an existing wall, split that wall into two. */
function splitWallAtPoint(plan: Plan, vertexId: string, x: number, y: number, floor: number): Plan {
  for (const [wallId, wall] of Object.entries(plan.walls)) {
    if ((wall.floor ?? 0) !== floor) continue;
    if (wall.startId === vertexId || wall.endId === vertexId) continue;
    const sv = plan.vertices[wall.startId];
    const ev = plan.vertices[wall.endId];
    if (!sv || !ev) continue;
    const dx = ev.x - sv.x, dy = ev.y - sv.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1) continue;
    const t = ((x - sv.x) * dx + (y - sv.y) * dy) / lenSq;
    if (t <= 0.02 || t >= 0.98) continue; // too close to endpoints
    const cx = sv.x + t * dx, cy = sv.y + t * dy;
    if (Math.hypot(x - cx, y - cy) > VERTEX_SNAP_PX) continue; // not on this wall

    // Split: original wall → [start→vertex] + [vertex→end]
    const walls = { ...plan.walls };
    delete walls[wallId];
    const w1 = nanoid(), w2 = nanoid();
    walls[w1] = { ...wall, id: w1, endId: vertexId };
    walls[w2] = { ...wall, id: w2, startId: vertexId };

    // Reassign openings proportionally
    const openings = { ...plan.openings };
    for (const [oid, o] of Object.entries(openings)) {
      if (o.wallId !== wallId) continue;
      if (o.position < t) {
        openings[oid] = { ...o, wallId: w1, position: o.position / t };
      } else {
        openings[oid] = { ...o, wallId: w2, position: (o.position - t) / (1 - t) };
      }
    }

    return { ...plan, walls, openings };
  }
  return plan;
}

function deleteWallFromPlan(plan: Plan, wallId: string): Plan {
  const wall = plan.walls[wallId];
  if (!wall) return plan;
  const walls = { ...plan.walls };
  delete walls[wallId];
  const openings = Object.fromEntries(
    Object.entries(plan.openings).filter(([, o]) => o.wallId !== wallId)
  );
  // Remove vertices no longer referenced by any wall
  const vertices = { ...plan.vertices };
  for (const vid of [wall.startId, wall.endId]) {
    const used = Object.values(walls).some((w) => w.startId === vid || w.endId === vid);
    if (!used) delete vertices[vid];
  }
  return { ...plan, walls, openings, vertices };
}

// ---------- Wall Selection HUD (Sims-style) ----------

interface WallHUDProps {
  onNudge: (dx: number, dy: number) => void;
  onCopy: () => void;
  onDelete: () => void;
}

function WallSelectionHUD({ onNudge, onCopy, onDelete }: WallHUDProps) {
  function stop(e: React.PointerEvent | React.MouseEvent) {
    e.stopPropagation();
  }
  const nudgePx = GRID_PX;

  return (
    <div
      onPointerDown={stop}
      onPointerUp={stop}
      onClick={stop}
      className="pointer-events-auto select-none flex flex-col items-center gap-0.5"
      style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.45))" }}
    >
      {/* Top row: action buttons */}
      <div className="flex items-center gap-1 mb-0.5">
        <button
          onPointerDown={stop}
          onClick={(e) => { stop(e); onCopy(); }}
          className="w-7 h-7 flex items-center justify-center rounded-md bg-white/90 hover:bg-white text-slate-700 border border-white/60 shadow"
          title="Duplicate wall"
        >
          <Copy size={13} />
        </button>
        <button
          onPointerDown={stop}
          onClick={(e) => { stop(e); onDelete(); }}
          className="w-7 h-7 flex items-center justify-center rounded-md bg-white/90 hover:bg-red-50 text-red-500 border border-white/60 shadow"
          title="Delete wall"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* D-pad */}
      <div
        className="grid gap-0.5"
        style={{ gridTemplateColumns: "repeat(3, 28px)", gridTemplateRows: "repeat(3, 28px)" }}
      >
        {/* row 1 */}
        <div />
        <button
          onPointerDown={stop}
          onClick={(e) => { stop(e); onNudge(0, -nudgePx); }}
          className="flex items-center justify-center rounded-md bg-white/90 hover:bg-white text-slate-700 border border-white/60 shadow"
          title="Move ↑"
        >
          <ChevronUp size={14} />
        </button>
        <div />
        {/* row 2 */}
        <button
          onPointerDown={stop}
          onClick={(e) => { stop(e); onNudge(-nudgePx, 0); }}
          className="flex items-center justify-center rounded-md bg-white/90 hover:bg-white text-slate-700 border border-white/60 shadow"
          title="Move ←"
        >
          <ChevronLeft size={14} />
        </button>
        <div className="flex items-center justify-center rounded-md bg-slate-200/80 border border-white/40">
          {/* center: drag indicator */}
          <div className="w-2 h-2 rounded-full bg-slate-400" />
        </div>
        <button
          onPointerDown={stop}
          onClick={(e) => { stop(e); onNudge(nudgePx, 0); }}
          className="flex items-center justify-center rounded-md bg-white/90 hover:bg-white text-slate-700 border border-white/60 shadow"
          title="Move →"
        >
          <ChevronRight size={14} />
        </button>
        {/* row 3 */}
        <div />
        <button
          onPointerDown={stop}
          onClick={(e) => { stop(e); onNudge(0, nudgePx); }}
          className="flex items-center justify-center rounded-md bg-white/90 hover:bg-white text-slate-700 border border-white/60 shadow"
          title="Move ↓"
        >
          <ChevronDown size={14} />
        </button>
        <div />
      </div>
    </div>
  );
}

// ---------- Opening Selection HUD ----------

function OpeningSelectionHUD({ onDelete }: { onDelete: () => void }) {
  function stop(e: React.PointerEvent | React.MouseEvent) { e.stopPropagation(); }
  return (
    <div
      onPointerDown={stop}
      onPointerUp={stop}
      onClick={stop}
      className="pointer-events-auto select-none flex flex-col items-center gap-1"
      style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.45))" }}
    >
      <div className="text-[10px] text-white bg-black/60 rounded-full px-2 py-0.5 whitespace-nowrap">
        Drag to slide along wall
      </div>
      <button
        onPointerDown={stop}
        onClick={(e) => { stop(e); onDelete(); }}
        className="w-7 h-7 flex items-center justify-center rounded-md bg-white/90 hover:bg-red-50 text-red-500 border border-white/60 shadow"
        title="Delete"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// ---------- Main component ----------

interface Editor3DProps {
  plan: Plan;
  onPlanChange: (plan: Plan) => void;
  activeFloor: number;
}

type Selected = { type: "wall" | "furniture" | "opening" | "room"; id: string } | null;

export function Editor3D({ plan, onPlanChange, activeFloor }: Editor3DProps) {
  const wallHeight = plan.metadata.wallHeight;
  const floorY = activeFloor * wallHeight;

  const [tool, setTool] = useState<EditTool>("select");
  const [furnKind, setFurnKind] = useState<FurnitureKind>("sofa");
  const [paintColor, setPaintColor] = useState<string>(PAINT_COLORS[9]);
  const [showRoomLabels, setShowRoomLabels] = useState(true);
  const [selected, setSelected] = useState<Selected>(null);
  const [ghostRot, setGhostRot] = useState(0);
  const [wallStart, setWallStart] = useState<{ x: number; y: number; vid: string | null } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; vid: string | null } | null>(null);
  const [hoverWall, setHoverWall] = useState<{ wallId: string; t: number } | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  // Live drag previews — committed to plan on pointer-up so undo history stays clean
  const [furnDrag, setFurnDrag] = useState<{ id: string; x: number; y: number; grabDx: number; grabDy: number } | null>(null);
  const [wallDrag, setWallDrag] = useState<{ id: string; fromX: number; fromY: number; dx: number; dy: number } | null>(null);
  const [openingDrag, setOpeningDrag] = useState<{ id: string; wallId: string; liveT: number } | null>(null);
  const [vertexDrag, setVertexDrag] = useState<{ id: string; fromX: number; fromY: number; dx: number; dy: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const keys = useRef<Set<string>>(new Set());
  const pointer = useRef<PointerState>({ x: 0, y: 0, inside: false, w: 0, h: 0 });
  const pendingWallDrag = useRef<{ id: string; fromX: number; fromY: number } | null>(null);
  const pendingVertexDrag = useRef<{ id: string; fromX: number; fromY: number } | null>(null);
  const edgePanEnabled = useRef(true);
  const rig = useRef<RigState>({ target: { x: 0, z: 0 }, yaw: Math.PI / 4, pitch: 0.9, dist: 18 });
  const rigInit = useRef(false);

  // Initialize camera on plan bounds once
  if (!rigInit.current) {
    const b = getPlanBounds(plan);
    rig.current.target = { x: b.centerX, z: b.centerY };
    rig.current.dist = Math.max(Math.max(b.width, b.height, 5) * 1.1, 8);
    rigInit.current = true;
  }

  // Keyboard: camera keys + tool shortcuts + rotate/delete/escape
  useEffect(() => {
    const CAMERA_KEYS = new Set(["w", "a", "s", "d", "q", "e", "arrowup", "arrowdown", "arrowleft", "arrowright"]);
    const TOOL_KEYS = new Set(["1", "2", "3", "4", "5", "6", "7", "r", "escape"]);

    function down(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const k = e.key.toLowerCase();
      keys.current.add(k);
      // Prevent browser quick-find / default scroll / other browser bindings.
      // Only block when pointer is inside the 3D canvas so other page inputs aren't crippled.
      if (pointer.current.inside && (CAMERA_KEYS.has(k) || TOOL_KEYS.has(k))) e.preventDefault();

      if (e.key === "Escape") {
        setWallStart(null);
        setSelected(null);
        setTool("select");
      }
      if (e.key === "1") setTool("select");
      if (e.key === "2") setTool("wall");
      if (e.key === "3") setTool("door");
      if (e.key === "4") setTool("window");
      if (e.key === "5") setTool("furniture");
      if (e.key === "6") setTool("paint");
      if (e.key === "7") setTool("delete");
      if (e.key.toLowerCase() === "r") {
        // Rotate ghost (placing) or selected furniture by 45°
        if (tool === "furniture") setGhostRot((r) => r + Math.PI / 4);
        else if (selected?.type === "furniture") {
          const f = plan.furniture?.[selected.id];
          if (f) {
            onPlanChange({
              ...plan,
              furniture: { ...(plan.furniture ?? {}), [f.id]: { ...f, rotation: f.rotation + Math.PI / 4 } },
            });
          }
        }
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        e.preventDefault();
        deleteSelected();
      }
    }
    function up(e: KeyboardEvent) {
      keys.current.delete(e.key.toLowerCase());
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, selected, plan, onPlanChange]);

  // Clear transient state when switching tools
  useEffect(() => {
    setWallStart(null);
    setHoverWall(null);
    setHoverId(null);
  }, [tool]);

  // Auto-detect rooms from closed wall loops (Sims-style) + repair T-junctions
  // Deps: only walls + vertices so this doesn't re-run when only rooms update
  const planRef = useRef(plan);
  planRef.current = plan;
  useEffect(() => {
    const p = planRef.current;
    const updated = reconcileAutoRooms(p);

    // Check if anything actually changed (walls repair or room changes)
    const wallsSame = JSON.stringify(Object.keys(updated.walls).sort()) === JSON.stringify(Object.keys(p.walls).sort());
    const roomsSame =
      JSON.stringify(Object.keys(updated.rooms).sort()) === JSON.stringify(Object.keys(p.rooms).sort()) &&
      Object.keys(updated.rooms).every((id) => {
        const a = p.rooms[id], b = updated.rooms[id];
        return a && JSON.stringify(a.vertexIds) === JSON.stringify(b.vertexIds);
      });

    if (wallsSame && roomsSame) return;
    onPlanChange(updated);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.walls, plan.vertices]);

  const deleteSelected = useCallback(() => {
    if (!selected) return;
    if (selected.type === "wall") {
      onPlanChange(deleteWallFromPlan(plan, selected.id));
    } else if (selected.type === "furniture") {
      const furniture = { ...plan.furniture };
      delete furniture[selected.id];
      onPlanChange({ ...plan, furniture });
    } else if (selected.type === "opening") {
      const openings = { ...plan.openings };
      delete openings[selected.id];
      onPlanChange({ ...plan, openings });
    } else if (selected.type === "room") {
      const rooms = { ...plan.rooms };
      delete rooms[selected.id];
      onPlanChange({ ...plan, rooms });
    }
    setSelected(null);
  }, [selected, plan, onPlanChange]);

  // Wrapper pointer handling: zoom, rotate (middle-drag), pan (right-drag), edge pan tracking
  function onWheel(e: React.WheelEvent) {
    const r = rig.current;
    r.dist = Math.min(90, Math.max(3, r.dist * (e.deltaY > 0 ? 1.1 : 0.9)));
  }

  function onPointerMoveWrapper(e: React.PointerEvent) {
    const el = containerRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      // Edge pan only while the pointer is over the 3D canvas itself, not toolbar/panels
      const overCanvas = (e.target as HTMLElement).tagName === "CANVAS";
      pointer.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        inside: overCanvas,
        w: rect.width,
        h: rect.height,
      };
    }
    const r = rig.current;
    if (e.buttons & 4) {
      // middle-drag: orbit
      r.yaw -= e.movementX * 0.005;
      r.pitch = Math.min(1.5, Math.max(0.15, r.pitch + e.movementY * 0.005));
    } else if (e.buttons & 2) {
      // right-drag: pan
      const s = r.dist * 0.0015;
      const fx = -Math.sin(r.yaw), fz = -Math.cos(r.yaw);
      const rx = -fz, rz = fx;
      r.target.x += (-e.movementX * rx + e.movementY * fx) * s;
      r.target.z += (-e.movementX * rz + e.movementY * fz) * s;
    }
  }

  // ---------- Ground interactions ----------

  function groundPointFromEvent(e: ThreeEvent<PointerEvent>): { x: number; y: number } {
    return { x: metersToPx(e.point.x), y: metersToPx(e.point.z) };
  }

  function onGroundMove(e: ThreeEvent<PointerEvent>) {
    const raw = groundPointFromEvent(e);
    if (pendingWallDrag.current) {
      const dx = raw.x - pendingWallDrag.current.fromX;
      const dy = raw.y - pendingWallDrag.current.fromY;
      if (Math.hypot(dx, dy) > 8) {
        const pd = pendingWallDrag.current;
        pendingWallDrag.current = null;
        setWallDrag({ id: pd.id, fromX: pd.fromX, fromY: pd.fromY, dx: 0, dy: 0 });
      }
      return;
    }
    if (pendingVertexDrag.current) {
      const dx = raw.x - pendingVertexDrag.current.fromX;
      const dy = raw.y - pendingVertexDrag.current.fromY;
      if (Math.hypot(dx, dy) > 8) {
        const pd = pendingVertexDrag.current;
        pendingVertexDrag.current = null;
        setVertexDrag({ id: pd.id, fromX: pd.fromX, fromY: pd.fromY, dx: 0, dy: 0 });
      }
      return;
    }
    if (vertexDrag) {
      const dx = Math.round((raw.x - vertexDrag.fromX) / GRID_PX) * GRID_PX;
      const dy = Math.round((raw.y - vertexDrag.fromY) / GRID_PX) * GRID_PX;
      setVertexDrag((d) => (d ? { ...d, dx, dy } : null));
      return;
    }
    if (furnDrag) {
      const gx = Math.round((raw.x - furnDrag.grabDx) / (GRID_PX / 2)) * (GRID_PX / 2);
      const gy = Math.round((raw.y - furnDrag.grabDy) / (GRID_PX / 2)) * (GRID_PX / 2);
      setFurnDrag((d) => (d ? { ...d, x: gx, y: gy } : null));
      return;
    }
    if (wallDrag) {
      const dx = Math.round((raw.x - wallDrag.fromX) / GRID_PX) * GRID_PX;
      const dy = Math.round((raw.y - wallDrag.fromY) / GRID_PX) * GRID_PX;
      setWallDrag((d) => (d ? { ...d, dx, dy } : null));
      return;
    }
    if (tool === "wall" || tool === "furniture") {
      setHover(snapPoint(plan, activeFloor, raw.x, raw.y, []));
    }
  }

  function onGroundDown(e: ThreeEvent<PointerEvent>) {
    if (e.button !== 0) return;
    const raw = groundPointFromEvent(e);

    if (tool === "wall") {
      const pt = snapPoint(plan, activeFloor, raw.x, raw.y, []);
      if (!wallStart) {
        setWallStart(pt);
      } else {
        if (Math.hypot(pt.x - wallStart.x, pt.y - wallStart.y) > 1) {
          commitWall(wallStart, pt);
          setWallStart(pt); // chain like Sims wall drawing
        }
      }
      return;
    }

    if (tool === "furniture") {
      const pt = snapPoint(plan, activeFloor, raw.x, raw.y, []);
      const id = nanoid();
      const item: Furniture = { id, kind: furnKind, x: pt.x, y: pt.y, rotation: ghostRot, floor: activeFloor };
      onPlanChange({ ...plan, furniture: { ...(plan.furniture ?? {}), [id]: item } });
      return;
    }

    if (tool === "select") setSelected(null);
  }

  function nudgeWall(wallId: string, dxPx: number, dyPx: number) {
    const w = plan.walls[wallId];
    if (!w) return;
    const vertices = { ...plan.vertices };
    for (const vid of [w.startId, w.endId]) {
      const v = vertices[vid];
      if (v) vertices[vid] = { ...v, x: v.x + dxPx, y: v.y + dyPx };
    }
    onPlanChange({ ...plan, vertices });
  }

  function copyWall(wallId: string) {
    const w = plan.walls[wallId];
    if (!w) return;
    const sv = plan.vertices[w.startId];
    const ev = plan.vertices[w.endId];
    if (!sv || !ev) return;
    const dx = ev.x - sv.x;
    const dy = ev.y - sv.y;
    const len = Math.hypot(dx, dy);
    // Offset perpendicular to wall by one grid cell
    const nx = len > 0 ? (-dy / len) * GRID_PX : GRID_PX;
    const ny = len > 0 ? (dx / len) * GRID_PX : 0;
    const aid = nanoid(), bid = nanoid(), wid = nanoid();
    const newVerts = { ...plan.vertices };
    newVerts[aid] = { id: aid, x: sv.x + nx, y: sv.y + ny, floor: w.floor ?? 0 };
    newVerts[bid] = { id: bid, x: ev.x + nx, y: ev.y + ny, floor: w.floor ?? 0 };
    onPlanChange({
      ...plan,
      vertices: newVerts,
      walls: {
        ...plan.walls,
        [wid]: { id: wid, startId: aid, endId: bid, thickness: w.thickness, floor: w.floor, color: w.color },
      },
    });
    setSelected({ type: "wall", id: wid });
  }

  function commitWall(a: { x: number; y: number; vid: string | null }, b: { x: number; y: number; vid: string | null }) {
    const vertices = { ...plan.vertices };
    const aid = a.vid ?? nanoid();
    if (!a.vid) vertices[aid] = { id: aid, x: a.x, y: a.y, floor: activeFloor };
    const bid = b.vid ?? nanoid();
    if (!b.vid) vertices[bid] = { id: bid, x: b.x, y: b.y, floor: activeFloor };
    const wid = nanoid();
    let updated: Plan = {
      ...plan,
      vertices,
      walls: { ...plan.walls, [wid]: { id: wid, startId: aid, endId: bid, thickness: 0.2, floor: activeFloor } },
    };
    // Split any existing wall that a new endpoint lands on
    if (!a.vid) updated = splitWallAtPoint(updated, aid, a.x, a.y, activeFloor);
    if (!b.vid) updated = splitWallAtPoint(updated, bid, b.x, b.y, activeFloor);
    onPlanChange(updated);
  }

  // ---------- Wall interactions ----------

  function wallLengthPx(wallId: string): number {
    const w = plan.walls[wallId];
    if (!w) return 0;
    const sv = plan.vertices[w.startId];
    const ev = plan.vertices[w.endId];
    if (!sv || !ev) return 0;
    return Math.hypot(ev.x - sv.x, ev.y - sv.y);
  }

  function wallTFromPoint(wallId: string, point: THREE.Vector3): number {
    const w = plan.walls[wallId];
    const sv = plan.vertices[w.startId];
    const ev = plan.vertices[w.endId];
    const px = metersToPx(point.x);
    const py = metersToPx(point.z);
    const dx = ev.x - sv.x;
    const dy = ev.y - sv.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 0.001) return 0.5;
    return Math.max(0, Math.min(1, ((px - sv.x) * dx + (py - sv.y) * dy) / lenSq));
  }

  function clampOpeningT(wallId: string, t: number, widthM: number): number | null {
    const lenM = planToMeters(wallLengthPx(wallId));
    if (lenM < widthM + 0.1) return null; // wall too short
    const half = widthM / 2 / lenM;
    return Math.max(half, Math.min(1 - half, t));
  }

  function onWallMove(wallId: string, e: ThreeEvent<PointerEvent>) {
    // Slide selected opening along this wall
    if (openingDrag && openingDrag.wallId === wallId) {
      e.stopPropagation();
      const opening = plan.openings[openingDrag.id];
      if (opening) {
        const t = wallTFromPoint(wallId, e.point);
        const clamped = clampOpeningT(wallId, t, opening.width);
        if (clamped !== null) setOpeningDrag((d) => d ? { ...d, liveT: clamped } : null);
      }
      return;
    }
    if (tool === "door" || tool === "window") {
      e.stopPropagation();
      setHoverWall({ wallId, t: wallTFromPoint(wallId, e.point) });
    } else if (tool === "paint" || tool === "delete" || tool === "select") {
      setHoverId(wallId);
    }
  }

  function onWallDown(wallId: string, e: ThreeEvent<PointerEvent>) {
    if (e.button !== 0) return;
    if (tool === "door" || tool === "window") {
      e.stopPropagation();
      const widthM = tool === "door" ? 0.9 : 1.2;
      const heightM = tool === "door" ? 2.1 : 1.2;
      const t = clampOpeningT(wallId, wallTFromPoint(wallId, e.point), widthM);
      if (t === null) return;
      const id = nanoid();
      const opening: Opening = { id, wallId, type: tool, position: t, width: widthM, height: heightM, floor: activeFloor };
      onPlanChange({ ...plan, openings: { ...plan.openings, [id]: opening } });
      return;
    }
    if (tool === "paint") {
      e.stopPropagation();
      const w = plan.walls[wallId];
      onPlanChange({ ...plan, walls: { ...plan.walls, [wallId]: { ...w, color: paintColor } } });
      return;
    }
    if (tool === "delete") {
      e.stopPropagation();
      onPlanChange(deleteWallFromPlan(plan, wallId));
      return;
    }
    if (tool === "select") {
      e.stopPropagation();
      const alreadySelected = selected?.type === "wall" && selected.id === wallId;
      setSelected({ type: "wall", id: wallId });
      // Drag only allowed if wall was already selected (second click+hold)
      if (alreadySelected) {
        const p = groundPointFromEvent(e);
        pendingWallDrag.current = { id: wallId, fromX: p.x, fromY: p.y };
      }
    }
  }

  // ---------- Opening interactions ----------

  function onOpeningDown(openingId: string, e: ThreeEvent<PointerEvent>) {
    if (e.button !== 0) return;
    if (tool === "delete") {
      const openings = { ...plan.openings };
      delete openings[openingId];
      onPlanChange({ ...plan, openings });
      return;
    }
    if (tool === "select") {
      const opening = plan.openings[openingId];
      if (!opening) return;
      setSelected({ type: "opening", id: openingId });
      setOpeningDrag({ id: openingId, wallId: opening.wallId, liveT: opening.position });
    }
  }

  // ---------- Furniture interactions ----------

  function onFurnitureDown(f: Furniture, e: ThreeEvent<PointerEvent>) {
    if (e.button !== 0) return;
    if (tool === "delete") {
      e.stopPropagation();
      const furniture = { ...plan.furniture };
      delete furniture[f.id];
      onPlanChange({ ...plan, furniture });
      return;
    }
    if (tool === "paint") {
      e.stopPropagation();
      onPlanChange({ ...plan, furniture: { ...(plan.furniture ?? {}), [f.id]: { ...f, color: paintColor } } });
      return;
    }
    if (tool === "select") {
      e.stopPropagation();
      setSelected({ type: "furniture", id: f.id });
      const p = groundPointFromEvent(e);
      setFurnDrag({ id: f.id, x: f.x, y: f.y, grabDx: p.x - f.x, grabDy: p.y - f.y });
    }
  }

  // Commit drags on global pointer-up
  useEffect(() => {
    function onUp() {
      pendingWallDrag.current = null;
      pendingVertexDrag.current = null;
      if (furnDrag) {
        const f = plan.furniture?.[furnDrag.id];
        if (f && (f.x !== furnDrag.x || f.y !== furnDrag.y)) {
          onPlanChange({ ...plan, furniture: { ...(plan.furniture ?? {}), [f.id]: { ...f, x: furnDrag.x, y: furnDrag.y } } });
        }
        setFurnDrag(null);
      }
      if (wallDrag) {
        if (wallDrag.dx !== 0 || wallDrag.dy !== 0) {
          const w = plan.walls[wallDrag.id];
          if (w) {
            const vertices = { ...plan.vertices };
            for (const vid of [w.startId, w.endId]) {
              const v = vertices[vid];
              if (v) vertices[vid] = { ...v, x: v.x + wallDrag.dx, y: v.y + wallDrag.dy };
            }
            onPlanChange({ ...plan, vertices });
          }
        }
        setWallDrag(null);
      }
      if (openingDrag) {
        const o = plan.openings[openingDrag.id];
        if (o && o.position !== openingDrag.liveT) {
          onPlanChange({ ...plan, openings: { ...plan.openings, [o.id]: { ...o, position: openingDrag.liveT } } });
        }
        setOpeningDrag(null);
      }
      if (vertexDrag) {
        if (vertexDrag.dx !== 0 || vertexDrag.dy !== 0) {
          const v = plan.vertices[vertexDrag.id];
          if (v) {
            onPlanChange({ ...plan, vertices: { ...plan.vertices, [v.id]: { ...v, x: v.x + vertexDrag.dx, y: v.y + vertexDrag.dy } } });
          }
        }
        setVertexDrag(null);
      }
    }
    window.addEventListener("pointerup", onUp);
    return () => window.removeEventListener("pointerup", onUp);
  }, [furnDrag, wallDrag, openingDrag, vertexDrag, plan, onPlanChange]);

  // ---------- Render data ----------

  // Floors at or below the active floor are shown; only activeFloor is editable
  const visibleWalls = useMemo(
    () => Object.values(plan.walls).filter((w) => (w.floor ?? 0) <= activeFloor),
    [plan.walls, activeFloor]
  );
  const visibleFurniture = useMemo(
    () => Object.values(plan.furniture ?? {}).filter((f) => (f.floor ?? 0) <= activeFloor),
    [plan.furniture, activeFloor]
  );
  const visibleRooms = useMemo(
    () => Object.values(plan.rooms).filter((r) => (r.floor ?? 0) <= activeFloor),
    [plan.rooms, activeFloor]
  );

  // Corner pillar fills
  const cornerFills = useMemo(() => {
    const vertexInfo = new Map<string, { x: number; z: number; thickness: number; floor: number; color?: string }>();
    for (const wall of visibleWalls) {
      const floorIndex = wall.floor ?? 0;
      for (const vid of [wall.startId, wall.endId]) {
        const v = plan.vertices[vid];
        if (!v) continue;
        const key = `${vid}-${floorIndex}`;
        const prev = vertexInfo.get(key);
        if (!prev || wall.thickness > prev.thickness) {
          vertexInfo.set(key, { x: planToMeters(v.x), z: planToMeters(v.y), thickness: wall.thickness, floor: floorIndex, color: wall.color });
        }
      }
    }
    return Array.from(vertexInfo.entries()).map(([key, { x, z, thickness, floor, color }]) => (
      <mesh key={`cp-${key}`} position={[x, floor * wallHeight + wallHeight / 2, z]} castShadow>
        <boxGeometry args={[thickness, wallHeight, thickness]} />
        <meshStandardMaterial color={color ?? "#d1d5db"} />
      </mesh>
    ));
  }, [visibleWalls, plan.vertices, wallHeight]);

  // Ghost wall preview
  const ghostWall = wallStart && hover && tool === "wall" ? { a: wallStart, b: hover } : null;

  // Door/window ghost
  const openingGhost = useMemo(() => {
    if (!hoverWall || (tool !== "door" && tool !== "window")) return null;
    const w = plan.walls[hoverWall.wallId];
    if (!w) return null;
    const sv = plan.vertices[w.startId];
    const ev = plan.vertices[w.endId];
    if (!sv || !ev) return null;
    const widthM = tool === "door" ? 0.9 : 1.2;
    const heightM = tool === "door" ? 2.1 : 1.2;
    const t = clampOpeningT(hoverWall.wallId, hoverWall.t, widthM);
    if (t === null) return null;
    const x = planToMeters(sv.x + (ev.x - sv.x) * t);
    const z = planToMeters(sv.y + (ev.y - sv.y) * t);
    const angle = Math.atan2(ev.y - sv.y, ev.x - sv.x);
    const y0 = tool === "window" ? 0.9 : 0;
    return { x, z, angle, widthM, heightM, y0, floor: w.floor ?? 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoverWall, tool, plan]);

  const selDef = tool === "furniture" ? FURNITURE_BY_KIND[furnKind] : null;

  const toolButtons: { id: EditTool; icon: React.ReactNode; label: string; key: string }[] = [
    { id: "select", icon: <MousePointer2 size={16} />, label: "Select / Move", key: "1" },
    { id: "wall", icon: <Minus size={16} />, label: "Build Wall", key: "2" },
    { id: "door", icon: <DoorOpen size={16} />, label: "Door", key: "3" },
    { id: "window", icon: <Square size={16} />, label: "Window", key: "4" },
    { id: "furniture", icon: <Armchair size={16} />, label: "Furniture", key: "5" },
    { id: "paint", icon: <Paintbrush size={16} />, label: "Paint", key: "6" },
    { id: "delete", icon: <Hammer size={16} />, label: "Demolish", key: "7" },
  ];

  const hint: Record<EditTool, string> = {
    select: "Click to select · Drag to move · R rotate · Del remove",
    wall: "Click to start, click to extend · Esc to stop",
    door: "Click a wall to place a door",
    window: "Click a wall to place a window",
    furniture: "Click floor to place · R rotate",
    paint: "Click a wall, floor or furniture to paint",
    delete: "Click a wall, opening or furniture to remove",
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative select-none"
      onWheel={onWheel}
      onMouseDown={(e) => {
        if (e.button === 1) e.preventDefault(); // block middle-click autoscroll
      }}
      onPointerMove={onPointerMoveWrapper}
      onPointerLeave={() => { pointer.current.inside = false; }}
      onContextMenu={(e) => {
        e.preventDefault();
        setWallStart(null);
        setSelected(null);
      }}
    >
      <Canvas shadows camera={{ fov: 50, near: 0.1, far: 300 }} gl={{ antialias: true }}>
        <SimsCamera rig={rig} keys={keys} pointer={pointer} edgePanEnabled={edgePanEnabled} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 15, 10]} intensity={0.8} castShadow shadow-mapSize={[1024, 1024]} />

        {/* Ground interaction plane at active floor level */}
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[rig.current.target.x, floorY - 0.002, rig.current.target.z]}
          onPointerMove={onGroundMove}
          onPointerDown={onGroundDown}
        >
          <planeGeometry args={[400, 400]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>

        {/* Build grid on active floor */}
        <Grid
          args={[50, 50]}
          position={[0, floorY + 0.002, 0]}
          cellSize={GRID_M}
          cellThickness={0.4}
          cellColor="#cbd5e1"
          sectionSize={GRID_M * 4}
          sectionColor="#94a3b8"
          fadeDistance={60}
          infiniteGrid
        />

        {/* Room floor fills + labels (paintable) */}
        {visibleRooms.map((room) => {
          const verts = room.vertexIds.map((id) => plan.vertices[id]).filter(Boolean);
          if (verts.length < 3) return null;
          const shape = new THREE.Shape();
          shape.moveTo(planToMeters(verts[0].x), planToMeters(verts[0].y));
          for (let i = 1; i < verts.length; i++) shape.lineTo(planToMeters(verts[i].x), planToMeters(verts[i].y));
          shape.closePath();
          const geometry = new THREE.ShapeGeometry(shape);
          const yOffset = (room.floor ?? 0) * wallHeight + 0.008;
          const centX = verts.reduce((s, v) => s + planToMeters(v.x), 0) / verts.length;
          const centZ = verts.reduce((s, v) => s + planToMeters(v.y), 0) / verts.length;
          return (
            <group key={room.id}>
              <mesh
                rotation={[Math.PI / 2, 0, 0]}
                position={[0, yOffset, 0]}
                geometry={geometry}
                renderOrder={1}
                onPointerDown={(e) => {
                  if (e.button !== 0 || (room.floor ?? 0) !== activeFloor) return;
                  if (tool === "paint") {
                    e.stopPropagation();
                    onPlanChange({ ...plan, rooms: { ...plan.rooms, [room.id]: { ...room, color: paintColor } } });
                  } else if (tool === "select") {
                    e.stopPropagation();
                    setSelected({ type: "room", id: room.id });
                  } else if (tool === "delete") {
                    e.stopPropagation();
                    const rooms = { ...plan.rooms };
                    delete rooms[room.id];
                    onPlanChange({ ...plan, rooms });
                  }
                  // wall/door/window/furniture: let event bubble to ground plane
                }}
              >
                <meshStandardMaterial
                  color={room.color ?? "#dbeafe"}
                  opacity={0.72}
                  transparent
                  depthWrite={false}
                  polygonOffset
                  polygonOffsetFactor={-2}
                  polygonOffsetUnits={-2}
                  side={THREE.DoubleSide}
                />
              </mesh>
              {showRoomLabels && (
                <Html position={[centX, yOffset + 0.08, centZ]} center zIndexRange={[10, 0]}>
                  <div className="pointer-events-none select-none text-center" style={{ whiteSpace: "nowrap" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#1e293b", background: "rgba(255,255,255,0.82)", padding: "1px 7px", borderRadius: 5 }}>
                      {room.name}
                    </div>
                    {room.area != null && (
                      <div style={{ fontSize: 9, color: "#64748b", background: "rgba(255,255,255,0.7)", padding: "0 5px", borderRadius: 3, marginTop: 1 }}>
                        {room.area.toFixed(1)} m²
                      </div>
                    )}
                  </div>
                </Html>
              )}
              {selected?.type === "room" && selected.id === room.id && tool === "select" && verts.map((v) => {
                const drag = vertexDrag?.id === v.id ? vertexDrag : null;
                const vx = planToMeters(v.x + (drag?.dx ?? 0));
                const vz = planToMeters(v.y + (drag?.dy ?? 0));
                const color = drag ? "#f59e0b" : "#3b82f6";
                const onDown = (e: ThreeEvent<PointerEvent>) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  const raw = groundPointFromEvent(e);
                  pendingVertexDrag.current = { id: v.id, fromX: raw.x, fromY: raw.y };
                };
                return (
                  <group key={v.id}>
                    {/* floor handle */}
                    <mesh position={[vx, yOffset + 0.04, vz]} onPointerDown={onDown} renderOrder={10}>
                      <boxGeometry args={[0.22, 0.1, 0.22]} />
                      <meshStandardMaterial color={color} depthTest={false} />
                    </mesh>
                    {/* top handle — stick above wall, depthTest off so pillar doesn't occlude it */}
                    <mesh position={[vx, yOffset + wallHeight + 0.3, vz]} onPointerDown={onDown} renderOrder={10}>
                      <boxGeometry args={[0.22, 0.6, 0.22]} />
                      <meshStandardMaterial color={color} depthTest={false} />
                    </mesh>
                  </group>
                );
              })}
            </group>
          );
        })}

        {/* Walls */}
        {visibleWalls.map((wall) => {
          const sv = plan.vertices[wall.startId];
          const ev = plan.vertices[wall.endId];
          if (!sv || !ev) return null;
          const drag = wallDrag && wallDrag.id === wall.id ? wallDrag : null;
          const sx = planToMeters(sv.x + (drag?.dx ?? 0));
          const sy = planToMeters(sv.y + (drag?.dy ?? 0));
          const ex = planToMeters(ev.x + (drag?.dx ?? 0));
          const ey = planToMeters(ev.y + (drag?.dy ?? 0));
          const floorIndex = wall.floor ?? 0;
          const editable = floorIndex === activeFloor;
          const isSelected = selected?.type === "wall" && selected.id === wall.id;
          const isHovered = hoverId === wall.id && (tool === "paint" || tool === "delete" || tool === "select");
          // Apply live opening position during drag
          const rawOpenings = Object.values(plan.openings).filter((o) => o.wallId === wall.id);
          const openings = rawOpenings.map((o) =>
            openingDrag && openingDrag.id === o.id ? { ...o, position: openingDrag.liveT } : o
          );
          const color = isSelected
            ? "#60a5fa"
            : isHovered && editable
            ? tool === "delete"
              ? "#fca5a5"
              : "#bfdbfe"
            : wall.color;
          const selOpeningOnWall = selected?.type === "opening"
            ? plan.openings[selected.id]?.wallId === wall.id ? selected.id : undefined
            : undefined;
          return (
            <group
              key={wall.id}
              position={[0, floorIndex * wallHeight, 0]}
              onPointerMove={editable ? (e) => onWallMove(wall.id, e) : undefined}
              onPointerDown={editable ? (e) => onWallDown(wall.id, e) : undefined}
              onPointerOut={editable ? () => {
                setHoverId((h) => (h === wall.id ? null : h));
                if (!openingDrag) setOpeningDrag(null);
              } : undefined}
            >
              <WallMesh
                sx={sx} sy={sy} ex={ex} ey={ey}
                thickness={wall.thickness}
                height={wallHeight}
                openings={openings}
                color={color}
                selectedOpeningId={selOpeningOnWall}
                onOpeningPointerDown={editable && (tool === "select" || tool === "delete")
                  ? (oid, e) => onOpeningDown(oid, e)
                  : undefined}
              />
            </group>
          );
        })}

        {/* Corner pillar fills */}
        {cornerFills}

        {/* Furniture */}
        {visibleFurniture.map((f) => {
          const drag = furnDrag && furnDrag.id === f.id ? furnDrag : null;
          const item = drag ? { ...f, x: drag.x, y: drag.y } : f;
          const editable = (f.floor ?? 0) === activeFloor;
          const isSelected = selected?.type === "furniture" && selected.id === f.id;
          return (
            <Furniture3D
              key={f.id}
              item={item}
              yOffset={(f.floor ?? 0) * wallHeight}
              highlight={isSelected}
              onPointerDown={editable ? (e) => onFurnitureDown(f, e as ThreeEvent<PointerEvent>) : undefined}
            />
          );
        })}

        {/* Wall selection HUD — Sims-style floating widget */}
        {selected?.type === "wall" && tool === "select" && (() => {
          const wall = plan.walls[selected.id];
          if (!wall) return null;
          const drag = wallDrag?.id === wall.id ? wallDrag : null;
          const sv = plan.vertices[wall.startId];
          const ev = plan.vertices[wall.endId];
          if (!sv || !ev) return null;
          const mx = planToMeters((sv.x + ev.x) / 2 + (drag?.dx ?? 0));
          const mz = planToMeters((sv.y + ev.y) / 2 + (drag?.dy ?? 0));
          const my = (wall.floor ?? 0) * wallHeight + wallHeight + 0.6;
          return (
            <Html key={selected.id} position={[mx, my, mz]} center zIndexRange={[50, 0]}>
              <WallSelectionHUD
                onNudge={(dx, dy) => nudgeWall(selected.id, dx, dy)}
                onCopy={() => copyWall(selected.id)}
                onDelete={deleteSelected}
              />
            </Html>
          );
        })()}

        {/* Opening selection HUD */}
        {selected?.type === "opening" && tool === "select" && (() => {
          const o = plan.openings[selected.id];
          if (!o) return null;
          const w = plan.walls[o.wallId];
          if (!w) return null;
          const sv = plan.vertices[w.startId];
          const ev = plan.vertices[w.endId];
          if (!sv || !ev) return null;
          const liveT = openingDrag?.id === o.id ? openingDrag.liveT : o.position;
          const mx = planToMeters(sv.x + (ev.x - sv.x) * liveT);
          const mz = planToMeters(sv.y + (ev.y - sv.y) * liveT);
          const y0 = o.type === "window" ? 0.9 : 0;
          const my = (w.floor ?? 0) * wallHeight + y0 + o.height + 0.3;
          return (
            <Html key={selected.id} position={[mx, my, mz]} center zIndexRange={[50, 0]}>
              <OpeningSelectionHUD onDelete={deleteSelected} />
            </Html>
          );
        })()}

        {/* Ghost wall while drawing */}
        {ghostWall && (() => {
          const ax = planToMeters(ghostWall.a.x), az = planToMeters(ghostWall.a.y);
          const bx = planToMeters(ghostWall.b.x), bz = planToMeters(ghostWall.b.y);
          const len = Math.hypot(bx - ax, bz - az);
          if (len < 0.05) return null;
          const angle = Math.atan2(bz - az, bx - ax);
          return (
            <mesh
              position={[(ax + bx) / 2, floorY + wallHeight / 2, (az + bz) / 2]}
              rotation={[0, -angle, 0]}
            >
              <boxGeometry args={[len, wallHeight, 0.2]} />
              <meshStandardMaterial color="#3b82f6" transparent opacity={0.4} />
            </mesh>
          );
        })()}

        {/* Wall start marker */}
        {wallStart && tool === "wall" && (
          <mesh position={[planToMeters(wallStart.x), floorY + 0.05, planToMeters(wallStart.y)]}>
            <cylinderGeometry args={[0.12, 0.12, 0.1, 16]} />
            <meshStandardMaterial color="#2563eb" />
          </mesh>
        )}

        {/* Snap cursor for wall tool */}
        {hover && tool === "wall" && !wallStart && (
          <mesh position={[planToMeters(hover.x), floorY + 0.03, planToMeters(hover.y)]}>
            <cylinderGeometry args={[0.1, 0.1, 0.06, 16]} />
            <meshStandardMaterial color="#93c5fd" transparent opacity={0.8} />
          </mesh>
        )}

        {/* Furniture placement ghost */}
        {tool === "furniture" && hover && !furnDrag && (
          <Furniture3D
            item={{ id: "__ghost", kind: furnKind, x: hover.x, y: hover.y, rotation: ghostRot, floor: activeFloor }}
            yOffset={floorY}
            ghost
          />
        )}

        {/* Door/window placement ghost */}
        {openingGhost && (
          <mesh
            position={[openingGhost.x, openingGhost.floor * wallHeight + openingGhost.y0 + openingGhost.heightM / 2, openingGhost.z]}
            rotation={[0, -openingGhost.angle, 0]}
          >
            <boxGeometry args={[openingGhost.widthM, openingGhost.heightM, 0.26]} />
            <meshStandardMaterial color={tool === "door" ? "#f59e0b" : "#38bdf8"} transparent opacity={0.55} />
          </mesh>
        )}
      </Canvas>

      {/* ---------- HTML overlays ---------- */}

      {/* Bottom-center toolbar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
        <div className="text-[11px] text-muted-foreground bg-background/85 px-3 py-1 rounded-full shadow-sm">
          {hint[tool]}
        </div>
        <div className="flex items-center gap-1 bg-background/95 border rounded-xl shadow-lg px-1.5 py-1.5">
          {toolButtons.map((t) => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              title={`${t.label} (${t.key})`}
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                tool === t.id ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
              }`}
            >
              {t.icon}
            </button>
          ))}
        </div>
      </div>

      {/* Furniture catalog panel */}
      {tool === "furniture" && (
        <div className="absolute left-3 top-3 bottom-16 w-48 bg-background/95 border rounded-xl shadow-lg overflow-y-auto p-2">
          {FURNITURE_CATEGORIES.map((cat) => {
            const items = FURNITURE_CATALOG.filter((f) => f.category === cat);
            if (!items.length) return null;
            return (
              <div key={cat} className="mb-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-1 mb-1">{cat}</div>
                <div className="grid grid-cols-2 gap-1">
                  {items.map((f) => (
                    <button
                      key={f.kind}
                      onClick={() => setFurnKind(f.kind)}
                      className={`text-[11px] px-1.5 py-1.5 rounded-md border text-left transition-colors ${
                        furnKind === f.kind
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-transparent hover:bg-muted text-muted-foreground"
                      }`}
                    >
                      {f.label}
                      <span className="block text-[9px] opacity-60">
                        {f.w}×{f.d}m
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <button
            onClick={() => setGhostRot((r) => r + Math.PI / 4)}
            className="w-full mt-1 flex items-center justify-center gap-1.5 text-[11px] px-2 py-1.5 rounded-md border hover:bg-muted text-muted-foreground transition-colors"
          >
            <RotateCw size={12} /> Rotate (R)
          </button>
        </div>
      )}

      {/* Paint palette */}
      {tool === "paint" && (
        <div className="absolute left-3 top-3 bg-background/95 border rounded-xl shadow-lg p-2 w-40">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-1 mb-1.5">Colors</div>
          <div className="grid grid-cols-4 gap-1.5">
            {PAINT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setPaintColor(c)}
                className={`w-7 h-7 rounded-md border-2 transition-transform hover:scale-110 ${
                  paintColor === c ? "border-primary" : "border-black/10"
                }`}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
        </div>
      )}

      {/* Camera help */}
      <div className="absolute bottom-4 right-3 text-[11px] text-muted-foreground bg-background/80 px-2 py-1 rounded">
        WASD/edges pan · Q/E or middle-drag rotate · Scroll zoom · Right-drag pan
      </div>

      <div className="absolute top-3 right-3 flex items-center gap-2">
        <button
          onClick={() => setShowRoomLabels((v) => !v)}
          title="Toggle room labels"
          className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full shadow transition-colors ${
            showRoomLabels ? "bg-primary text-primary-foreground" : "bg-background/90 text-muted-foreground border"
          }`}
        >
          <Tag size={11} /> Labels
        </button>
        <div className="text-[11px] bg-amber-500/90 text-white px-2.5 py-1 rounded-full shadow">
          Build Mode — Floor {activeFloor + 1}
        </div>
      </div>
    </div>
  );
}

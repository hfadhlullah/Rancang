"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Stage, Layer, Line, Rect, Circle, Arc, Group, Text } from "react-konva";
import Konva from "konva";
import { Plan, Opening } from "@/lib/types/plan";
import { DrawingTool } from "@/lib/types/editor";
import {
  Point,
  snapToGrid,
  snapToVertex,
  wallRect,
  snapOrtho,
  distance,
  positionOnWall,
} from "@/lib/canvas/geometry";
import { findClosestWall, recalcRoomAreas, ROOM_COLORS } from "@/lib/canvas/planUtils";
import { nanoid } from "nanoid";

const GRID_PX = 50;
const SNAP_THRESHOLD_PX = 12;
const WALL_SNAP_DIST_PX = 16;

interface Props {
  plan: Plan;
  onPlanChange: (plan: Plan) => void;
  tool: DrawingTool;
  onToolChange: (tool: DrawingTool) => void;
  activeFloor: number;
}

type WallDraft = {
  startVertexId: string;
  startX: number;
  startY: number;
  curX: number;
  curY: number;
  snapVertexId: string | null;
};

type RoomDraft = {
  vertexIds: string[];   // existing vertex IDs clicked so far
  points: { x: number; y: number }[]; // canvas coords for preview
};

type SelectedElement =
  | { type: "vertex"; id: string }
  | { type: "wall"; id: string }
  | { type: "opening"; id: string }
  | { type: "room"; id: string }
  | null;

type WallHighlight = { wallId: string; t: number; projX: number; projY: number } | null;

export function Canvas2D({ plan, onPlanChange, tool, onToolChange, activeFloor }: Props) {
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [cursor, setCursor] = useState<Point>({ x: 0, y: 0 });
  const [wallDraft, setWallDraft] = useState<WallDraft | null>(null);
  const [roomDraft, setRoomDraft] = useState<RoomDraft | null>(null);
  const [selected, setSelected] = useState<SelectedElement>(null);
  const [wallHighlight, setWallHighlight] = useState<WallHighlight>(null);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const vertices = Object.values(plan.vertices).filter((v) => (v.floor ?? 0) === activeFloor);
  const walls = Object.values(plan.walls).filter((w) => (w.floor ?? 0) === activeFloor);
  // Floor-filtered plan snapshot for findClosestWall
  const floorPlan = {
    ...plan,
    vertices: Object.fromEntries(vertices.map((v) => [v.id, v])),
    walls: Object.fromEntries(walls.map((w) => [w.id, w])),
  };

  function stageToCanvas(e: Konva.KonvaEventObject<MouseEvent>): Point {
    const stage = stageRef.current!;
    const pos = stage.getPointerPosition()!;
    const scale = stage.scaleX();
    const offset = stage.position();
    return { x: (pos.x - offset.x) / scale, y: (pos.y - offset.y) / scale };
  }

  function getSnapped(
    rawX: number,
    rawY: number,
    excludeIds: string[] = []
  ): { x: number; y: number; snapVertexId: string | null } {
    const eligible = vertices.filter((v) => !excludeIds.includes(v.id));
    const vSnap = snapToVertex({ x: rawX, y: rawY }, eligible, SNAP_THRESHOLD_PX);
    if (vSnap) return { x: vSnap.point.x, y: vSnap.point.y, snapVertexId: vSnap.vertexId };
    const grid = snapToGrid({ x: rawX, y: rawY }, GRID_PX);
    return { x: grid.x, y: grid.y, snapVertexId: null };
  }

  // ---------- Mouse move ----------
  function handleMouseMove(e: Konva.KonvaEventObject<MouseEvent>) {
    const raw = stageToCanvas(e);
    const shift = (e.evt as MouseEvent).shiftKey;

    if (tool === "wall" && wallDraft) {
      const snapped = getSnapped(raw.x, raw.y, [wallDraft.startVertexId]);
      let pt: Point = snapped;
      if (shift) pt = snapOrtho({ x: wallDraft.startX, y: wallDraft.startY }, snapped);
      setWallDraft((d) => d ? { ...d, curX: pt.x, curY: pt.y, snapVertexId: snapped.snapVertexId } : null);
      setCursor(pt);
      setWallHighlight(null);
    } else if (tool === "door" || tool === "window") {
      const snap = findClosestWall(floorPlan, raw.x, raw.y, WALL_SNAP_DIST_PX);
      setWallHighlight(snap);
      setCursor(raw);
    } else {
      const snapped = getSnapped(raw.x, raw.y);
      setCursor(snapped);
      setWallHighlight(null);
    }
  }

  // ---------- Click ----------
  function handleClick(e: Konva.KonvaEventObject<MouseEvent>) {
    // Only handle clicks on stage background
    const targetName = e.target.name();
    const isBackground = e.target === e.target.getStage() || targetName === "grid-bg";
    if (!isBackground && tool !== "wall" && tool !== "room") return;

    const raw = stageToCanvas(e);
    const shift = (e.evt as MouseEvent).shiftKey;

    if (tool === "wall") handleWallClick(raw, shift, e);
    else if (tool === "door" || tool === "window") handleOpeningClick(raw, tool);
    else if (tool === "room") handleRoomClick(raw);
    else if (tool === "select" && isBackground) setSelected(null);
  }

  // ---- Wall tool ----
  function handleWallClick(
    raw: Point,
    shift: boolean,
    e: Konva.KonvaEventObject<MouseEvent>
  ) {
    const targetName = e.target.name();
    const isBackground = e.target === e.target.getStage() || targetName === "grid-bg";
    if (!isBackground && !wallDraft) return;

    if (!wallDraft) {
      const snapped = getSnapped(raw.x, raw.y);
      const existingId = snapped.snapVertexId;
      const newId = existingId ?? nanoid();
      const newPlan = existingId
        ? plan
        : {
            ...plan,
            vertices: {
              ...plan.vertices,
              [newId]: { id: newId, x: snapped.x, y: snapped.y, floor: activeFloor },
            },
          };
      onPlanChange(newPlan);
      setWallDraft({
        startVertexId: newId,
        startX: snapped.x,
        startY: snapped.y,
        curX: snapped.x,
        curY: snapped.y,
        snapVertexId: null,
      });
      return;
    }

    // Place end vertex
    let pt = getSnapped(raw.x, raw.y, [wallDraft.startVertexId]);
    if (shift) {
      const snappedOrtho = snapOrtho({ x: wallDraft.startX, y: wallDraft.startY }, pt);
      pt = { x: snappedOrtho.x, y: snappedOrtho.y, snapVertexId: null };
    }

    if (distance({ x: wallDraft.startX, y: wallDraft.startY }, pt) < 2) {
      setWallDraft(null);
      return;
    }

    const endId = pt.snapVertexId ?? nanoid();
    const wallId = nanoid();
    const newPlan = { ...plan };
    if (!pt.snapVertexId) {
      newPlan.vertices = {
        ...newPlan.vertices,
        [endId]: { id: endId, x: pt.x, y: pt.y, floor: activeFloor },
      };
    }
    newPlan.walls = {
      ...newPlan.walls,
      [wallId]: { id: wallId, startId: wallDraft.startVertexId, endId, thickness: 0.2, floor: activeFloor },
    };
    onPlanChange(newPlan);
    setWallDraft(null);
  }

  // ---- Opening (door/window) tool ----
  function handleOpeningClick(raw: Point, type: "door" | "window") {
    const snap = findClosestWall(floorPlan, raw.x, raw.y, WALL_SNAP_DIST_PX);
    if (!snap) return;

    const openingId = nanoid();
    const opening: Opening = {
      id: openingId,
      wallId: snap.wallId,
      type,
      position: snap.t,
      width: type === "door" ? 0.9 : 1.2,
      height: type === "door" ? 2.1 : 1.2,
      swingDirection: type === "door" ? "left" : undefined,
      floor: activeFloor,
    };
    onPlanChange({
      ...plan,
      openings: { ...plan.openings, [openingId]: opening },
    });
    onToolChange("select");
  }

  // ---- Room tool ----
  function handleRoomClick(raw: Point) {
    const snapped = getSnapped(raw.x, raw.y);

    if (!roomDraft) {
      // Start room — require snap to existing vertex
      const vId = snapped.snapVertexId ?? nanoid();
      const newPlan = snapped.snapVertexId
        ? plan
        : {
            ...plan,
            vertices: {
              ...plan.vertices,
              [vId]: { id: vId, x: snapped.x, y: snapped.y },
            },
          };
      if (!snapped.snapVertexId) onPlanChange(newPlan);
      setRoomDraft({ vertexIds: [vId], points: [{ x: snapped.x, y: snapped.y }] });
      return;
    }

    // Check close loop (click near first point)
    const first = roomDraft.points[0];
    if (
      roomDraft.vertexIds.length >= 3 &&
      distance({ x: snapped.x, y: snapped.y }, first) < SNAP_THRESHOLD_PX * 2
    ) {
      // Close and create room
      const roomId = nanoid();
      const color = ROOM_COLORS["other"];
      const newRoom = {
        id: roomId,
        name: "Room",
        type: "other" as const,
        vertexIds: roomDraft.vertexIds,
        color,
        floor: activeFloor,
      };
      const newPlan = recalcRoomAreas({
        ...plan,
        rooms: { ...plan.rooms, [roomId]: newRoom },
      });
      onPlanChange(newPlan);
      setRoomDraft(null);
      onToolChange("select");
      return;
    }

    // Add vertex to draft
    const vId = snapped.snapVertexId ?? nanoid();
    let newPlan = plan;
    if (!snapped.snapVertexId) {
      newPlan = {
        ...plan,
        vertices: {
          ...plan.vertices,
          [vId]: { id: vId, x: snapped.x, y: snapped.y, floor: activeFloor },
        },
      };
      onPlanChange(newPlan);
    }
    setRoomDraft((d) =>
      d
        ? {
            vertexIds: [...d.vertexIds, vId],
            points: [...d.points, { x: snapped.x, y: snapped.y }],
          }
        : null
    );
  }

  function handleDblClick() {
    setWallDraft(null);
    setRoomDraft(null);
  }

  // Wheel zoom
  function handleWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const stage = stageRef.current!;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition()!;
    const factor = e.evt.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.2, Math.min(5, oldScale * factor));
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    stage.scale({ x: newScale, y: newScale });
    stage.position({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  }

  // Delete selected element
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        if (selected.type === "wall") {
          const { [selected.id]: _, ...walls } = plan.walls;
          // Also remove openings on this wall
          const openings = Object.fromEntries(
            Object.entries(plan.openings).filter(([, o]) => o.wallId !== selected.id)
          );
          onPlanChange({ ...plan, walls, openings });
        } else if (selected.type === "vertex") {
          // Remove vertex + walls that reference it
          const { [selected.id]: _, ...verts } = plan.vertices;
          const walls = Object.fromEntries(
            Object.entries(plan.walls).filter(
              ([, w]) => w.startId !== selected.id && w.endId !== selected.id
            )
          );
          onPlanChange({ ...plan, vertices: verts, walls });
        } else if (selected.type === "opening") {
          const { [selected.id]: _, ...openings } = plan.openings;
          onPlanChange({ ...plan, openings });
        } else if (selected.type === "room") {
          const { [selected.id]: _, ...rooms } = plan.rooms;
          onPlanChange(recalcRoomAreas({ ...plan, rooms }));
        }
        setSelected(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, plan, onPlanChange]);

  // ---------- Render ----------

  function renderGhostFloor() {
    if (activeFloor === 0) return null;
    const ghostFloor = activeFloor - 1;
    const ghostWalls = Object.values(plan.walls).filter((w) => (w.floor ?? 0) === ghostFloor);
    const ghostRooms = Object.values(plan.rooms).filter((r) => (r.floor ?? 0) === ghostFloor);
    const elems: React.ReactElement[] = [];

    for (const room of ghostRooms) {
      const pts = room.vertexIds
        .map((id) => plan.vertices[id])
        .filter(Boolean)
        .flatMap((v) => [v.x, v.y]);
      if (pts.length < 6) continue;
      elems.push(
        <Line
          key={`ghost-room-${room.id}`}
          closed
          points={pts}
          fill={room.color ?? "#dbeafe"}
          opacity={0.12}
          strokeWidth={0}
          listening={false}
        />
      );
    }

    for (const wall of ghostWalls) {
      const sv = plan.vertices[wall.startId];
      const ev = plan.vertices[wall.endId];
      if (!sv || !ev) continue;
      const thick = wall.thickness * GRID_PX;
      const rect = wallRect(sv.x, sv.y, ev.x, ev.y, thick);
      const pts = rect.flatMap((p) => [p.x, p.y]);
      elems.push(
        <Line
          key={`ghost-wall-${wall.id}`}
          closed
          points={pts}
          fill="#94a3b8"
          opacity={0.2}
          strokeWidth={0}
          listening={false}
        />
      );
    }

    return elems;
  }

  function renderGrid() {
    const EXTENT = 6000;
    const elems: React.ReactElement[] = [];
    for (let x = -EXTENT; x <= EXTENT; x += GRID_PX) {
      elems.push(<Line key={`vg${x}`} points={[x, -EXTENT, x, EXTENT]} stroke="#e5e7eb" strokeWidth={0.5} listening={false} />);
    }
    for (let y = -EXTENT; y <= EXTENT; y += GRID_PX) {
      elems.push(<Line key={`hg${y}`} points={[-EXTENT, y, EXTENT, y]} stroke="#e5e7eb" strokeWidth={0.5} listening={false} />);
    }
    return elems;
  }

  function renderRooms() {
    return Object.values(plan.rooms).filter((r) => (r.floor ?? 0) === activeFloor).map((room) => {
      const pts = room.vertexIds
        .map((id) => plan.vertices[id])
        .filter(Boolean)
        .flatMap((v) => [v.x, v.y]);
      if (pts.length < 6) return null;
      const isSelected = selected?.type === "room" && selected.id === room.id;
      return (
        <Line
          key={room.id}
          closed
          points={pts}
          fill={room.color ?? "#dbeafe"}
          opacity={isSelected ? 0.6 : 0.35}
          stroke={isSelected ? "#3b82f6" : (room.color ?? "#dbeafe")}
          strokeWidth={isSelected ? 2.5 : 0}
          draggable={tool === "select"}
          onClick={(e) => { e.cancelBubble = true; setSelected({ type: "room", id: room.id }); }}
          onMouseEnter={(e) => { if (tool === "select") e.target.getStage()!.container().style.cursor = "move"; }}
          onMouseLeave={(e) => { e.target.getStage()!.container().style.cursor = "default"; }}
          onDragStart={() => setSelected({ type: "room", id: room.id })}
          onDragEnd={(e) => {
            const line = e.target as Konva.Line;
            const dx = line.x();
            const dy = line.y();
            line.position({ x: 0, y: 0 });
            if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
            const newVertices = { ...plan.vertices };
            for (const vId of room.vertexIds) {
              if (newVertices[vId]) {
                newVertices[vId] = { ...newVertices[vId], x: newVertices[vId].x + dx, y: newVertices[vId].y + dy };
              }
            }
            onPlanChange(recalcRoomAreas({ ...plan, vertices: newVertices }));
          }}
        />
      );
    });
  }

  function renderWalls() {
    return walls.map((wall) => {
      const sv = plan.vertices[wall.startId];
      const ev = plan.vertices[wall.endId];
      if (!sv || !ev) return null;
      const thick = wall.thickness * GRID_PX;
      const rect = wallRect(sv.x, sv.y, ev.x, ev.y, thick);
      const pts = rect.flatMap((p) => [p.x, p.y]);
      const isSelected = selected?.type === "wall" && selected.id === wall.id;
      const isHighlighted = wallHighlight?.wallId === wall.id;

      return (
        <Line
          key={wall.id}
          name="wall"
          closed
          points={pts}
          fill={isHighlighted ? "#4b5563" : "#374151"}
          stroke={isSelected ? "#3b82f6" : isHighlighted ? "#60a5fa" : "#1f2937"}
          strokeWidth={isSelected ? 2 : 1}
          onClick={(e) => {
            e.cancelBubble = true;
            if (tool === "door" || tool === "window") {
              handleOpeningClick(stageToCanvas(e), tool);
            } else {
              setSelected({ type: "wall", id: wall.id });
            }
          }}
          onMouseEnter={(e) => {
            e.target.getStage()!.container().style.cursor =
              tool === "door" || tool === "window" ? "crosshair" : "pointer";
          }}
          onMouseLeave={(e) => {
            e.target.getStage()!.container().style.cursor = "default";
          }}
        />
      );
    });
  }

  function renderOpenings() {
    return Object.values(plan.openings)
      .filter((o) => (o.floor ?? 0) === activeFloor)
      .map((opening) => {
      const wall = walls.find((w) => w.id === opening.wallId);
      if (!wall) return null;
      const sv = plan.vertices[wall.startId];
      const ev = plan.vertices[wall.endId];
      if (!sv || !ev) return null;

      const cx = sv.x + (ev.x - sv.x) * opening.position;
      const cy = sv.y + (ev.y - sv.y) * opening.position;
      const halfW = (opening.width * GRID_PX) / 2;
      const thick = wall.thickness * GRID_PX + 2;

      const dx = ev.x - sv.x;
      const dy = ev.y - sv.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const ux = len > 0 ? dx / len : 1;
      const uy = len > 0 ? dy / len : 0;
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);

      const isSelected = selected?.type === "opening" && selected.id === opening.id;

      const wallDx = ev.x - sv.x;
      const wallDy = ev.y - sv.y;
      const wallLen2 = wallDx * wallDx + wallDy * wallDy;

      return (
        <Group
          key={opening.id}
          draggable={tool === "select"}
          onClick={(e) => { e.cancelBubble = true; setSelected({ type: "opening", id: opening.id }); }}
          onMouseEnter={(e) => { if (tool === "select") e.target.getStage()!.container().style.cursor = "grab"; }}
          onMouseLeave={(e) => { e.target.getStage()!.container().style.cursor = "default"; }}
          onDragStart={() => setSelected({ type: "opening", id: opening.id })}
          onDragEnd={(e) => {
            const g = e.target as Konva.Group;
            const newCX = cx + g.x();
            const newCY = cy + g.y();
            g.position({ x: 0, y: 0 });
            if (wallLen2 < 0.001) return;
            const t = ((newCX - sv.x) * wallDx + (newCY - sv.y) * wallDy) / wallLen2;
            const newPos = Math.max(0.05, Math.min(0.95, t));
            onPlanChange({
              ...plan,
              openings: { ...plan.openings, [opening.id]: { ...opening, position: newPos } },
            });
          }}
        >
          {/* Gap (erase wall) */}
          <Line
            points={[
              cx - ux * halfW - uy * thick,
              cy - uy * halfW + ux * thick,
              cx + ux * halfW - uy * thick,
              cy + uy * halfW + ux * thick,
              cx + ux * halfW + uy * thick,
              cy + uy * halfW - ux * thick,
              cx - ux * halfW + uy * thick,
              cy - uy * halfW - ux * thick,
            ]}
            closed
            fill="#f9fafb"
            stroke="#f9fafb"
            strokeWidth={1}
          />
          {/* Opening indicator */}
          {opening.type === "door" ? (
            <>
              <Line
                points={[cx - ux * halfW, cy - uy * halfW, cx + ux * halfW, cy + uy * halfW]}
                stroke={isSelected ? "#3b82f6" : "#374151"}
                strokeWidth={1.5}
                hitStrokeWidth={10}
              />
              <Arc
                x={cx - ux * halfW}
                y={cy - uy * halfW}
                innerRadius={0}
                outerRadius={opening.width * GRID_PX}
                angle={90}
                rotation={angle + (opening.swingDirection === "right" ? -90 : 0)}
                stroke={isSelected ? "#3b82f6" : "#6b7280"}
                strokeWidth={1}
                fill="transparent"
                dash={[3, 3]}
                listening={false}
              />
            </>
          ) : (
            <Line
              points={[cx - ux * halfW, cy - uy * halfW, cx + ux * halfW, cy + uy * halfW]}
              stroke={isSelected ? "#3b82f6" : "#60a5fa"}
              strokeWidth={3}
              hitStrokeWidth={10}
            />
          )}
        </Group>
      );
    });
  }

  function renderVertices() {
    return vertices.map((v) => {
      const isSelected = selected?.type === "vertex" && selected.id === v.id;
      return (
        <Circle
          key={v.id}
          x={v.x}
          y={v.y}
          radius={4}
          fill={isSelected ? "#3b82f6" : "#6b7280"}
          stroke="#fff"
          strokeWidth={1.5}
          onClick={(e) => { e.cancelBubble = true; setSelected({ type: "vertex", id: v.id }); }}
          draggable={tool === "select"}
          onDragEnd={(e) => {
            const snapped = getSnapped(e.target.x(), e.target.y(), [v.id]);
            onPlanChange({
              ...plan,
              vertices: { ...plan.vertices, [v.id]: { ...v, x: snapped.x, y: snapped.y } },
            });
          }}
          onMouseEnter={(e) => {
            e.target.getStage()!.container().style.cursor =
              tool === "select" ? "move" : tool === "wall" || tool === "room" ? "crosshair" : "default";
          }}
          onMouseLeave={(e) => {
            e.target.getStage()!.container().style.cursor = "default";
          }}
        />
      );
    });
  }

  function renderWallDraft() {
    if (!wallDraft) return null;
    return (
      <Line
        points={[wallDraft.startX, wallDraft.startY, wallDraft.curX, wallDraft.curY]}
        stroke="#3b82f6"
        strokeWidth={2}
        dash={[6, 4]}
        listening={false}
      />
    );
  }

  function renderRoomDraft() {
    if (!roomDraft || roomDraft.points.length < 1) return null;
    const pts = [...roomDraft.points, { x: cursor.x, y: cursor.y }];
    const flatPts = pts.flatMap((p) => [p.x, p.y]);
    return (
      <>
        <Line
          points={flatPts}
          stroke="#8b5cf6"
          strokeWidth={1.5}
          dash={[5, 4]}
          listening={false}
        />
        {/* First vertex close indicator */}
        {roomDraft.points.length >= 3 && (
          <Circle
            x={roomDraft.points[0].x}
            y={roomDraft.points[0].y}
            radius={7}
            stroke="#8b5cf6"
            strokeWidth={1.5}
            fill="transparent"
            listening={false}
          />
        )}
      </>
    );
  }

  function renderWallHighlight() {
    if (!wallHighlight) return null;
    return (
      <Circle
        x={wallHighlight.projX}
        y={wallHighlight.projY}
        radius={6}
        fill={tool === "door" ? "#374151" : "#3b82f6"}
        opacity={0.8}
        listening={false}
      />
    );
  }

  function renderCursorDot() {
    if (tool !== "wall" && tool !== "room") return null;
    return (
      <Circle
        x={cursor.x}
        y={cursor.y}
        radius={4}
        fill="transparent"
        stroke={tool === "room" ? "#8b5cf6" : "#3b82f6"}
        strokeWidth={1.5}
        listening={false}
      />
    );
  }

  const hints: Record<DrawingTool, string> = {
    select: "Click to select • Drag vertex • Delete key removes • Scroll to zoom",
    wall: wallDraft
      ? "Click end point • Shift = ortho lock • Dbl-click to cancel"
      : "Click to start wall",
    door: wallHighlight ? "Click to place door" : "Hover over a wall to place a door",
    window: wallHighlight ? "Click to place window" : "Hover over a wall to place a window",
    room:
      roomDraft && roomDraft.points.length >= 3
        ? "Click first vertex to close room • Dbl-click to cancel"
        : roomDraft
        ? "Click next vertex"
        : "Click vertices to define room polygon",
  };

  return (
    <div ref={containerRef} className="relative w-full h-full" style={{ cursor: tool === "wall" || tool === "room" ? "crosshair" : "default" }}>
      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        draggable={tool === "select" && !selected}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onDblClick={handleDblClick}
        onWheel={handleWheel}
        style={{ background: "#f9fafb" }}
      >
        <Layer>
          <Rect
            name="grid-bg"
            x={-10000} y={-10000}
            width={30000} height={30000}
            fill="transparent"
          />
          {renderGrid()}
          {renderGhostFloor()}
          {renderRooms()}
          {renderWalls()}
          {renderOpenings()}
          {renderVertices()}
          {renderWallDraft()}
          {renderRoomDraft()}
          {renderWallHighlight()}
          {renderCursorDot()}
        </Layer>
      </Stage>

      {/* Hint bar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1.5 rounded-full pointer-events-none whitespace-nowrap">
        {hints[tool]}
      </div>

      {/* Selection info */}
      {selected && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-background border rounded-md px-3 py-1.5 text-xs text-muted-foreground shadow-sm pointer-events-none">
          {selected.type === "wall" && `Wall selected — Delete to remove`}
          {selected.type === "vertex" && `Vertex selected — drag to move, Delete to remove`}
          {selected.type === "opening" && (
            <>
              {plan.openings[selected.id]?.type === "door" ? "Door" : "Window"} selected — Delete to remove
            </>
          )}
          {selected.type === "room" && `${plan.rooms[selected.id]?.name ?? "Room"} selected — drag to move, Delete to remove`}
        </div>
      )}
    </div>
  );
}

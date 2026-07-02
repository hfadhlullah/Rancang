/// <reference types="@react-three/fiber" />
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, PointerLockControls, Html } from "@react-three/drei";
import * as THREE from "three";
import { Plan, Opening } from "@/lib/types/plan";
import { Furniture3D } from "./Furniture3D";
import { Footprints, Orbit } from "lucide-react";

const METERS_PER_PX = 1 / 50; // inverse of pixelsPerMeter default
const WINDOW_SILL_HEIGHT = 0.9; // meters, default sill for window openings

export function planToMeters(px: number) {
  return px * METERS_PER_PX;
}

/** Axis-aligned rect in wall-local space: x = along wall length, y = up wall height */
interface Rect { x0: number; x1: number; y0: number; y1: number }

function subtractRect(rects: Rect[], hole: Rect): Rect[] {
  const result: Rect[] = [];
  for (const r of rects) {
    if (hole.x1 <= r.x0 || hole.x0 >= r.x1 || hole.y1 <= r.y0 || hole.y0 >= r.y1) {
      result.push(r);
      continue;
    }
    const hx0 = Math.max(hole.x0, r.x0);
    const hx1 = Math.min(hole.x1, r.x1);
    const hy0 = Math.max(hole.y0, r.y0);
    const hy1 = Math.min(hole.y1, r.y1);
    if (hx0 > r.x0) result.push({ x0: r.x0, x1: hx0, y0: r.y0, y1: r.y1 });
    if (hx1 < r.x1) result.push({ x0: hx1, x1: r.x1, y0: r.y0, y1: r.y1 });
    if (hy0 > r.y0) result.push({ x0: hx0, x1: hx1, y0: r.y0, y1: hy0 });
    if (hy1 < r.y1) result.push({ x0: hx0, x1: hx1, y0: hy1, y1: r.y1 });
  }
  return result;
}

interface WallMeshProps {
  sx: number; sy: number;
  ex: number; ey: number;
  thickness: number;
  height: number;
  openings: Opening[];
  color?: string;
  selectedOpeningId?: string;
  onOpeningPointerDown?: (openingId: string, e: import("@react-three/fiber").ThreeEvent<PointerEvent>) => void;
}

export function WallMesh({ sx, sy, ex, ey, thickness, height, openings, color, selectedOpeningId, onOpeningPointerDown }: WallMeshProps) {
  const dx = ex - sx;
  const dy = ey - sy;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length < 0.01) return null;

  const angle = Math.atan2(dy, dx);
  const cx = (sx + ex) / 2;
  const cy = (sy + ey) / 2;
  const dirX = Math.cos(angle);
  const dirZ = Math.sin(angle);

  // Cut opening holes out of the wall's length x height cross-section
  let rects: Rect[] = [{ x0: 0, x1: length, y0: 0, y1: height }];
  const holes = openings.map((o) => {
    const center = o.position * length;
    const y0 = o.type === "window" ? WINDOW_SILL_HEIGHT : 0;
    const y1 = Math.min(y0 + o.height, height);
    return { x0: center - o.width / 2, x1: center + o.width / 2, y0, y1 };
  });
  for (const hole of holes) rects = subtractRect(rects, hole);

  // Position at local offset `u` (0..length) along wall direction, at vertical center `yc`
  function worldPos(u: number, yc: number): [number, number, number] {
    const delta = u - length / 2;
    return [cx + delta * dirX, yc, cy + delta * dirZ];
  }

  return (
    <>
      {rects
        .filter((r) => r.x1 - r.x0 > 0.01 && r.y1 - r.y0 > 0.01)
        .map((r, i) => {
          const segLen = r.x1 - r.x0;
          const segH = r.y1 - r.y0;
          const uCenter = (r.x0 + r.x1) / 2;
          const yCenter = (r.y0 + r.y1) / 2;
          return (
            <mesh
              key={i}
              position={worldPos(uCenter, yCenter)}
              rotation={[0, -angle, 0]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[segLen, segH, thickness]} />
              <meshStandardMaterial color={color ?? "#d1d5db"} />
            </mesh>
          );
        })}
      {openings.map((o) => {
        const center = o.position * length;
        const y0 = o.type === "window" ? WINDOW_SILL_HEIGHT : 0;
        const yCenter = y0 + o.height / 2;
        const isSelOp = selectedOpeningId === o.id;
        const selColor = "#f59e0b";
        const handler = onOpeningPointerDown
          ? { onPointerDown: (e: import("@react-three/fiber").ThreeEvent<PointerEvent>) => { e.stopPropagation(); onOpeningPointerDown(o.id, e); } }
          : {};
        if (o.type === "window") {
          return (
            <mesh key={o.id} position={worldPos(center, yCenter)} rotation={[0, -angle, 0]} {...handler}>
              <boxGeometry args={[o.width, o.height, Math.max(thickness * 0.3, 0.02)]} />
              <meshStandardMaterial color={isSelOp ? selColor : "#93c5fd"} opacity={isSelOp ? 0.85 : 0.4} transparent />
            </mesh>
          );
        }
        return (
          <mesh key={o.id} position={worldPos(center, yCenter)} rotation={[0, -angle, 0]} {...handler}>
            <boxGeometry args={[o.width * 0.94, o.height * 0.98, Math.max(thickness * 0.25, 0.02)]} />
            <meshStandardMaterial color={isSelOp ? selColor : "#92400e"} />
          </mesh>
        );
      })}
    </>
  );
}

/** Bounding box (in meters) of the drawn plan — floor/camera must follow this,
 * not the fixed canvas metadata, since walls can be drawn anywhere on the grid. */
export function getPlanBounds(plan: Plan) {
  const verts = Object.values(plan.vertices);
  if (verts.length === 0) {
    const w = planToMeters(plan.metadata.width * plan.metadata.pixelsPerMeter);
    const h = planToMeters(plan.metadata.height * plan.metadata.pixelsPerMeter);
    return { minX: 0, minY: 0, maxX: w, maxY: h, width: w, height: h, centerX: w / 2, centerY: h / 2 };
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const v of verts) {
    const x = planToMeters(v.x);
    const y = planToMeters(v.y);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const pad = 1;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  return {
    minX, minY, maxX, maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

function FloorSlabs({ plan, wallHeight, viewFloor }: { plan: Plan; wallHeight: number; viewFloor: number | null }) {
  const totalFloors = plan.metadata.floors ?? 1;
  const slabs = useMemo(() => {
    const result = [];
    for (let f = 0; f < totalFloors; f++) {
      if (viewFloor !== null && f !== viewFloor) continue;
      const floorVerts = Object.values(plan.vertices).filter((v) => (v.floor ?? 0) === f);
      const allVerts = floorVerts.length > 0 ? floorVerts : Object.values(plan.vertices);
      if (allVerts.length === 0) continue;
      let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
      for (const v of allVerts) {
        const x = planToMeters(v.x);
        const z = planToMeters(v.y);
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      }
      const cx = (minX + maxX) / 2;
      const cz = (minZ + maxZ) / 2;
      const w = maxX - minX;
      const d = maxZ - minZ;
      const y = f * wallHeight;
      result.push({ f, cx, cz, w, d, y });
    }
    return result;
  }, [plan, totalFloors, wallHeight, viewFloor]);

  return (
    <>
      {slabs.map(({ f, cx, cz, w, d, y }) => (
        <mesh key={f} rotation={[-Math.PI / 2, 0, 0]} position={[cx, y, cz]} receiveShadow>
          <planeGeometry args={[w, d]} />
          <meshStandardMaterial color={f === 0 ? "#e5e7eb" : "#d1d5db"} side={2} />
        </mesh>
      ))}
    </>
  );
}

function Scene({ plan, viewFloor }: { plan: Plan; viewFloor: number | null }) {
  const ppm = plan.metadata.pixelsPerMeter;
  const wallHeight = plan.metadata.wallHeight;

  const walls = useMemo(() => {
    return Object.values(plan.walls)
      .filter((wall) => viewFloor === null || (wall.floor ?? 0) === viewFloor)
      .map((wall) => {
      const sv = plan.vertices[wall.startId];
      const ev = plan.vertices[wall.endId];
      if (!sv || !ev) return null;

      const sx = planToMeters(sv.x);
      const sy = planToMeters(sv.y);
      const ex = planToMeters(ev.x);
      const ey = planToMeters(ev.y);
      const thickness = wall.thickness;
      const floorIndex = wall.floor ?? 0;
      const yOffset = floorIndex * wallHeight;
      const openings = Object.values(plan.openings).filter((o) => o.wallId === wall.id);

      return (
        <group key={wall.id} position={[0, yOffset, 0]}>
          <WallMesh
            sx={sx} sy={sy}
            ex={ex} ey={ey}
            thickness={thickness}
            height={wallHeight}
            openings={openings}
            color={wall.color}
          />
        </group>
      );
    });
  }, [plan, wallHeight, viewFloor]);

  // Corner pillar fills — box at each vertex where walls meet, closes L/T/X junction gaps
  const cornerFills = useMemo(() => {
    // Track max thickness per vertex per floor so we pick the right pillar size
    const vertexInfo = new Map<string, { x: number; z: number; thickness: number; floor: number; color?: string }>();
    for (const wall of Object.values(plan.walls)) {
      if (viewFloor !== null && (wall.floor ?? 0) !== viewFloor) continue;
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
      <mesh
        key={`cp-${key}`}
        position={[x, floor * wallHeight + wallHeight / 2, z]}
        castShadow
      >
        <boxGeometry args={[thickness, wallHeight, thickness]} />
        <meshStandardMaterial color={color ?? "#d1d5db"} />
      </mesh>
    ));
  }, [plan, wallHeight, viewFloor]);

  const furniture = useMemo(() => {
    return Object.values(plan.furniture ?? {})
      .filter((f) => viewFloor === null || (f.floor ?? 0) === viewFloor)
      .map((f) => (
        <Furniture3D key={f.id} item={f} yOffset={(f.floor ?? 0) * wallHeight} />
      ));
  }, [plan, wallHeight, viewFloor]);

  // Room floor fills + labels
  const rooms = useMemo(() => {
    return Object.values(plan.rooms)
      .filter((room) => viewFloor === null || (room.floor ?? 0) === viewFloor)
      .map((room) => {
      const verts = room.vertexIds.map(id => plan.vertices[id]).filter(Boolean);
      if (verts.length < 3) return null;
      const shape = new THREE.Shape();
      shape.moveTo(planToMeters(verts[0].x), planToMeters(verts[0].y));
      for (let i = 1; i < verts.length; i++) {
        shape.lineTo(planToMeters(verts[i].x), planToMeters(verts[i].y));
      }
      shape.closePath();
      const geometry = new THREE.ShapeGeometry(shape);
      const color = room.color ?? "#dbeafe";
      const floorIndex = room.floor ?? 0;
      const yOffset = floorIndex * wallHeight + 0.008;
      // Centroid for label
      const centX = verts.reduce((s, v) => s + planToMeters(v.x), 0) / verts.length;
      const centZ = verts.reduce((s, v) => s + planToMeters(v.y), 0) / verts.length;
      return (
        <group key={room.id}>
          <mesh
            rotation={[Math.PI / 2, 0, 0]}
            position={[0, yOffset, 0]}
            geometry={geometry}
            renderOrder={1}
          >
            <meshStandardMaterial
              color={color}
              opacity={0.72}
              transparent
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-2}
              polygonOffsetUnits={-2}
              side={THREE.DoubleSide}
            />
          </mesh>
          <Html position={[centX, yOffset + 0.08, centZ]} center zIndexRange={[10, 0]}>
            <div className="pointer-events-none select-none text-center" style={{ whiteSpace: "nowrap" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#1e293b", background: "rgba(255,255,255,0.82)", padding: "1px 7px", borderRadius: 5, letterSpacing: "0.01em" }}>
                {room.name}
              </div>
              {room.area != null && (
                <div style={{ fontSize: 9, color: "#64748b", background: "rgba(255,255,255,0.7)", padding: "0 5px", borderRadius: 3, marginTop: 1 }}>
                  {room.area.toFixed(1)} m²
                </div>
              )}
            </div>
          </Html>
        </group>
      );
    });
  }, [plan, wallHeight, viewFloor]);

  const hasContent = Object.keys(plan.walls).length > 0;

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[10, 15, 10]}
        intensity={0.8}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <FloorSlabs plan={plan} wallHeight={wallHeight} viewFloor={viewFloor} />
      {rooms}
      {walls}
      {cornerFills}
      {furniture}
      <Grid
        args={[50, 50]}
        position={[0, -0.001, 0]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#d1d5db"
        sectionSize={5}
        sectionColor="#9ca3af"
        fadeDistance={40}
        infiniteGrid
      />
      {!hasContent && (
        // Empty state hint
        <group position={[5, 1, 5]}>
          {/* placeholder — no text in R3F without a font */}
        </group>
      )}
    </>
  );
}

const EYE_HEIGHT = 1.6;

/** First-person walk: pointer-lock look + WASD/arrows movement at eye height. */
function WalkControls({ plan, floor, wallHeight }: { plan: Plan; floor: number; wallHeight: number }) {
  const { camera } = useThree();
  const keys = useRef<Set<string>>(new Set());
  const placed = useRef(false);

  useEffect(() => {
    if (!placed.current) {
      const bounds = getPlanBounds(plan);
      camera.position.set(bounds.centerX, floor * wallHeight + EYE_HEIGHT, bounds.centerY);
      placed.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const WALK_KEYS = new Set(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"]);
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const k = e.key.toLowerCase();
      keys.current.add(k);
      // Prevent browser quick-find / scroll. WalkControls only mounts in walk mode,
      // so it's safe to always block these — input fields are guarded above.
      if (WALK_KEYS.has(k)) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useFrame((_, dt) => {
    const k = keys.current;
    const speed = (k.has("shift") ? 4.5 : 2.2) * Math.min(dt, 0.05);
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
    if (k.has("w") || k.has("arrowup")) camera.position.addScaledVector(forward, speed);
    if (k.has("s") || k.has("arrowdown")) camera.position.addScaledVector(forward, -speed);
    if (k.has("a") || k.has("arrowleft")) camera.position.addScaledVector(right, -speed);
    if (k.has("d") || k.has("arrowright")) camera.position.addScaledVector(right, speed);
    camera.position.y = floor * wallHeight + EYE_HEIGHT;
  });

  return <PointerLockControls />;
}

function CameraSetup({ plan }: { plan: Plan }) {
  const { camera } = useThree();
  const bounds = getPlanBounds(plan);
  const maxDim = Math.max(bounds.width, bounds.height, 5);

  // Position camera once on mount
  const initialized = useRef(false);
  useFrame(() => {
    if (!initialized.current) {
      camera.position.set(
        bounds.centerX + maxDim * 0.8,
        maxDim * 0.6,
        bounds.centerY + maxDim * 0.8
      );
      camera.lookAt(bounds.centerX, 0, bounds.centerY);
      initialized.current = true;
    }
  });

  return null;
}

const MINIMAP_SIZE = 200;

function PlanMinimap({ plan, activeFloor }: { plan: Plan; activeFloor: number }) {
  const floorVerts = Object.values(plan.vertices).filter((v) => (v.floor ?? 0) === activeFloor);
  const floorWalls = Object.values(plan.walls).filter((w) => (w.floor ?? 0) === activeFloor);
  const floorRooms = Object.values(plan.rooms).filter((r) => (r.floor ?? 0) === activeFloor);

  if (floorVerts.length === 0 && floorWalls.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const v of floorVerts) {
    minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
  }
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const pad = 10;
  const scale = (MINIMAP_SIZE - pad * 2) / span;
  const offX = pad - minX * scale + ((MINIMAP_SIZE - pad * 2) - (maxX - minX) * scale) / 2;
  const offY = pad - minY * scale + ((MINIMAP_SIZE - pad * 2) - (maxY - minY) * scale) / 2;

  const tx = (x: number) => x * scale + offX;
  const ty = (y: number) => y * scale + offY;

  return (
    <div className="absolute right-3 top-12 bg-white/95 rounded-lg border shadow-md overflow-hidden" style={{ width: MINIMAP_SIZE }}>
      <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground border-b bg-muted/30">
        Floor {activeFloor + 1} — plan
      </div>
      <svg width={MINIMAP_SIZE} height={MINIMAP_SIZE}>
        {floorRooms.map((room) => {
          const pts = room.vertexIds.map((id) => plan.vertices[id]).filter(Boolean);
          if (pts.length < 3) return null;
          const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${tx(p.x).toFixed(1)} ${ty(p.y).toFixed(1)}`).join(" ") + " Z";
          return <path key={room.id} d={d} fill={room.color ?? "#dbeafe"} fillOpacity={0.45} />;
        })}
        {floorWalls.map((wall) => {
          const sv = plan.vertices[wall.startId];
          const ev = plan.vertices[wall.endId];
          if (!sv || !ev) return null;
          const strokeW = Math.max(2, wall.thickness * 50 * scale);
          return (
            <line
              key={wall.id}
              x1={tx(sv.x)} y1={ty(sv.y)}
              x2={tx(ev.x)} y2={ty(ev.y)}
              stroke="#374151"
              strokeWidth={strokeW}
              strokeLinecap="round"
            />
          );
        })}
      </svg>
    </div>
  );
}

export function Viewer3D({ plan, activeFloor, viewFloor }: { plan: Plan; activeFloor: number; viewFloor: number | null }) {
  const hasWalls = Object.keys(plan.walls).length > 0;
  const totalFloors = plan.metadata.floors ?? 1;
  const bounds = getPlanBounds(plan);
  const target: [number, number, number] = [bounds.centerX, 0, bounds.centerY];
  // Minimap shows the selected floor, or activeFloor when viewing all
  const minimapFloor = viewFloor ?? activeFloor;
  const [walkMode, setWalkMode] = useState(false);

  return (
    <div className="w-full h-full relative">
      <Canvas
        shadows
        camera={{ fov: 50, near: 0.1, far: 200 }}
        gl={{ antialias: true }}
      >
        {!walkMode && <CameraSetup plan={plan} />}
        <Scene plan={plan} viewFloor={viewFloor} />
        {walkMode ? (
          <WalkControls plan={plan} floor={minimapFloor} wallHeight={plan.metadata.wallHeight} />
        ) : (
          <OrbitControls
            target={target}
            maxPolarAngle={Math.PI / 2 - 0.05}
            minDistance={1}
            maxDistance={80}
          />
        )}
      </Canvas>

      <button
        onClick={() => setWalkMode((w) => !w)}
        className="absolute top-3 right-3 flex items-center gap-1.5 text-xs bg-background/90 hover:bg-background border rounded-md px-2.5 py-1.5 shadow-sm transition-colors"
        title={walkMode ? "Switch to orbit view" : "Walk around in first person"}
      >
        {walkMode ? <Orbit size={13} /> : <Footprints size={13} />}
        {walkMode ? "Orbit" : "Walk"}
      </button>

      {!hasWalls && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/40 text-white text-sm px-4 py-2 rounded-full">
            Draw walls in 2D view to see 3D extrusion
          </div>
        </div>
      )}

      {totalFloors > 1 && (
        <div className="absolute top-3 left-3 flex items-center gap-1 pointer-events-none">
          <span className="text-[10px] text-white/70 bg-black/30 px-1.5 py-0.5 rounded mr-0.5">
            {viewFloor === null ? "All floors" : `Floor ${viewFloor + 1}`}
          </span>
        </div>
      )}

      <PlanMinimap plan={plan} activeFloor={minimapFloor} />

      <div className="absolute bottom-3 right-3 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
        {walkMode
          ? "Click to look around · WASD move · Shift run · Esc release"
          : "Orbit · Scroll zoom · Right-drag pan"}
      </div>
    </div>
  );
}

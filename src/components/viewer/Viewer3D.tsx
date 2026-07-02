/// <reference types="@react-three/fiber" />
"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import * as THREE from "three";
import { Plan, Opening } from "@/lib/types/plan";

const METERS_PER_PX = 1 / 50; // inverse of pixelsPerMeter default
const WINDOW_SILL_HEIGHT = 0.9; // meters, default sill for window openings

function planToMeters(px: number) {
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
}

function WallMesh({ sx, sy, ex, ey, thickness, height, openings }: WallMeshProps) {
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
              <meshStandardMaterial color="#d1d5db" />
            </mesh>
          );
        })}
      {openings.map((o) => {
        const center = o.position * length;
        const y0 = o.type === "window" ? WINDOW_SILL_HEIGHT : 0;
        const yCenter = y0 + o.height / 2;
        if (o.type === "window") {
          return (
            <mesh key={o.id} position={worldPos(center, yCenter)} rotation={[0, -angle, 0]}>
              <boxGeometry args={[o.width, o.height, Math.max(thickness * 0.3, 0.02)]} />
              <meshStandardMaterial color="#93c5fd" opacity={0.4} transparent />
            </mesh>
          );
        }
        // Door: thin panel filling most of the opening, slightly ajar-looking flat leaf
        return (
          <mesh key={o.id} position={worldPos(center, yCenter)} rotation={[0, -angle, 0]}>
            <boxGeometry args={[o.width * 0.94, o.height * 0.98, Math.max(thickness * 0.25, 0.02)]} />
            <meshStandardMaterial color="#92400e" />
          </mesh>
        );
      })}
    </>
  );
}

/** Bounding box (in meters) of the drawn plan — floor/camera must follow this,
 * not the fixed canvas metadata, since walls can be drawn anywhere on the grid. */
function getPlanBounds(plan: Plan) {
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

function FloorMesh({ plan }: { plan: Plan }) {
  const bounds = getPlanBounds(plan);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[bounds.centerX, 0, bounds.centerY]} receiveShadow>
      <planeGeometry args={[bounds.width, bounds.height]} />
      <meshStandardMaterial color="#f3f4f6" />
    </mesh>
  );
}

function Scene({ plan }: { plan: Plan }) {
  const ppm = plan.metadata.pixelsPerMeter;
  const wallHeight = plan.metadata.wallHeight;

  const walls = useMemo(() => {
    return Object.values(plan.walls).map((wall) => {
      const sv = plan.vertices[wall.startId];
      const ev = plan.vertices[wall.endId];
      if (!sv || !ev) return null;

      const sx = planToMeters(sv.x);
      const sy = planToMeters(sv.y);
      const ex = planToMeters(ev.x);
      const ey = planToMeters(ev.y);
      const thickness = wall.thickness;
      const openings = Object.values(plan.openings).filter((o) => o.wallId === wall.id);

      return (
        <WallMesh
          key={wall.id}
          sx={sx} sy={sy}
          ex={ex} ey={ey}
          thickness={thickness}
          height={wallHeight}
          openings={openings}
        />
      );
    });
  }, [plan]);

  // Room floor fills
  const rooms = useMemo(() => {
    return Object.values(plan.rooms).map((room) => {
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
      return (
        <mesh
          key={room.id}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.01, 0]}
          geometry={geometry}
        >
          <meshStandardMaterial color={color} opacity={0.4} transparent />
        </mesh>
      );
    });
  }, [plan]);

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
      <FloorMesh plan={plan} />
      {rooms}
      {walls}
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

export function Viewer3D({ plan }: { plan: Plan }) {
  const hasWalls = Object.keys(plan.walls).length > 0;
  const bounds = getPlanBounds(plan);
  const target: [number, number, number] = [bounds.centerX, 0, bounds.centerY];

  return (
    <div className="w-full h-full relative">
      <Canvas
        shadows
        camera={{ fov: 50, near: 0.1, far: 200 }}
        gl={{ antialias: true }}
      >
        <CameraSetup plan={plan} />
        <Scene plan={plan} />
        <OrbitControls
          target={target}
          maxPolarAngle={Math.PI / 2 - 0.05}
          minDistance={1}
          maxDistance={80}
        />
      </Canvas>

      {!hasWalls && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/40 text-white text-sm px-4 py-2 rounded-full">
            Draw walls in 2D view to see 3D extrusion
          </div>
        </div>
      )}

      <div className="absolute bottom-3 right-3 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
        Orbit · Scroll zoom · Right-drag pan
      </div>
    </div>
  );
}

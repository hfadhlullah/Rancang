/// <reference types="@react-three/fiber" />
"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, Environment } from "@react-three/drei";
import * as THREE from "three";
import { Plan } from "@/lib/types/plan";

const METERS_PER_PX = 1 / 50; // inverse of pixelsPerMeter default

function planToMeters(px: number) {
  return px * METERS_PER_PX;
}

interface WallMeshProps {
  sx: number; sy: number;
  ex: number; ey: number;
  thickness: number;
  height: number;
}

function WallMesh({ sx, sy, ex, ey, thickness, height }: WallMeshProps) {
  const dx = ex - sx;
  const dy = ey - sy;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length < 0.01) return null;

  const angle = Math.atan2(dy, dx);
  const cx = (sx + ex) / 2;
  const cy = (sy + ey) / 2;

  // THREE.js: Y-up. Plan: x,y -> world: x,z
  // Center wall at height/2 so it sits on y=0
  return (
    <mesh
      position={[cx, height / 2, cy]}
      rotation={[0, -angle, 0]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[length, height, thickness]} />
      <meshStandardMaterial color="#d1d5db" />
    </mesh>
  );
}

function FloorMesh({ plan }: { plan: Plan }) {
  const width = planToMeters(plan.metadata.width * plan.metadata.pixelsPerMeter);
  const depth = planToMeters(plan.metadata.height * plan.metadata.pixelsPerMeter);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[width / 2, 0, depth / 2]} receiveShadow>
      <planeGeometry args={[width, depth]} />
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

      return (
        <WallMesh
          key={wall.id}
          sx={sx} sy={sy}
          ex={ex} ey={ey}
          thickness={thickness}
          height={wallHeight}
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
  const ppm = plan.metadata.pixelsPerMeter;
  const w = planToMeters(plan.metadata.width * ppm);
  const h = planToMeters(plan.metadata.height * ppm);
  const maxDim = Math.max(w, h, 5);

  // Position camera once on mount
  const initialized = useRef(false);
  useFrame(() => {
    if (!initialized.current) {
      camera.position.set(maxDim * 0.8, maxDim * 0.6, maxDim * 0.8);
      camera.lookAt(w / 2, 0, h / 2);
      initialized.current = true;
    }
  });

  return null;
}

export function Viewer3D({ plan }: { plan: Plan }) {
  const hasWalls = Object.keys(plan.walls).length > 0;
  const ppm = plan.metadata.pixelsPerMeter;
  const w = planToMeters(plan.metadata.width * ppm);
  const h = planToMeters(plan.metadata.height * ppm);
  const target: [number, number, number] = [w / 2, 0, h / 2];

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

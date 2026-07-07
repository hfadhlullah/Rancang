/// <reference types="@react-three/fiber" />
"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  EffectComposer,
  Vignette,
  Bloom,
  DepthOfField,
  HueSaturation,
} from "@react-three/postprocessing";
import * as THREE from "three";
import { Plan } from "@/lib/types/plan";
import { Scene } from "@/components/viewer/Viewer3D";
import { allRoomGeometries, RoomGeometry } from "@/lib/cinematic/roomGeometry";
import { Clip, StylePreset, sampleTimeline } from "@/lib/cinematic/styles";

/** Mutable playback clock shared with the parent (imperative to avoid re-renders per frame). */
export interface Playback {
  time: number;
  playing: boolean;
  duration: number;
  /** Called by the parent to react to end-of-timeline (e.g. stop recorder). */
  onEnd?: () => void;
}

interface DirectorProps {
  plan: Plan;
  clips: Clip[];
  style: StylePreset;
  geoms: Map<string, RoomGeometry>;
  playback: React.MutableRefObject<Playback>;
  onTick?: (t: number, activeClip: number) => void;
}

function Director({ plan, clips, style, geoms, playback, onTick }: DirectorProps) {
  const { camera } = useThree();
  const wallHeight = plan.metadata.wallHeight;
  const smoothLook = useRef(new THREE.Vector3());
  const inited = useRef(false);
  const endedFired = useRef(false);

  const floorYOf = (g: RoomGeometry) => g.floor * wallHeight;

  useFrame((_, dt) => {
    const pb = playback.current;
    if (pb.playing) {
      pb.time += Math.min(dt, 0.05);
      if (pb.time >= pb.duration) {
        pb.time = pb.duration;
        if (!endedFired.current) {
          endedFired.current = true;
          pb.onEnd?.();
        }
      } else {
        endedFired.current = false;
      }
    }

    const s = sampleTimeline(pb.time, clips, geoms, style, floorYOf);
    if (!s) return;
    const [px, py, pz] = s.pose.pos;
    const [lx, ly, lz] = s.pose.look;
    camera.position.set(px, py, pz);
    if (!inited.current) {
      smoothLook.current.set(lx, ly, lz);
      inited.current = true;
    } else {
      // Slight smoothing on the look target to avoid jitter at clip seams.
      smoothLook.current.lerp(new THREE.Vector3(lx, ly, lz), 0.35);
    }
    camera.lookAt(smoothLook.current);
    onTick?.(pb.time, s.activeClip);
  });

  return null;
}

function Effects({ style }: { style: StylePreset }) {
  const look = style.look;
  return (
    <EffectComposer>
      {look.dof ? (
        <DepthOfField focusDistance={0.012} focalLength={0.05} bokehScale={3} />
      ) : (
        <></>
      )}
      <Bloom intensity={look.bloom} luminanceThreshold={0.75} mipmapBlur />
      <HueSaturation saturation={look.saturation} />
      <Vignette eskil={false} offset={0.2} darkness={look.vignette} />
    </EffectComposer>
  );
}

interface CinematicStageProps {
  plan: Plan;
  viewFloor: number | null;
  clips: Clip[];
  style: StylePreset;
  playback: React.MutableRefObject<Playback>;
  onCanvas?: (el: HTMLCanvasElement) => void;
  onTick?: (t: number, activeClip: number) => void;
}

export function CinematicStage({ plan, viewFloor, clips, style, playback, onCanvas, onTick }: CinematicStageProps) {
  const geoms = useMemo(() => {
    const m = new Map<string, RoomGeometry>();
    for (const g of allRoomGeometries(plan)) m.set(g.roomId, g);
    return m;
  }, [plan]);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 55, near: 0.05, far: 300 }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = style.look.exposure;
        onCanvas?.(gl.domElement);
      }}
    >
      <color attach="background" args={["#0a0a0f"]} />
      <Scene plan={plan} viewFloor={viewFloor} hideLabels hideGrid />
      <Director plan={plan} clips={clips} style={style} geoms={geoms} playback={playback} onTick={onTick} />
      <Effects style={style} />
    </Canvas>
  );
}

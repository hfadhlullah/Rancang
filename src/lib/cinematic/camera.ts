// Camera motion engine for the cinematic tour. Pure math: given a room's
// geometry, a motion type, and a normalized progress t∈[0,1], produce a camera
// pose (position + lookAt) in scene-meters. No React / Three here — the driver
// component (CinematicCamera) applies these to the actual camera each frame.

import { RoomGeometry, Vec2, dist } from "./roomGeometry";

export type MotionType = "orbit" | "dolly" | "crane" | "keyframe";

export interface Pose {
  pos: [number, number, number];
  look: [number, number, number];
}

const EYE = 1.55; // eye height (m)

/** Smoothstep-ish easing so clips start/stop gently. */
export function easeInOut(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpVec(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/** Pose for a single room clip at eased progress te∈[0,1]. */
export function roomPose(g: RoomGeometry, motion: MotionType, te: number, floorY: number): Pose {
  const c = g.centroid;
  const cy = floorY;
  const look: [number, number, number] = [c.x, cy + EYE * 0.6, c.z];
  const orbitR = Math.max(g.radius * 1.6, 2.2);

  switch (motion) {
    case "orbit": {
      // Sweep ~150° of an arc around the centroid, slightly above eye level.
      const a0 = Math.PI * 0.15;
      const ang = a0 + te * (Math.PI * 0.85);
      return {
        pos: [c.x + Math.cos(ang) * orbitR, cy + EYE + g.radius * 0.35, c.z + Math.sin(ang) * orbitR],
        look,
      };
    }
    case "dolly": {
      // Move from an edge point (entrance if known) toward the centroid at eye height.
      const start = g.entrance ?? edgePoint(g, 0.75);
      const px = lerp(start.x, lerp(start.x, c.x, 0.65), te);
      const pz = lerp(start.z, lerp(start.z, c.z, 0.65), te);
      return { pos: [px, cy + EYE, pz], look };
    }
    case "crane": {
      // Descend from high above the centroid down to eye level, always looking at it.
      const highY = cy + EYE + g.radius * 2.4 + 3;
      const y = lerp(highY, cy + EYE, te);
      const back = lerp(g.radius * 0.2, orbitR * 0.75, te);
      return { pos: [c.x, y, c.z + back], look };
    }
    case "keyframe":
    default:
      // Stub (manual keyframes ship later): static hero framing.
      return { pos: [c.x + orbitR, cy + EYE + g.radius * 0.4, c.z + orbitR], look };
  }
}

/** A point on the room bounds edge at fractional angle f∈[0,1] around centroid. */
function edgePoint(g: RoomGeometry, f: number): Vec2 {
  const ang = f * Math.PI * 2;
  return {
    x: g.centroid.x + Math.cos(ang) * g.radius * 0.85,
    z: g.centroid.z + Math.sin(ang) * g.radius * 0.85,
  };
}

/** Quadratic bezier through a control point — used for continuous flythrough. */
function bezier(a: [number, number, number], ctrl: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  const u = 1 - t;
  return [
    u * u * a[0] + 2 * u * t * ctrl[0] + t * t * b[0],
    u * u * a[1] + 2 * u * t * ctrl[1] + t * t * b[1],
    u * u * a[2] + 2 * u * t * ctrl[2] + t * t * b[2],
  ];
}

/**
 * Transition pose between the end of clip A and the start of clip B.
 * `cut`  → instant jump (returns B's pose; caller should keep duration ~0).
 * `crossfade` → linear pose blend (visual crossfade handled by opacity elsewhere,
 *   here we just ease the camera between the two framings).
 * `flythrough` → camera flies along a bezier that bulges toward the shared door,
 *   giving the continuous "walk between rooms" feel.
 */
export function transitionPose(
  from: Pose,
  to: Pose,
  kind: "cut" | "crossfade" | "flythrough",
  gTo: RoomGeometry | null,
  te: number,
  floorY: number,
): Pose {
  if (kind === "cut") return to;
  if (kind === "crossfade") {
    return { pos: lerpVec(from.pos, to.pos, te), look: lerpVec(from.look, to.look, te) };
  }
  // flythrough: bezier the position through a door-ish waypoint, blend lookAt.
  const door = gTo?.entrance;
  const mid: [number, number, number] = door
    ? [door.x, floorY + EYE, door.z]
    : [(from.pos[0] + to.pos[0]) / 2, floorY + EYE, (from.pos[2] + to.pos[2]) / 2];
  return {
    pos: bezier(from.pos, mid, to.pos, te),
    look: lerpVec(from.look, to.look, te),
  };
}

export { dist };

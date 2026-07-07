// Style presets + timeline model + a pure sampler that maps a global playback
// time to a camera pose. A "style" bundles motion/pacing, visual look,
// transition behaviour, aspect ratio and a bundled music track.

import { RoomGeometry } from "./roomGeometry";
import { MotionType, Pose, roomPose, transitionPose, easeInOut } from "./camera";

export type AspectId = "9:16" | "1:1" | "16:9";
export type TransitionKind = "cut" | "crossfade" | "flythrough";

export interface VisualLook {
  vignette: number;   // 0..1 darkness
  bloom: number;      // 0..~1 intensity
  dof: boolean;       // depth of field
  exposure: number;   // tone-mapping exposure multiplier
  saturation: number; // -1..1 (0 = neutral)
}

export interface StylePreset {
  id: string;
  name: string;
  description: string;
  defaultMotion: MotionType;
  secPerRoom: number;
  transition: TransitionKind;
  transitionSec: number;
  aspect: AspectId;
  look: VisualLook;
  musicTrackId: string | null;
}

export const ASPECT_DIMS: Record<AspectId, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "16:9": { w: 1920, h: 1080 },
};

export const STYLES: StylePreset[] = [
  {
    id: "fast-reel",
    name: "Fast Reel",
    description: "Snappy orbits, hard cuts, upbeat. Made for Shorts/Reels.",
    defaultMotion: "orbit",
    secPerRoom: 2.2,
    transition: "cut",
    transitionSec: 0,
    aspect: "9:16",
    look: { vignette: 0.25, bloom: 0.25, dof: false, exposure: 1.05, saturation: 0.15 },
    musicTrackId: "upbeat",
  },
  {
    id: "cinematic-slow",
    name: "Cinematic Slow",
    description: "Slow dolly + crane, continuous fly-through, shallow depth of field.",
    defaultMotion: "dolly",
    secPerRoom: 4.5,
    transition: "flythrough",
    transitionSec: 1.4,
    aspect: "16:9",
    look: { vignette: 0.45, bloom: 0.4, dof: true, exposure: 1.0, saturation: -0.05 },
    musicTrackId: "ambient",
  },
  {
    id: "showcase",
    name: "Showcase",
    description: "Crane reveals with crossfades. Balanced pacing, square format.",
    defaultMotion: "crane",
    secPerRoom: 3.2,
    transition: "crossfade",
    transitionSec: 0.7,
    aspect: "1:1",
    look: { vignette: 0.35, bloom: 0.35, dof: true, exposure: 1.02, saturation: 0.05 },
    musicTrackId: "chill",
  },
];

export function styleById(id: string): StylePreset {
  return STYLES.find((s) => s.id === id) ?? STYLES[0];
}

export interface Clip {
  id: string;
  roomId: string;
  motion: MotionType;
  durationSec: number;
}

/** Build one clip per room in the given order, seeded from the style. */
export function buildClips(roomIds: string[], style: StylePreset): Clip[] {
  return roomIds.map((roomId, i) => ({
    id: `clip-${i}-${roomId}`,
    roomId,
    motion: style.defaultMotion,
    durationSec: style.secPerRoom,
  }));
}

export interface SampleResult {
  pose: Pose;
  activeClip: number;   // index of the clip currently on screen
  inTransition: boolean;
  fade: number;         // 0..1 crossfade opacity of the *incoming* clip (crossfade only)
}

/** Total timeline duration including transitions. */
export function totalDuration(clips: Clip[], style: StylePreset): number {
  if (clips.length === 0) return 0;
  const clipsSum = clips.reduce((s, c) => s + c.durationSec, 0);
  const transSum = Math.max(0, clips.length - 1) * style.transitionSec;
  return clipsSum + transSum;
}

/**
 * Sample the whole timeline at global time `t` (seconds).
 * Layout: clip0 [trans] clip1 [trans] clip2 ...
 */
export function sampleTimeline(
  t: number,
  clips: Clip[],
  geoms: Map<string, RoomGeometry>,
  style: StylePreset,
  floorYOf: (g: RoomGeometry) => number,
): SampleResult | null {
  if (clips.length === 0) return null;

  // Build segment boundaries lazily.
  let cursor = 0;
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const g = geoms.get(clip.roomId);
    if (!g) continue;
    const fy = floorYOf(g);

    // Clip segment.
    if (t <= cursor + clip.durationSec || i === clips.length - 1) {
      const local = clip.durationSec > 0 ? Math.min(1, Math.max(0, (t - cursor) / clip.durationSec)) : 1;
      return {
        pose: roomPose(g, clip.motion, easeInOut(local), fy),
        activeClip: i,
        inTransition: false,
        fade: 1,
      };
    }
    cursor += clip.durationSec;

    // Transition segment into clip i+1.
    const next = clips[i + 1];
    const gNext = next ? geoms.get(next.roomId) : null;
    if (next && gNext && style.transitionSec > 0) {
      if (t <= cursor + style.transitionSec) {
        const local = Math.min(1, Math.max(0, (t - cursor) / style.transitionSec));
        const fromPose = roomPose(g, clip.motion, easeInOut(1), fy);
        const toPose = roomPose(gNext, next.motion, easeInOut(0), floorYOf(gNext));
        return {
          pose: transitionPose(fromPose, toPose, style.transition, gNext, easeInOut(local), fy),
          activeClip: i,
          inTransition: true,
          fade: style.transition === "crossfade" ? local : 1,
        };
      }
      cursor += style.transitionSec;
    }
  }

  // Past the end — hold last clip's final frame.
  const last = clips[clips.length - 1];
  const g = geoms.get(last.roomId);
  if (!g) return null;
  return {
    pose: roomPose(g, last.motion, 1, floorYOf(g)),
    activeClip: clips.length - 1,
    inTransition: false,
    fade: 1,
  };
}

export interface MusicTrack {
  id: string;
  name: string;
  /** Path under /public. Files must be added by the project (royalty-free). */
  src: string;
}

// Bundled music manifest. Drop matching mp3s into public/music/.
export const MUSIC_TRACKS: MusicTrack[] = [
  { id: "upbeat", name: "Upbeat", src: "/music/upbeat.mp3" },
  { id: "ambient", name: "Ambient", src: "/music/ambient.mp3" },
  { id: "chill", name: "Chill", src: "/music/chill.mp3" },
];

export function trackById(id: string | null): MusicTrack | null {
  if (!id) return null;
  return MUSIC_TRACKS.find((m) => m.id === id) ?? null;
}

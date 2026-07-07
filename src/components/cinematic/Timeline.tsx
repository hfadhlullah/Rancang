"use client";

import { useRef } from "react";
import { GripVertical, Orbit, Footprints, ArrowDownToLine, KeyRound } from "lucide-react";
import { Clip } from "@/lib/cinematic/styles";
import { MotionType } from "@/lib/cinematic/camera";
import { RoomGeometry } from "@/lib/cinematic/roomGeometry";

const MOTION_META: Record<MotionType, { label: string; icon: typeof Orbit; disabled?: boolean }> = {
  orbit: { label: "Orbit", icon: Orbit },
  dolly: { label: "Dolly", icon: Footprints },
  crane: { label: "Crane", icon: ArrowDownToLine },
  keyframe: { label: "Manual (soon)", icon: KeyRound, disabled: true },
};

const PX_PER_SEC = 44;

interface TimelineProps {
  clips: Clip[];
  geoms: Map<string, RoomGeometry>;
  time: number;
  duration: number;
  activeClip: number;
  transitionSec: number;
  onReorder: (from: number, to: number) => void;
  onDuration: (clipId: string, sec: number) => void;
  onMotion: (clipId: string, motion: MotionType) => void;
  onScrub: (t: number) => void;
}

export function Timeline({
  clips, geoms, time, duration, activeClip, transitionSec,
  onReorder, onDuration, onMotion, onScrub,
}: TimelineProps) {
  const dragFrom = useRef<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const playheadPct = duration > 0 ? (time / duration) * 100 : 0;

  const scrubAt = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onScrub(frac * duration);
  };

  return (
    <div className="border-t border-white/10 bg-black/40 backdrop-blur px-3 py-2 select-none">
      {/* Scrub ruler */}
      <div
        ref={trackRef}
        className="relative h-4 mb-1 cursor-pointer"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); scrubAt(e.clientX); }}
        onPointerMove={(e) => { if (e.buttons === 1) scrubAt(e.clientX); }}
      >
        <div className="absolute inset-x-0 top-1/2 h-px bg-white/20" />
        <div className="absolute top-0 bottom-0 w-0.5 bg-amber-400" style={{ left: `${playheadPct}%` }} />
      </div>

      {/* Clip blocks */}
      <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
        {clips.map((clip, i) => {
          const g = geoms.get(clip.roomId);
          const width = Math.max(72, clip.durationSec * PX_PER_SEC);
          const Motion = MOTION_META[clip.motion].icon;
          const isActive = i === activeClip;
          return (
            <div key={clip.id} className="flex items-stretch gap-1 shrink-0">
              <div
                draggable
                onDragStart={() => { dragFrom.current = i; }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragFrom.current !== null) { onReorder(dragFrom.current, i); dragFrom.current = null; } }}
                className={`group relative rounded-md border px-2 py-1.5 flex flex-col justify-between transition-colors ${
                  isActive ? "border-amber-400 bg-amber-400/10" : "border-white/15 bg-white/5 hover:bg-white/10"
                }`}
                style={{ width }}
              >
                <div className="flex items-center gap-1 text-[11px] font-medium text-white/90 truncate">
                  <GripVertical size={11} className="text-white/30 shrink-0 cursor-grab" />
                  <span className="truncate">{g?.name ?? "Room"}</span>
                </div>

                {/* Motion cycle button */}
                <button
                  onClick={() => {
                    const order: MotionType[] = ["orbit", "dolly", "crane"];
                    const idx = order.indexOf(clip.motion);
                    onMotion(clip.id, order[(idx + 1) % order.length]);
                  }}
                  className="flex items-center gap-1 text-[10px] text-white/60 hover:text-white"
                  title="Cycle camera motion"
                >
                  <Motion size={11} /> {MOTION_META[clip.motion].label}
                </button>

                {/* Duration stepper */}
                <div className="flex items-center justify-between text-[10px] text-white/50">
                  <button className="px-1 hover:text-white" onClick={() => onDuration(clip.id, Math.max(1, clip.durationSec - 0.5))}>−</button>
                  <span>{clip.durationSec.toFixed(1)}s</span>
                  <button className="px-1 hover:text-white" onClick={() => onDuration(clip.id, Math.min(12, clip.durationSec + 0.5))}>+</button>
                </div>
              </div>

              {/* Transition marker between clips */}
              {i < clips.length - 1 && transitionSec > 0 && (
                <div className="w-3 self-center text-white/25 text-center text-[9px]" title={`Transition ${transitionSec}s`}>
                  ⇢
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

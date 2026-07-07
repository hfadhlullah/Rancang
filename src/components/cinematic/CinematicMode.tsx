"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import { ArrowLeft, Play, Pause, Download, Loader2, Clapperboard, Music } from "lucide-react";
import { Plan } from "@/lib/types/plan";
import { allRoomGeometries, RoomGeometry } from "@/lib/cinematic/roomGeometry";
import {
  STYLES, styleById, buildClips, totalDuration, Clip,
  ASPECT_DIMS, MUSIC_TRACKS, trackById,
} from "@/lib/cinematic/styles";
import { MotionType } from "@/lib/cinematic/camera";
import { Playback } from "./CinematicStage";
import { Timeline } from "./Timeline";
import { startRecording, downloadBlob, RecorderHandle } from "@/lib/cinematic/recorder";

const CinematicStage = dynamic(
  () => import("./CinematicStage").then((m) => ({ default: m.CinematicStage })),
  { ssr: false },
);

export function CinematicMode({ projectId }: { projectId: string }) {
  const router = useRouter();
  const project = useQuery(api.projects.get, { id: projectId as Id<"projects"> });

  const [plan, setPlan] = useState<Plan | null>(null);
  const [styleId, setStyleId] = useState(STYLES[0].id);
  const [musicId, setMusicId] = useState<string | null>(STYLES[0].musicTrackId);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [uiTime, setUiTime] = useState(0);
  const [uiActive, setUiActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);

  const style = styleById(styleId);
  const playback = useRef<Playback>({ time: 0, playing: false, duration: 0 });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recorderRef = useRef<RecorderHandle | null>(null);
  const lastUi = useRef(0);

  // Load plan once.
  useEffect(() => {
    if (project?.planJson && !plan) {
      setPlan(JSON.parse(project.planJson) as Plan);
    }
  }, [project, plan]);

  const geoms = useMemo(() => {
    const m = new Map<string, RoomGeometry>();
    if (plan) for (const g of allRoomGeometries(plan)) m.set(g.roomId, g);
    return m;
  }, [plan]);

  const roomList = useMemo(() => (plan ? allRoomGeometries(plan) : []), [plan]);

  // Default-select all rooms once loaded.
  useEffect(() => {
    if (roomList.length && selectedIds.length === 0) {
      setSelectedIds(roomList.map((r) => r.roomId));
    }
  }, [roomList, selectedIds.length]);

  // Rebuild clips when selection or style pacing changes (reseeds motion/duration).
  useEffect(() => {
    setClips(buildClips(selectedIds, style));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, styleId]);

  // Sync music default when style changes.
  useEffect(() => { setMusicId(style.musicTrackId); }, [style.musicTrackId]);

  const duration = useMemo(() => totalDuration(clips, style), [clips, style]);
  useEffect(() => { playback.current.duration = duration; }, [duration]);

  // Determine which single floor to render (rooms may span floors; use the
  // active clip's floor, else null = all).
  const viewFloor = useMemo(() => {
    const g = clips[uiActive] ? geoms.get(clips[uiActive].roomId) : null;
    return g ? g.floor : null;
  }, [clips, uiActive, geoms]);

  const onTick = (t: number, active: number) => {
    if (Math.abs(t - lastUi.current) > 0.05 || active !== uiActive) {
      lastUi.current = t;
      setUiTime(t);
      setUiActive(active);
    }
  };

  const setPlay = (p: boolean) => {
    playback.current.playing = p;
    setPlaying(p);
    const audio = audioRef.current;
    if (audio) {
      if (p) audio.play().catch(() => {});
      else audio.pause();
    }
  };

  const scrub = (t: number) => {
    playback.current.time = t;
    setUiTime(t);
    const audio = audioRef.current;
    if (audio) audio.currentTime = Math.min(t, audio.duration || t);
  };

  const restart = () => {
    playback.current.time = 0;
    setUiTime(0);
    if (audioRef.current) audioRef.current.currentTime = 0;
  };

  const togglePlay = () => {
    if (playback.current.time >= duration - 0.01) restart();
    setPlay(!playing);
  };

  const exportVideo = async () => {
    const canvas = canvasRef.current;
    if (!canvas || exporting || clips.length === 0) return;
    setExporting(true);
    restart();
    const audio = musicId ? audioRef.current : null;
    if (audio) { audio.currentTime = 0; audio.play().catch(() => {}); }

    recorderRef.current = startRecording(canvas, 30, audio);
    playback.current.onEnd = async () => {
      const handle = recorderRef.current;
      playback.current.onEnd = undefined;
      setPlay(false);
      if (audio) audio.pause();
      if (handle) {
        const blob = await handle.stop();
        downloadBlob(blob, `tour-${style.id}-${Date.now()}.webm`);
      }
      recorderRef.current = null;
      setExporting(false);
    };
    setPlay(true);
  };

  const toggleRoom = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const reorderClip = (from: number, to: number) => {
    setClips((prev) => {
      const next = [...prev];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
  };
  const setClipDuration = (id: string, sec: number) =>
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, durationSec: sec } : c)));
  const setClipMotion = (id: string, motion: MotionType) =>
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, motion } : c)));

  const aspect = ASPECT_DIMS[style.aspect];
  const track = trackById(musicId);

  if (!plan) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0a0a0f] text-white/60">
        <Loader2 className="animate-spin mr-2" size={18} /> Loading plan…
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0f] text-white overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-white/10">
        <button onClick={() => router.push(`/projects/${projectId}`)} className="flex items-center gap-1 text-sm text-white/70 hover:text-white">
          <ArrowLeft size={16} /> Editor
        </button>
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <Clapperboard size={16} className="text-amber-400" /> Cinematic Tour
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={exportVideo}
            disabled={exporting || clips.length === 0}
            className="flex items-center gap-1.5 text-sm bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-medium rounded-md px-3 py-1.5"
          >
            {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            {exporting ? "Recording…" : "Export WebM"}
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Left panel: rooms + style */}
        <div className="w-64 border-r border-white/10 flex flex-col overflow-y-auto shrink-0">
          <div className="p-3 border-b border-white/10">
            <div className="text-xs font-semibold text-white/50 uppercase mb-2">Style</div>
            <div className="space-y-1.5">
              {STYLES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStyleId(s.id)}
                  className={`w-full text-left rounded-md border px-2.5 py-2 transition-colors ${
                    s.id === styleId ? "border-amber-400 bg-amber-400/10" : "border-white/10 hover:bg-white/5"
                  }`}
                >
                  <div className="text-sm font-medium">{s.name}</div>
                  <div className="text-[11px] text-white/50 leading-tight mt-0.5">{s.description}</div>
                  <div className="text-[10px] text-white/40 mt-1">{s.aspect} · {s.transition}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="p-3 border-b border-white/10">
            <div className="text-xs font-semibold text-white/50 uppercase mb-2 flex items-center gap-1">
              <Music size={12} /> Music
            </div>
            <select
              value={musicId ?? ""}
              onChange={(e) => setMusicId(e.target.value || null)}
              className="w-full bg-white/5 border border-white/10 rounded-md text-sm px-2 py-1.5"
            >
              <option value="">None</option>
              {MUSIC_TRACKS.map((m) => (
                <option key={m.id} value={m.id} className="bg-[#111]">{m.name}</option>
              ))}
            </select>
            <p className="text-[10px] text-white/30 mt-1">Add mp3s to /public/music/ to enable.</p>
          </div>

          <div className="p-3">
            <div className="text-xs font-semibold text-white/50 uppercase mb-2">
              Rooms ({selectedIds.length}/{roomList.length})
            </div>
            <div className="space-y-1">
              {roomList.map((r) => (
                <label key={r.roomId} className="flex items-center gap-2 text-sm py-1 cursor-pointer hover:text-amber-300">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(r.roomId)}
                    onChange={() => toggleRoom(r.roomId)}
                    className="accent-amber-400"
                  />
                  <span className="truncate">{r.name}</span>
                  <span className="ml-auto text-[10px] text-white/30">{r.area.toFixed(0)}m²</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Stage */}
        <div className="flex-1 flex items-center justify-center bg-black min-h-0 p-4">
          <div
            className="relative bg-[#0a0a0f] shadow-2xl"
            style={{ aspectRatio: `${aspect.w} / ${aspect.h}`, maxHeight: "100%", maxWidth: "100%", height: aspect.h >= aspect.w ? "100%" : undefined, width: aspect.w > aspect.h ? "100%" : undefined }}
          >
            {clips.length > 0 ? (
              <CinematicStage
                plan={plan}
                viewFloor={viewFloor}
                clips={clips}
                style={style}
                playback={playback}
                onCanvas={(el) => { canvasRef.current = el; }}
                onTick={onTick}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-white/40 text-sm">
                Select at least one room
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Transport + timeline */}
      <div className="shrink-0">
        <div className="flex items-center gap-3 px-4 py-2 border-t border-white/10">
          <button onClick={togglePlay} disabled={clips.length === 0} className="flex items-center justify-center w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30">
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <div className="text-xs tabular-nums text-white/60">
            {uiTime.toFixed(1)}s / {duration.toFixed(1)}s
          </div>
          <div className="text-[11px] text-white/40 ml-auto">
            {ASPECT_DIMS[style.aspect].w}×{ASPECT_DIMS[style.aspect].h} · 30fps · WebM
          </div>
        </div>
        <Timeline
          clips={clips}
          geoms={geoms}
          time={uiTime}
          duration={duration}
          activeClip={uiActive}
          transitionSec={style.transitionSec}
          onReorder={reorderClip}
          onDuration={setClipDuration}
          onMotion={setClipMotion}
          onScrub={scrub}
        />
      </div>

      {track && (
        <audio ref={audioRef} src={track.src} loop preload="auto" crossOrigin="anonymous" />
      )}
    </div>
  );
}

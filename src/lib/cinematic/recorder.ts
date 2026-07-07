// WebM recorder: captures the R3F canvas via captureStream + MediaRecorder,
// optionally muxing a bundled music track. Client-only.

export interface RecorderHandle {
  stop: () => Promise<Blob>;
  cancel: () => void;
}

function pickMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "video/webm";
}

/**
 * Start recording `canvas`. If `audioEl` is provided and playing, its audio is
 * captured into the same stream. Returns a handle; call stop() to get the Blob.
 */
export function startRecording(
  canvas: HTMLCanvasElement,
  fps: number,
  audioEl?: HTMLAudioElement | null,
): RecorderHandle {
  const stream = canvas.captureStream(fps);

  let audioCtx: AudioContext | null = null;
  if (audioEl) {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new AC();
      const source = audioCtx.createMediaElementSource(audioEl);
      const dest = audioCtx.createMediaStreamDestination();
      source.connect(dest);
      source.connect(audioCtx.destination); // keep it audible in preview too
      for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);
    } catch {
      // MediaElementSource can only wrap an element once; ignore on failure.
    }
  }

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.start(100);

  const cleanup = () => {
    stream.getTracks().forEach((t) => t.stop());
    if (audioCtx) audioCtx.close().catch(() => {});
  };

  return {
    stop: () =>
      new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          cleanup();
          resolve(new Blob(chunks, { type: mimeType }));
        };
        recorder.stop();
      }),
    cancel: () => {
      try { recorder.stop(); } catch { /* already stopped */ }
      cleanup();
    },
  };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

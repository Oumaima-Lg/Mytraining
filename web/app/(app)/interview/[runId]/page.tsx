"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, uploadBlob, Interview, Question } from "@/lib/api";

type RunData = {
  interview: Interview;
  questions: Question[];
};

// Privacy filters applied to the self-view preview only (never the recording).
type CamMode = "net" | "grid" | "pixel" | "silhouette" | "blur";
const CAM_MODES: { id: CamMode; label: string }[] = [
  { id: "net", label: "Net" },
  { id: "grid", label: "Grille" },
  { id: "pixel", label: "Pixel" },
  { id: "silhouette", label: "Silhouette" },
  { id: "blur", label: "Flou" },
];

export default function RunPage({ params }: { params: { runId: string } }) {
  const runId = params.runId;
  const router = useRouter();

  const [data, setData] = useState<RunData | null>(null);
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [camMode, setCamMode] = useState<CamMode>("net");
  const [advancing, setAdvancing] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Load run config.
  useEffect(() => {
    api
      .get<{ run: RunData }>(`interviews/runs/${runId}`)
      .then((d) => {
        setData({ interview: d.run.interview, questions: d.run.questions });
        setRemaining(d.run.interview.per_question_time_sec || 0);
      });
  }, [runId]);

  // Set up camera / mic once.
  useEffect(() => {
    if (!data) return;
    const { record_audio, record_video, show_camera } = data.interview;
    const wantVideo = record_video || show_camera;
    const wantAudio = record_audio || record_video;
    if (!wantVideo && !wantAudio) return;

    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: wantVideo, audio: wantAudio })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current && show_camera) {
          videoRef.current.srcObject = stream;
        }
        startRecorder();
      })
      .catch(() => {
        /* user denied — proceed without media */
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function startRecorder() {
    const stream = streamRef.current;
    if (!stream || !data) return;
    if (!data.interview.record_audio && !data.interview.record_video) return;
    chunksRef.current = [];
    const rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.start();
    recorderRef.current = rec;
  }

  // Stop the recorder and resolve with the recorded blob.
  function stopRecorder(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const rec = recorderRef.current;
      if (!rec || rec.state === "inactive") {
        resolve(null);
        return;
      }
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        resolve(blob.size > 0 ? blob : null);
      };
      rec.stop();
    });
  }

  const question = data?.questions[index];

  // Abandon the interview early: stop recording/camera, finish the run,
  // and jump to the results — no need to wait for the timer to run out.
  const quit = useCallback(async () => {
    if (advancing) return;
    if (!window.confirm("Quitter l'entretien maintenant ? Il sera terminé et vous verrez les résultats.")) {
      return;
    }
    setAdvancing(true);
    await stopRecorder();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    try {
      await api.post(`interviews/runs/${runId}/finish`);
    } catch {
      /* end the run locally even if the request fails */
    }
    router.push(`/interview/${runId}/results`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advancing, runId, router]);

  const next = useCallback(async () => {
    if (!data || advancing) return;
    setAdvancing(true);
    const q = data.questions[index];

    // Finalize this question's recording.
    const blob = await stopRecorder();
    try {
      let key: string | null = null;
      if (blob) {
        const uploaded = await uploadBlob(blob, `run${runId}-q${q.id}.webm`);
        key = uploaded.key;
      }
      await api.post(`interviews/runs/${runId}/recordings`, {
        question_id: q.id,
        minio_key: key,
        media_type: data.interview.record_video ? "video" : "audio",
      });
    } catch {
      /* keep going even if upload fails */
    }

    if (index + 1 >= data.questions.length) {
      await api.post(`interviews/runs/${runId}/finish`);
      router.push(`/interview/${runId}/results`);
      return;
    }

    setIndex((i) => i + 1);
    setRemaining(data.interview.per_question_time_sec || 0);
    startRecorder();
    setAdvancing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, index, advancing, runId, router]);

  // Per-question countdown.
  useEffect(() => {
    if (!data || !data.interview.per_question_time_sec) return;
    if (remaining <= 0) {
      next();
      return;
    }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining, data, next]);

  // Pixelation ("Pixel" mode): sample the live video into a tiny canvas and
  // scale it back up with smoothing off → blocky mosaic. Preview only.
  useEffect(() => {
    if (camMode !== "pixel") return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!video || !canvas || !ctx) return;

    let raf = 0;
    const render = () => {
      if (video.videoWidth && video.videoHeight) {
        if (canvas.width !== canvas.clientWidth) canvas.width = canvas.clientWidth;
        if (canvas.height !== canvas.clientHeight) canvas.height = canvas.clientHeight;
        const blocks = 24; // horizontal block count → blockiness
        const smallH = Math.max(
          1,
          Math.round(blocks * (canvas.height / canvas.width || 0.75)),
        );
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(video, 0, 0, blocks, smallH);
        ctx.drawImage(canvas, 0, 0, blocks, smallH, 0, 0, canvas.width, canvas.height);
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [camMode]);

  if (!data || !question) {
    return <p className="text-gray-400 dark:text-slate-500">Chargement de l&apos;entretien…</p>;
  }

  return (
    <div className="flex min-h-[calc(100vh-7rem)] flex-col gap-3">
      {/* Sticky top bar: module names, timer, and question-time progress bar */}
      <div className="card sticky top-2 z-20 space-y-2 p-3 shadow-md">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-wrap gap-1.5">
            {data.interview.modules?.map((m) => (
              <span
                key={m.id}
                className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs text-brand"
              >
                {m.name}
              </span>
            ))}
          </div>
          <div className="flex items-baseline gap-2 text-right">
            <div
              className={`text-xl font-bold tabular-nums ${timeColor(
                remaining,
                data.interview.per_question_time_sec,
              )}`}
            >
              {formatTime(remaining)}
            </div>
            <div className="text-xs text-gray-400 dark:text-slate-500">
              {index + 1} / {data.questions.length}
            </div>
          </div>
        </div>

        {data.interview.per_question_time_sec > 0 && (
          <div className="space-y-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div
                className={`h-full rounded-full transition-all duration-1000 ease-linear ${barColor(
                  remaining,
                  data.interview.per_question_time_sec,
                )}`}
                style={{
                  width: `${Math.min(
                    100,
                    ((data.interview.per_question_time_sec - remaining) /
                      data.interview.per_question_time_sec) *
                      100,
                  )}%`,
                }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-400 dark:text-slate-500">
              <span className="tabular-nums">
                Écoulé {formatTime(data.interview.per_question_time_sec - remaining)}
              </span>
              <span className="tabular-nums">
                Restant {formatTime(remaining)} / {formatTime(data.interview.per_question_time_sec)}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="grid flex-1 items-stretch gap-4 md:grid-cols-2">
        {/* Left: the question only — answers stay hidden, like a real interview */}
        <div className="card flex flex-col justify-center gap-5 p-6 md:p-8">
          {question.module_name && (
            <span className="inline-flex w-fit items-center rounded-full bg-brand/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand">
              {question.module_name}
            </span>
          )}
          <h2 className="text-xl font-semibold leading-snug tracking-tight md:text-2xl">
            {question.prompt}
          </h2>
          <p className="flex items-center gap-2 text-sm text-gray-400 dark:text-slate-500">
            <span className="text-base">🎙️</span>
            Répondez à voix haute, face à la caméra.
          </p>
        </div>

        {/* Right: camera — video-interview framing, fills the column.
            All privacy filters below affect the preview only; the recorded
            MediaStream is never altered. */}
        <div className="relative min-h-[42vh] overflow-hidden rounded-2xl border border-[var(--border)] bg-black shadow-sm">
          {data.interview.show_camera ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                // Mirror the self-view like a mirror; recording stays un-mirrored.
                className={`absolute inset-0 h-full w-full -scale-x-100 object-cover transition-[filter] duration-300 ${
                  camMode === "pixel" ? "opacity-0" : ""
                } ${
                  camMode === "blur"
                    ? "blur-xl"
                    : camMode === "silhouette"
                      ? "blur-2xl grayscale brightness-[0.35] contrast-150"
                      : camMode === "grid"
                        ? "blur-[2px]"
                        : ""
                }`}
              />

              {/* Pixelation canvas (only visible in Pixel mode) */}
              <canvas
                ref={canvasRef}
                className={`absolute inset-0 h-full w-full -scale-x-100 ${
                  camMode === "pixel" ? "" : "hidden"
                }`}
              />

              {/* Grille / radar overlay: dark-grey (near-black) wash with a
                  lighter grey grid — the face stays barely visible underneath */}
              {camMode === "grid" && (
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    backgroundColor: "rgba(70,70,76,0.5)",
                    backgroundImage:
                      "linear-gradient(rgba(150,150,155,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(150,150,155,0.5) 1px, transparent 1px)",
                    backgroundSize: "22px 22px",
                  }}
                />
              )}

              {/* Silhouette grey wash */}
              {camMode === "silhouette" && (
                <div className="pointer-events-none absolute inset-0 bg-gray-500/40" />
              )}

              {/* Mode selector */}
              <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                {CAM_MODES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setCamMode(m.id)}
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium backdrop-blur transition ${
                      camMode === m.id
                        ? "bg-white text-black"
                        : "bg-black/55 text-white hover:bg-black/75"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Reminder that filters are preview-only */}
              {camMode !== "net" && (
                <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-white/80 backdrop-blur">
                  Aperçu masqué · l&apos;enregistrement reste net
                </span>
              )}
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-white/50">
              Caméra désactivée
            </div>
          )}

          {(data.interview.record_audio || data.interview.record_video) && (
            <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              REC
            </span>
          )}
        </div>
      </div>

      {/* Sticky footer: Quitter / Suivant always reachable, no scrolling */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-[var(--border)] bg-[var(--bg)]/90 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={quit}
            className="btn-secondary text-sm text-red-600 dark:text-red-400"
            disabled={advancing}
          >
            Quitter
          </button>
          <span className="hidden text-sm text-gray-400 tabular-nums dark:text-slate-500 sm:block">
            Question {index + 1} / {data.questions.length}
          </span>
          <button
            onClick={next}
            className="btn-primary min-w-28 text-sm"
            disabled={advancing}
          >
            {advancing
              ? "…"
              : index + 1 >= data.questions.length
                ? "Terminer ✓"
                : "Suivant ›"}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// Fraction of time left → warn (amber) then critical (red) as it runs out.
function ratio(remaining: number, total: number): number {
  return total > 0 ? remaining / total : 1;
}

function barColor(remaining: number, total: number): string {
  const r = ratio(remaining, total);
  if (r <= 0.15) return "bg-red-500";
  if (r <= 0.35) return "bg-amber-500";
  return "bg-brand";
}

function timeColor(remaining: number, total: number): string {
  const r = ratio(remaining, total);
  if (r <= 0.15) return "text-red-500";
  if (r <= 0.35) return "text-amber-500";
  return "";
}

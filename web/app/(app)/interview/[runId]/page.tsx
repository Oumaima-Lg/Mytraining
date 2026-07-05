"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, uploadBlob, presignDownload, Interview, Question } from "@/lib/api";

type RunData = {
  interview: Interview;
  questions: Question[];
};

export default function RunPage({ params }: { params: { runId: string } }) {
  const runId = params.runId;
  const router = useRouter();

  const [data, setData] = useState<RunData | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [advancing, setAdvancing] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
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
    setRevealed(false);
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

  if (!data || !question) {
    return <p className="text-gray-400">Chargement de l&apos;entretien…</p>;
  }

  return (
    <div className="space-y-4">
      {/* Top bar: module names + timer */}
      <div className="card flex items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {data.interview.modules?.map((m) => (
            <span
              key={m.id}
              className="rounded-full bg-brand/10 px-3 py-1 text-sm text-brand"
            >
              {m.name}
            </span>
          ))}
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums">
            {formatTime(remaining)}
          </div>
          <div className="text-xs text-gray-400">
            Question {index + 1} / {data.questions.length}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Left: question / answer */}
        <div className="card space-y-4">
          {question.module_name && (
            <span className="text-xs uppercase tracking-wide text-gray-400">
              {question.module_name}
            </span>
          )}
          <h2 className="text-xl font-semibold">{question.prompt}</h2>

          {data.interview.hide_answers && !revealed ? (
            <button
              onClick={() => setRevealed(true)}
              className="btn-secondary"
            >
              Afficher la réponse
            </button>
          ) : (
            <AnswerBlock question={question} />
          )}
        </div>

        {/* Right: camera */}
        <div className="card flex flex-col items-center justify-center">
          {data.interview.show_camera ? (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full rounded-lg bg-black"
            />
          ) : (
            <p className="text-sm text-gray-400">Caméra désactivée</p>
          )}
          {(data.interview.record_audio || data.interview.record_video) && (
            <p className="mt-2 flex items-center gap-2 text-xs text-red-500">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              Enregistrement en cours
            </p>
          )}
        </div>
      </div>

      {/* Bottom: Suivant */}
      <div className="flex justify-end">
        <button onClick={next} className="btn-primary" disabled={advancing}>
          {index + 1 >= data.questions.length ? "Terminer" : "Suivant"}
        </button>
      </div>
    </div>
  );
}

function AnswerBlock({ question }: { question: Question }) {
  return (
    <div className="space-y-3">
      <p className="whitespace-pre-wrap text-gray-700">
        {question.answer_text || "(aucune réponse fournie)"}
      </p>
      {question.attachments.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-medium text-gray-500">Documents joints :</p>
          {question.attachments.map((a) => (
            <AttachmentLink key={a.id} attachment={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function AttachmentLink({
  attachment,
}: {
  attachment: { id: number; filename: string; minio_key: string };
}) {
  async function open() {
    const url = await presignDownload(attachment.minio_key);
    window.open(url, "_blank");
  }
  return (
    <button
      onClick={open}
      className="block text-sm text-brand hover:underline"
    >
      📎 {attachment.filename}
    </button>
  );
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

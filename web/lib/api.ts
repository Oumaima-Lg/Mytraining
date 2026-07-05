// Client-side API helper. All calls go through the BFF proxy so the JWT stays
// in an httpOnly cookie and is never exposed to JS.

export type Attachment = {
  id: number;
  filename: string;
  minio_key: string;
  content_type: string;
  size: number;
};

export type Question = {
  id: number;
  module_id: number;
  prompt: string;
  answer_text: string;
  order_index: number;
  attachments: Attachment[];
  module_name?: string;
};

export type Module = {
  id: number;
  name: string;
  slug: string;
  description: string;
  question_count: number;
  created_at: string;
  questions?: Question[];
};

export type Interview = {
  id: number;
  name: string;
  total_time_sec: number;
  per_question_time_sec: number;
  per_module_time_sec: number;
  record_audio: boolean;
  record_video: boolean;
  show_camera: boolean;
  hide_answers: boolean;
  created_at: string;
  modules?: Module[];
};

export type Recording = {
  id: number;
  run_id: number;
  question_id: number | null;
  minio_key: string | null;
  media_type: string;
  transcript: string | null;
  ai_score: number | null;
  ai_feedback: string | null;
};

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/proxy/${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Erreur ${res.status}`);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => req<T>(path),
  post: <T>(path: string, body?: unknown) =>
    req<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    req<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => req<T>(path, { method: "DELETE" }),
};

// Upload a file to MinIO via a presigned PUT URL, then return the object key.
export async function uploadFile(
  file: File,
  scope: "attachment" | "recording" = "attachment",
): Promise<{ key: string }> {
  const { key, url } = await api.post<{ key: string; url: string }>(
    "files/presign-upload",
    { filename: file.name, content_type: file.type, scope },
  );
  const put = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!put.ok) throw new Error("Échec du téléversement vers le stockage");
  return { key };
}

export async function uploadBlob(
  blob: Blob,
  filename: string,
): Promise<{ key: string }> {
  const file = new File([blob], filename, { type: blob.type });
  return uploadFile(file, "recording");
}

export async function presignDownload(key: string): Promise<string> {
  const { url } = await api.get<{ url: string }>(
    `files/presign-download?key=${encodeURIComponent(key)}`,
  );
  return url;
}

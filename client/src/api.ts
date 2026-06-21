import type { Session, Room, GenerationJob } from './types';

const BASE = '/api';

async function req<T>(method: string, url: string, body?: unknown, onProgress?: (pct: number) => void): Promise<T> {
  if (onProgress && body instanceof FormData) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, url);
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText) as T);
        } else {
          reject(new Error(`${xhr.status}: ${xhr.responseText}`));
        }
      };
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.send(body as FormData);
    });
  }

  const res = await fetch(url, {
    method,
    headers: body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  createSession: () => req<{ sessionId: string }>('POST', `${BASE}/sessions`),

  getSession: (id: string) => req<Session>('GET', `${BASE}/sessions/${id}`),

  uploadFloorPlan: (id: string, file: File, onProgress?: (pct: number) => void) => {
    const fd = new FormData();
    fd.append('file', file);
    return req<{ status: string }>('POST', `${BASE}/sessions/${id}/floor-plan`, fd, onProgress);
  },

  updateRooms: (id: string, rooms: Room[]) =>
    req<Room[]>('PUT', `${BASE}/sessions/${id}/rooms`, { rooms }),

  addRoom: (id: string, label: string) =>
    req<Room>('POST', `${BASE}/sessions/${id}/rooms`, { label }),

  deleteRoom: (id: string, roomId: string) =>
    req<void>('DELETE', `${BASE}/sessions/${id}/rooms/${roomId}`),

  uploadPhoto: (id: string, roomId: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return req<Room>('POST', `${BASE}/sessions/${id}/rooms/${roomId}/photos`, fd);
  },

  deletePhoto: (id: string, roomId: string, photoId: string) =>
    req<void>('DELETE', `${BASE}/sessions/${id}/rooms/${roomId}/photos/${photoId}`),

  setPrimaryPhoto: (id: string, roomId: string, photoId: string) =>
    req<Room>('PUT', `${BASE}/sessions/${id}/rooms/${roomId}/photos/${photoId}/primary`),

  triggerGeneration: (id: string) =>
    req<{ jobs: GenerationJob[] }>('POST', `${BASE}/sessions/${id}/generate`),

  getJobs: (id: string) =>
    req<GenerationJob[]>('GET', `${BASE}/sessions/${id}/jobs`),
};

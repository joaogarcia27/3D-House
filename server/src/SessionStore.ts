import fs from 'fs/promises';
import path from 'path';
import { Session } from './types.js';

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), '..', 'data');

export function sessionDir(sessionId: string): string {
  return path.join(DATA_DIR, 'sessions', sessionId);
}

export function sessionFile(sessionId: string): string {
  return path.join(sessionDir(sessionId), 'session.json');
}

export class SessionStore {
  private locks = new Map<string, Promise<void>>();

  async read(id: string): Promise<Session | null> {
    try {
      const raw = await fs.readFile(sessionFile(id), 'utf-8');
      return JSON.parse(raw) as Session;
    } catch {
      return null;
    }
  }

  async write(id: string, data: Session): Promise<void> {
    const dir = sessionDir(id);
    await fs.mkdir(dir, { recursive: true });
    const file = sessionFile(id);
    await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
  }

  async update(id: string, updater: (s: Session) => Session): Promise<Session> {
    // Serialize updates per session to prevent read-modify-write races
    const prev = this.locks.get(id) ?? Promise.resolve();
    let resolve!: () => void;
    const next = new Promise<void>((r) => { resolve = r; });
    this.locks.set(id, next);

    await prev;
    try {
      const existing = await this.read(id);
      if (!existing) throw new Error(`Session ${id} not found`);
      const updated = updater(existing);
      await this.write(id, updated);
      return updated;
    } finally {
      resolve();
    }
  }
}

export const store = new SessionStore();

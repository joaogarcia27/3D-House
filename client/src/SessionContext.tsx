import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { api } from './api';
import type { Session, GenerationJob } from './types';

interface SessionCtx {
  session: Session | null;
  sessionId: string | null;
  setSessionId: (id: string) => void;
  refreshSession: () => Promise<void>;
  jobs: GenerationJob[];
}

const SessionContext = createContext<SessionCtx>({
  session: null,
  sessionId: null,
  setSessionId: () => {},
  refreshSession: async () => {},
  jobs: [],
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [sessionId, setSessionIdState] = useState<string | null>(
    () => localStorage.getItem('sessionId')
  );
  const [session, setSession] = useState<Session | null>(null);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  const setSessionId = useCallback((id: string) => {
    localStorage.setItem('sessionId', id);
    setSessionIdState(id);
  }, []);

  const refreshSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      const s = await api.getSession(sessionId);
      setSession(s);
      setJobs(s.jobs);
    } catch {
      // server not ready yet or session gone; will retry via SSE/poll
    }
  }, [sessionId]);

  // Connect SSE for job updates, fall back to polling
  useEffect(() => {
    if (!sessionId) return;

    refreshSession();

    let sseOk = false;
    const es = new EventSource(`/api/sessions/${sessionId}/events`);
    sseRef.current = es;

    es.onopen = () => {
      sseOk = true;
      // If the initial refreshSession failed (server was slow), load now
      refreshSession();
    };

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as { type: string; job: GenerationJob };
        if (msg.type === 'job-update') {
          setJobs((prev) => {
            const idx = prev.findIndex((j) => j.id === msg.job.id);
            if (idx === -1) return [...prev, msg.job];
            const next = [...prev];
            next[idx] = msg.job;
            return next;
          });
        }
      } catch {}
    };

    es.onerror = () => {
      if (!sseOk) {
        // SSE not working, fall back to polling
        es.close();
        pollRef.current = setInterval(async () => {
          if (!sessionId) return;
          const j = await api.getJobs(sessionId);
          setJobs(j);
        }, 10000);
      }
    };

    return () => {
      es.close();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [sessionId, refreshSession]);

  return (
    <SessionContext.Provider value={{ session, sessionId, setSessionId, refreshSession, jobs }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}

import { useEffect, useState } from 'react';
import type { GenerationJob, Room } from '../types';

const STATUS_ICON: Record<string, string> = {
  queued: '🕐',
  analysing: '⚙️',
  done: '✅',
  failed: '✕',
};

interface Props {
  jobs: GenerationJob[];
  rooms: Room[];
}

export function GenerationStatusHUD({ jobs, rooms }: Props) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const toggle = (e: KeyboardEvent) => {
      if (e.code === 'Tab') { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener('keydown', toggle);
    return () => window.removeEventListener('keydown', toggle);
  }, []);

  if (jobs.length === 0) return null;

  return (
    <div className="absolute bottom-4 left-4 z-10">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="bg-gray-900/80 border border-gray-700 text-gray-300 text-xs px-3 py-1.5 rounded-lg mb-1"
      >
        {open ? '▼' : '▲'} Generation {jobs.filter((j) => j.status === 'done' || j.status === 'partial_done').length}/{jobs.length}
      </button>
      {open && (
        <div className="bg-gray-900/90 border border-gray-700 rounded-lg p-2 space-y-1 max-h-64 overflow-y-auto">
          {jobs.map((job) => {
            const room = rooms.find((r) => r.id === job.roomId);
            return (
              <div key={job.id} className="flex items-center gap-2 text-xs">
                <span>{STATUS_ICON[job.status] ?? '…'}</span>
                <span className="text-gray-300">{room?.label ?? job.roomId}</span>
                <span className="text-gray-500 ml-auto">{job.mock ? 'mock' : job.status}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

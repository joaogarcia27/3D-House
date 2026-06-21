import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../SessionContext';
import type { Room } from '../types';

const ROOM_COLORS = [
  'rgba(139,92,246,0.35)',
  'rgba(59,130,246,0.35)',
  'rgba(16,185,129,0.35)',
  'rgba(245,158,11,0.35)',
  'rgba(239,68,68,0.35)',
  'rgba(236,72,153,0.35)',
  'rgba(6,182,212,0.35)',
  'rgba(251,191,36,0.35)',
];

const ROOM_BORDERS = [
  'rgba(139,92,246,0.8)',
  'rgba(59,130,246,0.8)',
  'rgba(16,185,129,0.8)',
  'rgba(245,158,11,0.8)',
  'rgba(239,68,68,0.8)',
  'rgba(236,72,153,0.8)',
  'rgba(6,182,212,0.8)',
  'rgba(251,191,36,0.8)',
];

export default function FloorPlanReviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session, setSessionId, refreshSession } = useSession();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [newRoomLabel, setNewRoomLabel] = useState('');
  const [addingRoom, setAddingRoom] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (id) setSessionId(id);
  }, [id, setSessionId]);

  useEffect(() => {
    if (session?.id === id && session.rooms) setRooms(session.rooms);
  }, [session, id]);

  useEffect(() => {
    if (editingId && editInputRef.current) editInputRef.current.focus();
  }, [editingId]);

  const startEdit = (room: Room) => {
    setEditingId(room.id);
    setEditLabel(room.label);
  };

  const commitRename = async (roomId: string) => {
    if (!id || !editLabel.trim()) { setEditingId(null); return; }
    const updated = rooms.map((r) => r.id === roomId ? { ...r, label: editLabel.trim() } : r);
    setRooms(updated);
    setEditingId(null);
    await api.updateRooms(id, updated);
    await refreshSession();
  };

  const deleteRoom = async (roomId: string) => {
    if (!id) return;
    await api.deleteRoom(id, roomId);
    setRooms((prev) => prev.filter((r) => r.id !== roomId));
    await refreshSession();
  };

  const addRoom = async () => {
    if (!id || !newRoomLabel.trim()) return;
    const room = await api.addRoom(id, newRoomLabel.trim());
    setRooms((prev) => [...prev, room]);
    setNewRoomLabel('');
    setAddingRoom(false);
    await refreshSession();
  };

  const floorPlanUrl = session?.floorPlan?.imageUrl;
  const reviewRequired = session?.floorPlan?.reviewRequired;

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-white text-xl font-semibold">Review Detected Rooms</h1>
        <button
          type="button"
          onClick={() => navigate(`/session/${id}/photos`)}
          className="px-5 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg font-medium transition-colors"
        >
          Confirm & continue →
        </button>
      </div>

      {reviewRequired && (
        <div className="bg-yellow-900/30 border-b border-yellow-700 px-6 py-3 text-yellow-300 text-sm">
          We weren't fully confident in all room detections — please review the rooms below before continuing.
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Floor plan image with overlays */}
        <div className="flex-1 overflow-auto p-6">
          <div className="relative inline-block">
            {floorPlanUrl && (
              <img
                src={floorPlanUrl}
                alt="Floor plan"
                className="max-w-full rounded-lg border border-gray-700"
                style={{ display: 'block' }}
              />
            )}
            {rooms.map((room, i) => {
              if (!room.geometry) return null;
              const { x, y, width, height } = room.geometry;
              return (
                <div
                  key={room.id}
                  className="absolute flex items-center justify-center cursor-pointer"
                  style={{
                    left: `${x * 100}%`,
                    top: `${y * 100}%`,
                    width: `${width * 100}%`,
                    height: `${height * 100}%`,
                    backgroundColor: ROOM_COLORS[i % ROOM_COLORS.length],
                    border: `2px solid ${ROOM_BORDERS[i % ROOM_BORDERS.length]}`,
                    borderRadius: 4,
                  }}
                  onClick={() => startEdit(room)}
                >
                  {editingId === room.id ? (
                    <input
                      ref={editInputRef}
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      onBlur={() => commitRename(room.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(room.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="bg-white text-gray-900 text-xs px-2 py-1 rounded w-4/5"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="bg-black/60 text-white text-xs px-2 py-0.5 rounded truncate max-w-[90%]">
                      {room.label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-72 border-l border-gray-800 flex flex-col overflow-y-auto">
          <div className="p-4 space-y-2 flex-1">
            <h2 className="text-gray-400 text-sm font-medium uppercase tracking-wide mb-3">
              Rooms ({rooms.length})
            </h2>
            {rooms.map((room, i) => (
              <div
                key={room.id}
                className="flex items-center gap-2 bg-gray-900 rounded-lg px-3 py-2"
              >
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ background: ROOM_BORDERS[i % ROOM_BORDERS.length] }}
                />
                {editingId === room.id ? (
                  <input
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    onBlur={() => commitRename(room.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(room.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    className="flex-1 bg-gray-800 text-white text-sm px-2 py-0.5 rounded"
                  />
                ) : (
                  <span
                    className="flex-1 text-gray-200 text-sm truncate cursor-pointer hover:text-white"
                    onClick={() => startEdit(room)}
                  >
                    {room.label}
                  </span>
                )}
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  room.confidence >= 0.7 ? 'bg-green-900 text-green-300' :
                  room.confidence >= 0.5 ? 'bg-yellow-900 text-yellow-300' :
                  'bg-red-900 text-red-300'
                }`}>
                  {Math.round(room.confidence * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => deleteRoom(room.id)}
                  className="text-gray-500 hover:text-red-400 text-sm"
                >
                  ✕
                </button>
              </div>
            ))}

            {addingRoom ? (
              <div className="flex gap-2 mt-2">
                <input
                  value={newRoomLabel}
                  onChange={(e) => setNewRoomLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addRoom();
                    if (e.key === 'Escape') setAddingRoom(false);
                  }}
                  placeholder="Room name…"
                  className="flex-1 bg-gray-800 border border-gray-600 text-white text-sm px-3 py-2 rounded"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={addRoom}
                  className="px-3 py-2 bg-violet-600 text-white text-sm rounded"
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingRoom(true)}
                className="w-full mt-2 border border-dashed border-gray-600 text-gray-400 hover:text-gray-200 hover:border-gray-400 rounded-lg py-2 text-sm transition-colors"
              >
                + Add room
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

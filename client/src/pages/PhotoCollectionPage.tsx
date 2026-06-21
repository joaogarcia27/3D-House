import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../SessionContext';
import type { Room, Photo } from '../types';

function RoomUploadRow({
  room,
  sessionId,
  onUpdate,
}: {
  room: Room;
  sessionId: string;
  onUpdate: (r: Room) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const updated = await api.uploadPhoto(sessionId, room.id, file);
      onUpdate(updated);
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach(upload);
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    Array.from(e.dataTransfer.files).forEach(upload);
  };

  const setPrimary = async (photoId: string) => {
    const updated = await api.setPrimaryPhoto(sessionId, room.id, photoId);
    onUpdate(updated);
  };

  const deletePhoto = async (photoId: string) => {
    await api.deletePhoto(sessionId, room.id, photoId);
    onUpdate({ ...room, photos: room.photos.filter((p) => p.id !== photoId) });
  };

  const hasCoverage = room.photos.length > 0;

  return (
    <div
      className={`relative bg-gray-900 rounded-xl p-4 border transition-colors ${
        dragging ? 'border-violet-400 bg-violet-900/20' : 'border-gray-800'
      } ${hasCoverage ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-gray-700'}`}
      onDragEnter={() => setDragging(true)}
      onDragLeave={() => setDragging(false)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-medium">{room.label}</h3>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="px-3 py-1.5 bg-violet-700 hover:bg-violet-600 text-white text-sm rounded transition-colors disabled:opacity-50"
        >
          {uploading ? 'Uploading…' : 'Upload photo'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onFileChange} />
      </div>

      {uploadError && (
        <p className="text-red-400 text-xs mb-2">Upload failed: {uploadError}</p>
      )}

      {room.photos.length > 0 ? (
        <div className="flex gap-2 flex-wrap">
          {room.photos.map((photo: Photo) => (
            <div key={photo.id} className="relative group w-20 h-20">
              <img
                src={photo.fileUrl}
                alt=""
                className={`w-20 h-20 object-cover rounded cursor-pointer transition-all ${
                  photo.id === room.primaryPhotoId
                    ? 'ring-2 ring-violet-400'
                    : 'opacity-70 hover:opacity-100'
                }`}
                onClick={() => setPrimary(photo.id)}
              />
              {photo.id === room.primaryPhotoId && (
                <span className="absolute bottom-0 left-0 right-0 text-center text-xs bg-violet-700 text-white py-0.5 rounded-b">
                  Primary
                </span>
              )}
              <button
                type="button"
                onClick={() => deletePhoto(photo.id)}
                className="absolute top-1 right-1 bg-black/70 text-white text-xs w-4 h-4 rounded-full hidden group-hover:flex items-center justify-center"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-gray-500 text-sm">
          {dragging ? 'Drop photos here' : 'No photos yet — drag & drop or click Upload photo'}
        </p>
      )}
    </div>
  );
}

export default function PhotoCollectionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session, setSessionId, refreshSession } = useSession();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (id) setSessionId(id);
  }, [id, setSessionId]);

  useEffect(() => {
    if (session?.id === id && session.rooms) {
      const sorted = [...session.rooms].sort((a, b) =>
        a.photos.length === 0 ? -1 : b.photos.length === 0 ? 1 : 0
      );
      setRooms(sorted);
    }
  }, [session, id]);

  const updateRoom = (updated: Room) => {
    setRooms((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  };

  const covered = rooms.filter((r) => r.photos.length > 0).length;
  const total = rooms.length;
  const allCovered = covered === total && total > 0;
  const someCovered = covered > 0;

  const generate = async () => {
    if (!id) return;
    setGenerating(true);
    try {
      await api.triggerGeneration(id);
      await refreshSession();
      navigate(`/session/${id}/walkthrough`);
    } catch (err) {
      alert((err as Error).message);
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-white text-xl font-semibold">Upload Room Photos</h1>
          <button
            type="button"
            onClick={() => navigate(`/session/${id}/review`)}
            className="text-gray-400 hover:text-white text-sm"
          >
            ← Back to review
          </button>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-4">
          <div className="flex-1 bg-gray-800 rounded-full h-2">
            <div
              className="bg-violet-500 h-2 rounded-full transition-all"
              style={{ width: total > 0 ? `${(covered / total) * 100}%` : '0%' }}
            />
          </div>
          <span className={`text-sm font-medium ${allCovered ? 'text-green-400' : 'text-gray-400'}`}>
            {covered}/{total} rooms covered
          </span>
          {allCovered && <span className="text-green-400 text-sm">✓ Ready to generate</span>}
        </div>
      </div>

      {/* Room list */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {rooms.map((room) => (
          <RoomUploadRow
            key={room.id}
            room={room}
            sessionId={id!}
            onUpdate={updateRoom}
          />
        ))}
      </div>

      {/* Footer CTAs */}
      <div className="border-t border-gray-800 px-6 py-4 flex gap-3 justify-end">
        {!allCovered && someCovered && (
          <button
            type="button"
            onClick={generate}
            disabled={generating}
            className="px-5 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {generating ? 'Starting…' : 'Generate anyway (skip missing)'}
          </button>
        )}
        <button
          type="button"
          onClick={generate}
          disabled={!someCovered || generating}
          className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {generating ? 'Starting…' : allCovered ? 'Generate walkthrough →' : 'Generate walkthrough'}
        </button>
      </div>
    </div>
  );
}

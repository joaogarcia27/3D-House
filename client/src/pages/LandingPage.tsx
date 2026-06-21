import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../SessionContext';

type Phase = 'idle' | 'uploading' | 'parsing' | 'failed';

export default function LandingPage() {
  const navigate = useNavigate();
  const { setSessionId, refreshSession } = useSession();
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const startUpload = useCallback(async (file: File) => {
    setPhase('uploading');
    setProgress(0);
    setError(null);
    try {
      const { sessionId } = await api.createSession();
      setSessionId(sessionId);
      await api.uploadFloorPlan(sessionId, file, setProgress);
      setPhase('parsing');

      // Poll until parse is done
      let attempts = 0;
      const poll = async (): Promise<void> => {
        attempts++;
        const session = await api.getSession(sessionId);
        const status = session.floorPlan?.parseStatus;
        if (status === 'done' || status === 'parse_failed') {
          await refreshSession();
          if (status === 'parse_failed') {
            setError(session.floorPlan?.error ?? 'Floor plan analysis failed');
            setPhase('failed');
          } else {
            navigate(`/session/${sessionId}/review`);
          }
        } else if (attempts < 60) {
          setTimeout(poll, 2000);
        } else {
          setError('Analysis timed out. Please try again.');
          setPhase('failed');
        }
      };
      setTimeout(poll, 2000);
    } catch (err) {
      setError((err as Error).message);
      setPhase('failed');
    }
  }, [navigate, setSessionId, refreshSession]);

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length > 0) startUpload(accepted[0]);
    },
    [startUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'], 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    disabled: phase !== 'idle' && phase !== 'failed',
  });

  const handleManualEntry = () => {
    // Navigate to review with empty room list — user will add rooms manually
    const sessionId = localStorage.getItem('sessionId');
    if (sessionId) navigate(`/session/${sessionId}/review`);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-950">
      <div className="max-w-xl w-full text-center space-y-6">
        <h1 className="text-4xl font-bold text-white">3D House Walkthrough</h1>
        <p className="text-gray-400 text-lg">
          Upload your floor plan and room photos to generate an interactive first-person 3D tour.
        </p>

        {phase === 'idle' || phase === 'failed' ? (
          <>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-12 cursor-pointer transition-colors ${
                isDragActive
                  ? 'border-violet-400 bg-violet-900/20'
                  : 'border-gray-600 hover:border-violet-500 hover:bg-gray-900'
              }`}
            >
              <input {...getInputProps()} />
              <div className="text-5xl mb-4">🏠</div>
              <p className="text-gray-300 text-lg font-medium">
                {isDragActive ? 'Drop your floor plan here' : 'Drop your floor plan here'}
              </p>
              <p className="text-gray-500 text-sm mt-2">
                JPEG, PNG, WebP, or PDF • Up to 20 MB
              </p>
              <button
                type="button"
                className="mt-6 px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-lg font-medium transition-colors"
              >
                Choose file
              </button>
            </div>

            {error && (
              <div className="bg-red-900/30 border border-red-600 rounded-lg p-4 text-red-300 text-sm">
                <p className="font-medium">Analysis failed</p>
                <p className="mt-1">{error}</p>
                <div className="flex gap-3 mt-3 justify-center">
                  <button
                    type="button"
                    className="px-4 py-2 bg-red-700 hover:bg-red-600 rounded text-sm"
                    onClick={() => { setPhase('idle'); setError(null); }}
                  >
                    Try again
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                    onClick={handleManualEntry}
                  >
                    Enter rooms manually
                  </button>
                </div>
              </div>
            )}
          </>
        ) : phase === 'uploading' ? (
          <div className="border border-gray-700 rounded-xl p-10 space-y-4">
            <p className="text-gray-300">Uploading floor plan…</p>
            <div className="w-full bg-gray-800 rounded-full h-2">
              <div
                className="bg-violet-500 h-2 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-gray-500 text-sm">{progress}%</p>
          </div>
        ) : (
          <div className="border border-gray-700 rounded-xl p-10 space-y-4">
            <div className="animate-spin text-4xl inline-block">⚙️</div>
            <p className="text-gray-300">Analyzing your floor plan…</p>
            <p className="text-gray-500 text-sm">Claude is detecting rooms and geometry</p>
          </div>
        )}
      </div>
    </div>
  );
}

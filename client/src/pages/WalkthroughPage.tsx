import { Component, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../SessionContext';
import { WalkthroughViewer } from '../components/WalkthroughViewer';
import type { Session } from '../types';

class ErrorBoundary extends Component<{ children: React.ReactNode }, { error: string | null }> {
  state = { error: null };
  static getDerivedStateFromError(e: Error) { return { error: e.message }; }
  render() {
    if (this.state.error) {
      return (
        <div className="w-screen h-screen bg-gray-950 flex items-center justify-center p-8">
          <div className="text-red-400 text-sm max-w-xl">
            <p className="font-bold mb-2">Render error:</p>
            <pre className="whitespace-pre-wrap">{this.state.error}</pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function WalkthroughPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session, setSessionId } = useSession();
  const [localSession, setLocalSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!id) return;
    if (session?.id === id) {
      setLocalSession(session);
    } else {
      setSessionId(id);
      api.getSession(id).then(setLocalSession).catch(() => navigate('/'));
    }
  }, [id, session, setSessionId, navigate]);

  if (!localSession) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400">Loading walkthrough…</div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-black overflow-hidden">
      <ErrorBoundary>
        <WalkthroughViewer session={localSession} />
      </ErrorBoundary>
    </div>
  );
}

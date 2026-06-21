import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SessionProvider } from './SessionContext';
import LandingPage from './pages/LandingPage';
import FloorPlanReviewPage from './pages/FloorPlanReviewPage';
import PhotoCollectionPage from './pages/PhotoCollectionPage';
import WalkthroughPage from './pages/WalkthroughPage';

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/session/:id/review" element={<FloorPlanReviewPage />} />
          <Route path="/session/:id/photos" element={<PhotoCollectionPage />} />
          <Route path="/session/:id/walkthrough" element={<WalkthroughPage />} />
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  );
}

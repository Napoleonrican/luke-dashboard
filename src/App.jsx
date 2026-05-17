import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import TaskManager from './pages/TaskManager';
import DebtCalculator from './pages/DebtCalculator';
import VersaRepair from './pages/VersaRepair';
import GigTracker from './pages/GigTracker';
import ProtectedRoute from './components/ProtectedRoute';
import { useRandomPalette } from './utils/useRandomPalette';

export default function App() {
  const background = useRandomPalette();
  return (
    <div style={{ background, backgroundAttachment: 'fixed', minHeight: '100vh' }}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/task-manager" element={
          <ProtectedRoute><TaskManager /></ProtectedRoute>
        } />
        <Route path="/debt-calculator" element={<DebtCalculator />} />
        <Route path="/versa-repair" element={
          <ProtectedRoute><VersaRepair /></ProtectedRoute>
        } />
        <Route path="/gig-tracker" element={
          <ProtectedRoute><GigTracker /></ProtectedRoute>
        } />
      </Routes>
    </div>
  );
}

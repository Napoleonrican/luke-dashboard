import { Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import TaskManager from './pages/TaskManager';
import DebtCalculator from './pages/DebtCalculator';
import VersaRepair from './pages/VersaRepair';
import GigTracker from './pages/GigTracker';
import ClimateLayout from './pages/climate/ClimateLayout';
import Overview from './pages/climate/Overview';
import History from './pages/climate/History';
import Schedule from './pages/climate/Schedule';
import Goals from './pages/climate/Goals';
import AgentLog from './pages/climate/AgentLog';
import Settings from './pages/climate/Settings';
import AIBacklog from './pages/AIBacklog';
import LightingLayout from './pages/lighting/LightingLayout';
import Controls from './pages/lighting/Controls';
import Scenes from './pages/lighting/Scenes';
import CashflowLayout from './pages/cashflow/CashflowLayout';
import Waterfall from './pages/cashflow/Waterfall';
import Runway from './pages/cashflow/Runway';
import BillsDebts from './pages/cashflow/BillsDebts';
import FinancialAuthGate from './components/FinancialAuthGate';
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
        <Route path="/gig-tracker" element={<GigTracker />} />
        <Route path="/climate" element={<ClimateLayout />}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<Overview />} />
          <Route path="history" element={<History />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="goals" element={<Goals />} />
          <Route path="log" element={<AgentLog />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="/lighting" element={<LightingLayout />}>
          <Route index element={<Navigate to="controls" replace />} />
          <Route path="controls" element={<Controls />} />
          <Route path="scenes" element={<Scenes />} />
        </Route>
        {/* Old standalone page merged into the Climate shell; keep the URL working. */}
        <Route path="/thermometers" element={<Navigate to="/climate" replace />} />
        <Route path="/cashflow" element={
          <FinancialAuthGate><CashflowLayout /></FinancialAuthGate>
        }>
          <Route index element={<Navigate to="waterfall" replace />} />
          <Route path="waterfall" element={<Waterfall />} />
          <Route path="runway" element={<Runway />} />
          <Route path="bills" element={<BillsDebts />} />
        </Route>
        <Route path="/ai-backlog" element={<AIBacklog />} />
      </Routes>
    </div>
  );
}

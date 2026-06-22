import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import FinancialAuthGate from './components/FinancialAuthGate';
import ProtectedRoute from './components/ProtectedRoute';
import { useRandomPalette } from './utils/useRandomPalette';

const Home = lazy(() => import('./pages/Home'));
const TaskManager = lazy(() => import('./pages/TaskManager'));
const DebtCalculator = lazy(() => import('./pages/DebtCalculator'));
const VersaRepair = lazy(() => import('./pages/VersaRepair'));
const GigTracker = lazy(() => import('./pages/GigTracker'));
const ClimateLayout = lazy(() => import('./pages/climate/ClimateLayout'));
const Overview = lazy(() => import('./pages/climate/Overview'));
const History = lazy(() => import('./pages/climate/History'));
const Schedule = lazy(() => import('./pages/climate/Schedule'));
const Goals = lazy(() => import('./pages/climate/Goals'));
const AgentLog = lazy(() => import('./pages/climate/AgentLog'));
const Settings = lazy(() => import('./pages/climate/Settings'));
const AIBacklog = lazy(() => import('./pages/AIBacklog'));
const LightingLayout = lazy(() => import('./pages/lighting/LightingLayout'));
const Controls = lazy(() => import('./pages/lighting/Controls'));
const Scenes = lazy(() => import('./pages/lighting/Scenes'));
const CashflowLayout = lazy(() => import('./pages/cashflow/CashflowLayout'));
const Waterfall = lazy(() => import('./pages/cashflow/Waterfall'));
const Runway = lazy(() => import('./pages/cashflow/Runway'));
const Bills = lazy(() => import('./pages/cashflow/Bills'));
const BillsDebts = lazy(() => import('./pages/cashflow/BillsDebts'));

export default function App() {
  const background = useRandomPalette();
  return (
    <div style={{ background, backgroundAttachment: 'fixed', minHeight: '100vh' }}>
      <Suspense fallback={null}>
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
          <Route path="bills" element={<Bills />} />
          <Route path="debts" element={<BillsDebts />} />
        </Route>
        <Route path="/ai-backlog" element={<AIBacklog />} />
      </Routes>
      </Suspense>
    </div>
  );
}

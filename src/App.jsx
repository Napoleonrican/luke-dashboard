import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import FinancialAuthGate from './components/FinancialAuthGate';
import ProtectedRoute from './components/ProtectedRoute';
import { useRandomPalette } from './utils/useRandomPalette';

const Home = lazy(() => import('./pages/Home'));
const TaskManager = lazy(() => import('./pages/TaskManager'));
const DebtCalculator = lazy(() => import('./pages/DebtCalculator'));
const DebtCalcSettings = lazy(() => import('./pages/DebtCalcSettings'));
const VersaRepair = lazy(() => import('./pages/VersaRepair'));
const GigTracker = lazy(() => import('./pages/GigTracker'));
const ClimateLayout = lazy(() => import('./pages/climate/ClimateLayout'));
const Overview = lazy(() => import('./pages/climate/Overview'));
const History = lazy(() => import('./pages/climate/History'));
const Schedule = lazy(() => import('./pages/climate/Schedule'));
const Goals = lazy(() => import('./pages/climate/Goals'));
const AgentLog = lazy(() => import('./pages/climate/AgentLog'));
const Settings = lazy(() => import('./pages/climate/Settings'));
const MissionControl = lazy(() => import('./pages/MissionControl'));
const LightingLayout = lazy(() => import('./pages/lighting/LightingLayout'));
const Controls = lazy(() => import('./pages/lighting/Controls'));
const Scenes = lazy(() => import('./pages/lighting/Scenes'));
const LightingSchedule = lazy(() => import('./pages/lighting/Schedule'));
const CashflowLayout = lazy(() => import('./pages/cashflow/CashflowLayout'));
const Summary = lazy(() => import('./pages/cashflow/Summary'));
const Waterfall = lazy(() => import('./pages/cashflow/Waterfall'));
const Bills = lazy(() => import('./pages/cashflow/Bills'));
const Debts = lazy(() => import('./pages/cashflow/Debts'));
const Subscriptions = lazy(() => import('./pages/cashflow/Subscriptions'));
const Earnin = lazy(() => import('./pages/cashflow/Earnin'));
const WatchTrackerLayout = lazy(() => import('./pages/watchtracker/WatchTrackerLayout'));
const Shows = lazy(() => import('./pages/watchtracker/Shows'));
const ShowDetail = lazy(() => import('./pages/watchtracker/ShowDetail'));
const Movies = lazy(() => import('./pages/watchtracker/Movies'));
const MovieDetail = lazy(() => import('./pages/watchtracker/MovieDetail'));
const Upcoming = lazy(() => import('./pages/watchtracker/Upcoming'));
const WtHistory = lazy(() => import('./pages/watchtracker/History'));
const WtStats = lazy(() => import('./pages/watchtracker/Stats'));

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
        <Route path="/debt-calculator" element={
          <FinancialAuthGate><DebtCalculator /></FinancialAuthGate>
        } />
        <Route path="/debt-calculator/settings" element={
          <FinancialAuthGate><DebtCalcSettings /></FinancialAuthGate>
        } />
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
          <Route path="schedule" element={<LightingSchedule />} />
        </Route>
        {/* Old standalone page merged into the Climate shell; keep the URL working. */}
        <Route path="/thermometers" element={<Navigate to="/climate" replace />} />
        <Route path="/cashflow" element={
          <FinancialAuthGate><CashflowLayout /></FinancialAuthGate>
        }>
          <Route index element={<Navigate to="waterfall" replace />} />
          <Route path="waterfall" element={<Waterfall />} />
          <Route path="summary" element={<Summary />} />
          <Route path="bills" element={<Bills />} />
          <Route path="debts" element={<Debts />} />
          <Route path="subscriptions" element={<Subscriptions />} />
          <Route path="earnin" element={<Earnin />} />
          {/* Runway merged into Waterfall (used together, now one page) — keep
              the old URL working. Inputs & Targets was retired earlier for the
              same reason: Plan Inputs replaced it with live-wired values. */}
          <Route path="runway" element={<Navigate to="../waterfall" replace />} />
          <Route path="inputs" element={<Navigate to="../waterfall" replace />} />
        </Route>
        <Route path="/watch-tracker" element={
          <FinancialAuthGate title="Watch Tracker" subtitle="Secure sign-in required"><WatchTrackerLayout /></FinancialAuthGate>
        }>
          <Route index element={<Navigate to="shows" replace />} />
          <Route path="shows" element={<Shows />} />
          <Route path="shows/:id" element={<ShowDetail />} />
          <Route path="movies" element={<Movies />} />
          <Route path="movies/:id" element={<MovieDetail />} />
          <Route path="upcoming" element={<Upcoming />} />
          <Route path="history" element={<WtHistory />} />
          <Route path="stats" element={<WtStats />} />
        </Route>
        <Route path="/mission-control" element={
          <FinancialAuthGate title="Mission Control" subtitle="Secure sign-in required">
            <MissionControl />
          </FinancialAuthGate>
        } />
        {/* Mission Control replaced the standalone Backlog + Issues pages; keep old URLs working. */}
        <Route path="/ai-backlog" element={<Navigate to="/mission-control" replace />} />
        <Route path="/github-issues" element={<Navigate to="/mission-control" replace />} />
      </Routes>
      </Suspense>
    </div>
  );
}

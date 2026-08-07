import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import FinancialAuthGate from './components/FinancialAuthGate';
import GigOpsAuthGate from './components/GigOpsAuthGate';
import ProtectedRoute from './components/ProtectedRoute';
import { useRandomPalette } from './utils/useRandomPalette';
import { GIG_OPS_HOSTS } from './lib/authConfig';

// A domain alias pointing at this same project can serve the Gig Ops page as
// its landing page, so the collaborator's link doesn't have to carry Luke's
// name. Works the same on a free *.vercel.app alias or a paid custom domain —
// nothing here depends on which, because the app does this, not Vercel.
//
// Done client-side rather than as a vercel.json rewrite: this is an SPA, so a
// server rewrite would serve index.html without changing the path the router
// reads, and "/" would still render Home. See docs/GIG_OPS_SETUP.md §5.
//
// Rendered at "/" rather than redirected to "/gig-ops" so the bare hostname
// stays bare in her address bar — there's no in-page routing to break, since
// the tabs are component state. /gig-ops still works on every hostname.
const isGigOpsHost = () =>
  typeof window !== 'undefined' &&
  GIG_OPS_HOSTS.includes(window.location.hostname);

const Home = lazy(() => import('./pages/Home'));
const TaskManager = lazy(() => import('./pages/TaskManager'));
const DebtCalculator = lazy(() => import('./pages/DebtCalculator'));
const DebtCalcSettings = lazy(() => import('./pages/DebtCalcSettings'));
const VersaRepair = lazy(() => import('./pages/VersaRepair'));
const GigTracker = lazy(() => import('./pages/GigTracker'));
const PricingStudio = lazy(() => import('./pages/PricingStudio'));
const ClimateLayout = lazy(() => import('./pages/climate/ClimateLayout'));
const Overview = lazy(() => import('./pages/climate/Overview'));
const History = lazy(() => import('./pages/climate/History'));
const Schedule = lazy(() => import('./pages/climate/Schedule'));
const Goals = lazy(() => import('./pages/climate/Goals'));
const AgentLog = lazy(() => import('./pages/climate/AgentLog'));
const GoalSchedule = lazy(() => import('./pages/climate/GoalSchedule'));
const Settings = lazy(() => import('./pages/climate/Settings'));
const MissionControl = lazy(() => import('./pages/MissionControl'));
const GigOpsMissionControl = lazy(() => import('./pages/GigOpsMissionControl'));
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
const CashflowGuide = lazy(() => import('./pages/cashflow/Guide'));
const WatchTrackerLayout = lazy(() => import('./pages/watchtracker/WatchTrackerLayout'));
const Shows = lazy(() => import('./pages/watchtracker/Shows'));
const ShowDetail = lazy(() => import('./pages/watchtracker/ShowDetail'));
const Movies = lazy(() => import('./pages/watchtracker/Movies'));
const MovieDetail = lazy(() => import('./pages/watchtracker/MovieDetail'));
const Upcoming = lazy(() => import('./pages/watchtracker/Upcoming'));
const WtHistory = lazy(() => import('./pages/watchtracker/History'));
const WtStats = lazy(() => import('./pages/watchtracker/Stats'));
const VehiclesLayout = lazy(() => import('./pages/vehicles/VehiclesLayout'));
const VehiclesUpcoming = lazy(() => import('./pages/vehicles/Upcoming'));
const VehiclesServiceLog = lazy(() => import('./pages/vehicles/ServiceLog'));
const VehiclesFuelLog = lazy(() => import('./pages/vehicles/FuelLog'));
const VehiclesInsights = lazy(() => import('./pages/vehicles/Insights'));
const Kiosk = lazy(() => import('./pages/kiosk/Kiosk'));

export default function App() {
  const background = useRandomPalette();
  return (
    <div style={{ background, backgroundAttachment: 'fixed', minHeight: '100vh' }}>
      <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={
          isGigOpsHost()
            ? <GigOpsAuthGate><GigOpsMissionControl /></GigOpsAuthGate>
            : <Home />
        } />
        <Route path="/task-manager" element={
          <ProtectedRoute><TaskManager /></ProtectedRoute>
        } />
        <Route path="/debt-calculator" element={
          <FinancialAuthGate requireOwner><DebtCalculator /></FinancialAuthGate>
        } />
        <Route path="/debt-calculator/settings" element={
          <FinancialAuthGate requireOwner><DebtCalcSettings /></FinancialAuthGate>
        } />
        <Route path="/versa-repair" element={
          <ProtectedRoute><VersaRepair /></ProtectedRoute>
        } />
        <Route path="/gig-tracker" element={<GigTracker />} />
        {/* Standalone tier/pricing decision tool for the Gig Tracker app.
            Public (no auth gate) so family/helpers can open the shared link;
            not linked from the Home hub. See PricingStudio.jsx. */}
        <Route path="/pricing-studio" element={<PricingStudio />} />
        <Route path="/climate" element={<ClimateLayout />}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<Overview />} />
          <Route path="history" element={<History />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="goals" element={<Goals />} />
          <Route path="log" element={<AgentLog />} />
          <Route path="goal-schedule" element={<GoalSchedule />} />
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
          <FinancialAuthGate requireOwner><CashflowLayout /></FinancialAuthGate>
        }>
          <Route index element={<Navigate to="waterfall" replace />} />
          <Route path="waterfall" element={<Waterfall />} />
          <Route path="summary" element={<Summary />} />
          <Route path="bills" element={<Bills />} />
          <Route path="debts" element={<Debts />} />
          <Route path="subscriptions" element={<Subscriptions />} />
          <Route path="earnin" element={<Earnin />} />
          <Route path="guide" element={<CashflowGuide />} />
          {/* Runway merged into Waterfall (used together, now one page) — keep
              the old URL working. Inputs & Targets was retired earlier for the
              same reason: Plan Inputs replaced it with live-wired values. */}
          <Route path="runway" element={<Navigate to="../waterfall" replace />} />
          <Route path="inputs" element={<Navigate to="../waterfall" replace />} />
        </Route>
        <Route path="/watch-tracker" element={
          <FinancialAuthGate requireOwner title="Watch Tracker" subtitle="Secure sign-in required"><WatchTrackerLayout /></FinancialAuthGate>
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
        <Route path="/vehicles" element={
          <FinancialAuthGate requireOwner title="Vehicle Care" subtitle="Secure sign-in required"><VehiclesLayout /></FinancialAuthGate>
        }>
          <Route index element={<Navigate to="upcoming" replace />} />
          <Route path="upcoming" element={<VehiclesUpcoming />} />
          <Route path="service-log" element={<VehiclesServiceLog />} />
          <Route path="fuel" element={<VehiclesFuelLog />} />
          <Route path="insights" element={<VehiclesInsights />} />
        </Route>
        <Route path="/mission-control" element={
          <FinancialAuthGate requireOwner title="Mission Control" subtitle="Secure sign-in required">
            <MissionControl />
          </FinancialAuthGate>
        } />
        {/* Mission Control replaced the standalone Backlog + Issues pages; keep old URLs working. */}
        <Route path="/ai-backlog" element={<Navigate to="/mission-control" replace />} />
        <Route path="/github-issues" element={<Navigate to="/mission-control" replace />} />
        {/* Gig Ops — a scoped Mission Control for the Gig Tracker collaborator.
            Direct-link only: not in homeModules.js, no tile on the Home hub. */}
        <Route path="/gig-ops" element={
          <GigOpsAuthGate><GigOpsMissionControl /></GigOpsAuthGate>
        } />
        {/* Living-room wall display. Public (no auth gate) — a TV/kiosk panel
            can't log in — and not linked from the Home hub; opened directly by
            URL on the display device. */}
        <Route path="/kiosk" element={<Kiosk />} />
      </Routes>
      </Suspense>
    </div>
  );
}

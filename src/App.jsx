import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import TaskManager from './pages/TaskManager';
import DebtCalculator from './pages/DebtCalculator';
import VersaRepair from './pages/VersaRepair';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/task-manager" element={<TaskManager />} />
      <Route path="/debt-calculator" element={<DebtCalculator />} />
      <Route path="/versa-repair" element={<VersaRepair />} />
    </Routes>
  );
}

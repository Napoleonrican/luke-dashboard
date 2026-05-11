import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import TaskManager from './pages/TaskManager';
import DebtCalculator from './pages/DebtCalculator';
import VersaRepair from './pages/VersaRepair';
import ProtectedRoute from './components/ProtectedRoute';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/task-manager" element={
        <ProtectedRoute><TaskManager /></ProtectedRoute>
      } />
      <Route path="/debt-calculator" element={
        <ProtectedRoute><DebtCalculator /></ProtectedRoute>
      } />
      <Route path="/versa-repair" element={
        <ProtectedRoute><VersaRepair /></ProtectedRoute>
      } />
    </Routes>
  );
}

import { Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import DigitalTwinPage from './pages/DigitalTwinPage';
import DashboardPage from './pages/DashboardPage';
import SafetyPage from './pages/SafetyPage';
import SensorPage from './pages/SensorPage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DigitalTwinPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/safety" element={<SafetyPage />} />
        <Route path="/sensors" element={<SensorPage />} />
      </Route>
    </Routes>
  );
}

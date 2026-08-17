import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import DigitalTwinPage from './pages/DigitalTwinPage';
import DashboardPage from './pages/DashboardPage';
import SafetyPage from './pages/SafetyPage';
import SensorPage from './pages/SensorPage';

// 첫 화면은 대시보드다.
//
// 한때 3D 화면을 첫 화면에 뒀지만, 1차 시연 범위에서 빠지면서 되돌렸다.
// 관제 업무의 출발점은 "지금 항만이 어떤 상태인가"이고 그게 대시보드다.
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/twin" element={<DigitalTwinPage />} />
        <Route path="/safety" element={<SafetyPage />} />
        <Route path="/sensors" element={<SensorPage />} />
        {/* 예전에 트윈이 / 였던 시절 공유된 링크를 살려 둔다 */}
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

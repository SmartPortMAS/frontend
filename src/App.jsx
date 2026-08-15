import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import DigitalTwinPage from './pages/DigitalTwinPage';
import DashboardPage from './pages/DashboardPage';
import SafetyPage from './pages/SafetyPage';
import SensorPage from './pages/SensorPage';

// 첫 화면은 디지털 트윈이다.
//
// 관제 업무 자체는 대시보드에서 시작하지만, 이 시스템을 처음 여는 사람에게는
// "울산 온산항의 어느 부두에 무슨 배가 붙어 있는가"를 공간으로 먼저 보여주는 편이
// 무엇을 하는 시스템인지 빨리 전달된다. 관제 화면은 사이드바 한 번으로 간다.
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DigitalTwinPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/safety" element={<SafetyPage />} />
        <Route path="/sensors" element={<SensorPage />} />
        {/* 잠시 트윈을 /twin 으로 옮겼던 적이 있어, 그때 공유된 링크를 살려 둔다 */}
        <Route path="/twin" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

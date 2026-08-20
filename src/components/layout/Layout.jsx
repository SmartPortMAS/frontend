import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import PortMisBar from './PortMisBar';
import { useState } from 'react';

// ToastContainer 는 걷어냈다 — useSensorStore.alerts 를 읽는데 그 배열을 채우는
// addAlert/updateSensorData 를 부르는 곳이 코드베이스에 하나도 없어(WebSocket 경로
// 잔해) 토스트가 뜬 적이 없다. 관제 경고는 헤더 알림 벨이 담당한다.
//
// 맨 위 PortMisBar 는 이 시스템이 PORT-MIS 의 한 축으로 들어가는 자리를 보여준다
// (실제 배포는 아니며, 바 우측에 '연계 구상(데모)' 를 항상 띄운다).

export default function Layout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="app-shell">
      <PortMisBar />
      <div className="app-layout">
        <Sidebar collapsed={sidebarCollapsed} setCollapsed={setSidebarCollapsed} />
        <div className="main-area" style={{ marginLeft: sidebarCollapsed ? '72px' : '260px' }}>
          <Header />
          <main className="page-content">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

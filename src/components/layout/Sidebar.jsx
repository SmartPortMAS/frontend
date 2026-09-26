import { NavLink } from 'react-router-dom';
import { FaCube, FaChartPie, FaShieldAlt, FaWaveSquare, FaChevronLeft, FaChevronRight, FaClipboardCheck, FaShip } from 'react-icons/fa';

export default function Sidebar({ collapsed, setCollapsed }) {
  // top 은 PORT-MIS 연계 바 높이만큼 내린다 — 0 이면 사이드바가 그 바를 덮는다
  return (
    <aside
      className={`sidebar ${collapsed ? 'collapsed' : ''}`}
      style={{ position: 'fixed', left: 0, top: 'var(--portmis-bar)', bottom: 0 }}
    >
      <div className="sidebar-logo">
        <div className="logo-icon"><FaWaveSquare /></div>
        <div className="logo-text">울산항만 관제시스템</div>
      </div>
      
      {/* 현황(대시보드) → 판정(안전) → 공간(3D) → 설비(센서) 순.
          관제 업무 순서이자 1차 시연 순서다. */}
      <nav className="sidebar-nav">
        <NavLink to="/" end className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
          <div className="nav-icon"><FaChartPie /></div>
          <div className="nav-label">대시보드</div>
        </NavLink>

        <NavLink to="/arrivals" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
          <div className="nav-icon"><FaShip /></div>
          <div className="nav-label">입항 예정 · 검증</div>
        </NavLink>

        <NavLink to="/berth-assignments" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
          <div className="nav-icon"><FaClipboardCheck /></div>
          <div className="nav-label">선석 현황</div>
        </NavLink>

        <NavLink to="/safety" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
          <div className="nav-icon"><FaShieldAlt /></div>
          <div className="nav-label">안전/환경 관제</div>
        </NavLink>

        <NavLink to="/twin" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
          <div className="nav-icon"><FaCube /></div>
          <div className="nav-label">3D 관제 화면</div>
        </NavLink>

        <NavLink to="/sensors" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
          <div className="nav-icon"><FaWaveSquare /></div>
          <div className="nav-label">센서 데이터</div>
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <button className="sidebar-toggle" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <FaChevronRight /> : <><FaChevronLeft /> <span className="sidebar-footer-text">사이드바 축소</span></>}
        </button>
      </div>
    </aside>
  );
}

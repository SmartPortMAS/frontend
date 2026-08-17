import { NavLink } from 'react-router-dom';
import { FaCube, FaChartPie, FaShieldAlt, FaWaveSquare, FaChevronLeft, FaChevronRight } from 'react-icons/fa';

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
      
      {/* 공간(트윈) → 현황(대시보드) → 판정(안전) → 설비(센서) 순.
          트윈이 첫 화면이라 사이드바 순서도 그에 맞춘다. */}
      <nav className="sidebar-nav">
        <NavLink to="/" end className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
          <div className="nav-icon"><FaCube /></div>
          <div className="nav-label">디지털 트윈</div>
        </NavLink>

        <NavLink to="/dashboard" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
          <div className="nav-icon"><FaChartPie /></div>
          <div className="nav-label">대시보드</div>
        </NavLink>

        <NavLink to="/safety" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
          <div className="nav-icon"><FaShieldAlt /></div>
          <div className="nav-label">안전/환경 관제</div>
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

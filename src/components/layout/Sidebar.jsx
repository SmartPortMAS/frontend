import { NavLink } from 'react-router-dom';
import { FaCube, FaChartPie, FaShieldAlt, FaWaveSquare, FaChevronLeft, FaChevronRight, FaClipboardCheck } from 'react-icons/fa';

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
      
      {/* 지금 전체(대시보드) → 배 한 척의 판정(선박 판정) → 화물 위험(안전) → 현장 배치(3D) → 설비 순.
          실제 흐름(입항 신고 → 사전배정 → 입항 전·접안 직전·하역 중 판정 → 게이트)을 따른다. */}
      <nav className="sidebar-nav">
        <NavLink to="/" end className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
          <div className="nav-icon"><FaChartPie /></div>
          <div className="nav-label">대시보드</div>
        </NavLink>

        {/* 선박 판정 — 들어오는 배(입항 전·접안 직전)와 붙어 있는 배(하역 중)를 한 화면에서.
            9/27 까지 '입항 예정 판정'과 '선석 현황' 두 메뉴였는데, 하역 중인 배가 양쪽에 나와
            같은 배·같은 판정이 두 화면에 보였다. 배 한 척을 시점 순서로 따라가는 화면 하나로 합쳤다. */}
        <NavLink to="/arrivals" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
          <div className="nav-icon"><FaClipboardCheck /></div>
          <div className="nav-label">선박 판정</div>
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
          <div className="nav-label">현장 설비</div>
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

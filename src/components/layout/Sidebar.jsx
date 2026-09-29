import { NavLink } from 'react-router-dom';
import { FaCube, FaChartPie, FaShieldAlt, FaWaveSquare, FaChevronLeft, FaChevronRight, FaClipboardCheck } from 'react-icons/fa';
import useVesselThread from '../../hooks/useVesselThread';

// 지금 전체(대시보드) → 배 한 척의 판정(선박 판정) → 화물 위험(혼재 심사) → 현장 배치(3D) → 설비 순.
// 실제 흐름(입항 신고 → 사전배정 → 입항 전·접안 직전·하역 중 판정 → 게이트)을 따른다.
// [2026-09-29] 순서가 눈에 보이게 메뉴를 세로줄로 잇고 번호를 붙였다. 배를 고르면 그 배의 상태가
// 메뉴마다 점으로 찍힌다(위 선박 추적 띠와 같은 값) — 어느 화면에 볼 것이 있는지 메뉴에서 보인다.
const MENUS = [
  { to: '/', end: true, key: 'where', label: '대시보드', icon: FaChartPie },
  { to: '/arrivals', key: 'verdict', label: '선박 판정', icon: FaClipboardCheck },
  { to: '/safety', key: 'cargo', label: '화물 혼재 심사', icon: FaShieldAlt },
  { to: '/twin', key: 'scene', label: '3D 관제 화면', icon: FaCube },
  { to: '/sensors', key: 'gate', label: '현장 설비', icon: FaWaveSquare },
];

export default function Sidebar({ collapsed, setCollapsed }) {
  const { thread } = useVesselThread();
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

      <nav className="sidebar-nav nav-rail">
        {MENUS.map((m, i) => {
          const Icon = m.icon;
          const st = thread?.steps[m.key];
          const lit = st && ['bad', 'warn', 'unknown', 'ok'].includes(st.tone) && (m.key === 'verdict' || m.key === 'cargo' || m.key === 'gate');
          return (
            <NavLink key={m.to} to={m.to} end={m.end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <div className="nav-icon">
                <Icon />
                <span className="nav-step" aria-hidden="true">{i + 1}</span>
              </div>
              <div className="nav-label">{m.label}</div>
              {lit && <span className={`nav-state tone-${st.tone}`} title={`${thread.name} · ${st.value}`}>{collapsed ? '' : st.value}</span>}
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <button className="sidebar-toggle" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <FaChevronRight /> : <><FaChevronLeft /> <span className="sidebar-footer-text">사이드바 축소</span></>}
        </button>
      </div>
    </aside>
  );
}

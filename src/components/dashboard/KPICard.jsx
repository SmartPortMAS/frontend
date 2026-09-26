import { useNavigate } from 'react-router-dom';

// to 가 있으면 타일이 그 화면으로 가는 단추가 된다(2026-09-27). "확인 대기 판정 17건"을 보고도
// 어디서 확인하는지 알 수 없던 문제 — 숫자를 보여 주는 타일은 그 숫자의 자세한 화면으로 이어져야 한다.
export default function KPICard({ title, value, unit, icon, change, trend = 'positive', to = null }) {
  const navigate = useNavigate();
  const clickable = Boolean(to);
  return (
    <div
      className="kpi-card"
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={clickable ? `${title} 자세히 →` : undefined}
      onClick={clickable ? () => navigate(to) : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') navigate(to); } : undefined}
      style={clickable ? { cursor: 'pointer' } : undefined}
    >
      <div className="kpi-icon" style={{
        background: `rgba(${trend === 'positive' ? '0, 212, 170' : trend === 'negative' ? '255, 75, 110' : '58, 134, 255'}, 0.1)`,
        color: `var(--${trend === 'positive' ? 'teal' : trend === 'negative' ? 'red' : 'blue'})`
      }}>
        {icon}
      </div>
      <div className="kpi-content">
        <div className="kpi-label">{title}{clickable && <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>→</span>}</div>
        <div>
          <span className="kpi-value">{value}</span>
          <span className="kpi-unit">{unit}</span>
        </div>
        {change && (
          <div className={`kpi-change ${trend}`}>
            {change}
          </div>
        )}
      </div>
    </div>
  );
}

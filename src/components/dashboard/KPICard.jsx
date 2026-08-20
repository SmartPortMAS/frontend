export default function KPICard({ title, value, unit, icon, change, trend = 'positive' }) {
  return (
    <div className="kpi-card">
      <div className="kpi-icon" style={{ 
        background: `rgba(${trend === 'positive' ? '0, 212, 170' : trend === 'negative' ? '255, 75, 110' : '58, 134, 255'}, 0.1)`,
        color: `var(--${trend === 'positive' ? 'teal' : trend === 'negative' ? 'red' : 'blue'})`
      }}>
        {icon}
      </div>
      <div className="kpi-content">
        <div className="kpi-label">{title}</div>
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

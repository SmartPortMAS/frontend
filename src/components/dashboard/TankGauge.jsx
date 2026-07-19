export default function TankGauge({ tank }) {
  const getFillColor = (level) => {
    if (level > 90) return 'var(--red)';
    if (level > 75) return 'var(--yellow)';
    return 'var(--teal)';
  };

  return (
    <div className="tank-gauge">
      <div className="tank-gauge-label">{tank.id}</div>
      <div className="tank-gauge-visual">
        <div 
          className="tank-gauge-fill" 
          style={{ 
            height: `${tank.level}%`, 
            background: `linear-gradient(to top, ${getFillColor(tank.level)}, rgba(0,212,170,0.5))` 
          }}
        />
        {/* 그리드 라인 */}
        <div style={{ position: 'absolute', top: '25%', left: 0, right: 0, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
        <div style={{ position: 'absolute', top: '75%', left: 0, right: 0, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div className="tank-gauge-value">{tank.level.toFixed(1)}%</div>
        <div className="tank-gauge-cargo">{tank.cargoType}</div>
      </div>
    </div>
  );
}

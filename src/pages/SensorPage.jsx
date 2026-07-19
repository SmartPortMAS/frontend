import useSensorStore from '../stores/useSensorStore';

export default function SensorPage() {
  const { tanks, pipes, connected } = useSensorStore();

  return (
    <div className="page-content" style={{ padding: '0' }}>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>센서 데이터 스트림</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>IoT 센서 네트워크에서 수집되는 실시간 로우 데이터입니다.</p>
        </div>
        <div className={`sensor-status ${connected ? 'online' : 'offline'}`} style={{ padding: '8px 16px', fontSize: '13px' }}>
          {connected ? 'WebSocket Connected' : 'WebSocket Disconnected'}
        </div>
      </div>

      <h3 style={{ fontSize: '16px', margin: '24px 0 16px', color: 'var(--teal)' }}>탱크 센서</h3>
      <div className="sensor-grid">
        {tanks.map(tank => (
          <div key={tank.id} className="sensor-card">
            <div className="sensor-card-header">
              <span className="sensor-id">{tank.id}</span>
              <span className={`sensor-status ${tank.status === 'active' ? 'online' : 'offline'}`}>
                {tank.status.toUpperCase()}
              </span>
            </div>
            <div className="sensor-readings">
              <div className="sensor-reading">
                <span className="sensor-reading-label">Level</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <span className="sensor-reading-value">{tank.level.toFixed(1)}</span>
                  <span className="sensor-reading-unit">%</span>
                </div>
              </div>
              <div className="sensor-reading">
                <span className="sensor-reading-label">Temperature</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <span className="sensor-reading-value">{tank.temperature.toFixed(1)}</span>
                  <span className="sensor-reading-unit">°C</span>
                </div>
              </div>
              <div className="sensor-reading">
                <span className="sensor-reading-label">Pressure</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <span className="sensor-reading-value">{tank.pressure.toFixed(2)}</span>
                  <span className="sensor-reading-unit">bar</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <h3 style={{ fontSize: '16px', margin: '32px 0 16px', color: 'var(--teal)' }}>배관 센서</h3>
      <div className="sensor-grid">
        {pipes.map(pipe => (
          <div key={pipe.id} className="sensor-card">
            <div className="sensor-card-header">
              <span className="sensor-id">{pipe.id}</span>
              <span className={`sensor-status ${pipe.flowRate > 0 ? 'online' : 'offline'}`}>
                {pipe.flowRate > 0 ? 'FLOWING' : 'IDLE'}
              </span>
            </div>
            <div className="sensor-readings">
              <div className="sensor-reading">
                <span className="sensor-reading-label">Flow Rate</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <span className="sensor-reading-value">{pipe.flowRate.toFixed(1)}</span>
                  <span className="sensor-reading-unit">t/h</span>
                </div>
              </div>
              <div className="sensor-reading">
                <span className="sensor-reading-label">Pressure</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <span className="sensor-reading-value">{pipe.pressure.toFixed(2)}</span>
                  <span className="sensor-reading-unit">bar</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

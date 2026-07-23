import useSensorStore from '../stores/useSensorStore';
import HardwarePanel from '../components/sensor/HardwarePanel';
import { TankModel, PipeModel } from '../components/sensor/EquipmentModels';

export default function SensorPage() {
  const { tanks, pipes, connected } = useSensorStore();

  return (
    <div className="page-content" style={{ padding: '0' }}>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>센서 데이터 스트림</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            IoT 센서 네트워크에서 수집되는 실시간 데이터를 설비 모형으로 표시합니다.
          </p>
        </div>
        <div className={`sensor-status ${connected ? 'online' : 'offline'}`} style={{ padding: '8px 16px', fontSize: '13px' }}>
          {connected ? 'WebSocket Connected' : 'WebSocket Disconnected'}
        </div>
      </div>

      <HardwarePanel />

      <h3 style={{ fontSize: '16px', margin: '32px 0 16px', color: 'var(--teal)' }}>
        탱크 센서 — 저장탱크 수위·온도·압력
      </h3>
      <div className="sensor-grid">
        {tanks.map((tank) => (
          <TankModel key={tank.id} tank={tank} />
        ))}
      </div>

      <h3 style={{ fontSize: '16px', margin: '32px 0 16px', color: 'var(--teal)' }}>
        배관 센서 — 이송 라인 유량·압력
      </h3>
      <div className="sensor-grid">
        {pipes.map((pipe) => (
          <PipeModel key={pipe.id} pipe={pipe} />
        ))}
      </div>
    </div>
  );
}

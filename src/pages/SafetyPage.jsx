import SafetyGraph from '../components/safety/SafetyGraph';
import SafetyGatesPanel from '../components/safety/SafetyGatesPanel';
import useSensorStore from '../stores/useSensorStore';
import { FaExclamationTriangle, FaCheckCircle, FaExclamationCircle } from 'react-icons/fa';

export default function SafetyPage() {
  const systemStatus = useSensorStore(state => state.systemStatus);
  const alerts = useSensorStore(state => state.alerts);

  return (
    <div className="safety-layout">
      <div className="safety-graph-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <SafetyGatesPanel />
        <SafetyGraph />
      </div>

      <div className="safety-panel">
        <div className="glass-card">
          <div className="glass-card-header">
            <h3 className="glass-card-title">종합 안전 지수</h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div className="safety-grade-badge" style={{ 
              borderColor: systemStatus.safetyGrade === 'A' ? '#00d4aa' : systemStatus.safetyGrade === 'B' ? '#ffd166' : '#ff4b6e',
              color: systemStatus.safetyGrade === 'A' ? '#00d4aa' : systemStatus.safetyGrade === 'B' ? '#ffd166' : '#ff4b6e'
            }}>
              {systemStatus.safetyGrade}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '24px', fontWeight: '800' }}>{systemStatus.safetyScore} / 100</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>항만 전체 시설 및 작업 안전도</div>
            </div>
          </div>
        </div>

        <div className="glass-card" style={{ flex: 1 }}>
          <div className="glass-card-header">
            <h3 className="glass-card-title">실시간 안전 알림 ({alerts.length})</h3>
          </div>
          
          {alerts.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--text-dim)' }}>
              <FaCheckCircle size={40} color="var(--teal)" style={{ marginBottom: '16px', opacity: 0.5 }} />
              <p>현재 발효된 안전 알림이 없습니다.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {alerts.map((alert, idx) => (
                <div key={idx} style={{ 
                  padding: '16px', 
                  background: 'rgba(255, 75, 110, 0.1)', 
                  border: '1px solid rgba(255, 75, 110, 0.3)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'flex-start'
                }}>
                  <FaExclamationTriangle color="var(--red)" size={18} style={{ marginTop: '2px' }} />
                  <div>
                    <div style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>{alert.source} 이상 감지</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>{alert.message}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                      감지 시간: {new Date(alert.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card">
          <div className="glass-card-header">
            <h3 className="glass-card-title">제어 패널</h3>
          </div>
          <div className="safety-controls">
            <select className="safety-select">
              <option>전체 시설</option>
              <option>T-101 탱크</option>
              <option>T-102 탱크</option>
              <option>P-01 배관</option>
            </select>
            <button className="safety-btn" style={{ background: 'linear-gradient(135deg, #ff4b6e, #d90429)' }}>긴급 차단</button>
            <button className="safety-btn">점검 요청</button>
          </div>
        </div>
      </div>
    </div>
  );
}

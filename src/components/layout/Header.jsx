import { useEffect, useState } from 'react';
import useSensorStore from '../../stores/useSensorStore';
import { FaWifi, FaExclamationTriangle, FaCloudSun } from 'react-icons/fa';

export default function Header() {
  const connected = useSensorStore(state => state.connected);
  const alerts = useSensorStore(state => state.alerts);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="header">
      <div className="header-left">
        <div className="header-title">울산항 액체화물 하역 스케줄링 및 안전 관제</div>
      </div>

      {/* VTS 실시간 알림 전광판 — 헤더 중앙 (콘텐츠와 안 겹치는 전역 위치) */}
      <div style={{
        flex: 1, minWidth: 0, margin: '0 18px', height: '26px',
        overflow: 'hidden', position: 'relative', borderRadius: '6px',
        background: 'linear-gradient(90deg, rgba(220,38,38,0.12), rgba(220,38,38,0.42), rgba(220,38,38,0.12))',
        border: '1px solid rgba(239,68,68,0.45)',
        display: 'flex', alignItems: 'center',
      }}>
        <div style={{
          whiteSpace: 'nowrap', display: 'flex', gap: '52px',
          color: '#fff', fontSize: '12.5px', fontWeight: 600,
          animation: 'headerMarquee 26s linear infinite',
        }}>
          <span>⚠ [위험] T005 탱크 수위 90% 임박 (ESD 대기)</span>
          <span>✅ [접안] ULSAN PIONEER 제3부두 접안 완료</span>
          <span>ℹ [시스템] 해양수산부 VTS 연동 정상화</span>
          <span>⚠ [위험] T005 탱크 수위 90% 임박 (ESD 대기)</span>
          <span>✅ [접안] ULSAN PIONEER 제3부두 접안 완료</span>
        </div>
        <style>{`@keyframes headerMarquee { 0% { transform: translateX(60%); } 100% { transform: translateX(-100%); } }`}</style>
      </div>

      <div className="header-right">
        <div className="header-badge weather-badge">
          <FaCloudSun />
          <span>울산 22°C | 풍속 3.2m/s</span>
        </div>

        <div className="header-badge alert-badge" title={`${alerts.length}개 알림`}>
          <FaExclamationTriangle color={alerts.length > 0 ? '#ff4b6e' : '#8ba3b8'} />
          {alerts.length > 0 && <span className="alert-count">{alerts.length}</span>}
        </div>

        <div className="header-badge">
          <div className={`status-dot ${connected ? 'connected' : 'disconnected'}`}></div>
          <span>{connected ? '실시간 연동 중' : '연결 끊김'}</span>
        </div>
        
        <div className="header-badge" style={{ fontFamily: 'monospace' }}>
          {currentTime.toLocaleTimeString('ko-KR', { hour12: false })}
        </div>
      </div>
    </header>
  );
}

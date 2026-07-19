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

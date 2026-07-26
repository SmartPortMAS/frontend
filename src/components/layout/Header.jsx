import { useEffect, useState } from 'react';
import useSensorStore from '../../stores/useSensorStore';
import useDashboardData from '../../hooks/useDashboardData';
import { FaExclamationTriangle, FaCloudSun } from 'react-icons/fa';

const kstTime = (utc) => {
  if (!utc) return null;
  return new Date(utc).toLocaleTimeString('ko-KR', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul',
  });
};

export default function Header() {
  const alerts = useSensorStore(state => state.alerts);
  // 연결 상태는 실제 데이터 폴링 성공 여부로 판단한다.
  // (구 WebSocket 채널은 사용하지 않아 항상 '끊김'으로 보이던 문제 수정)
  const { data, error } = useDashboardData();
  const connected = !error && !!data;
  const w = data?.weather;
  const observedKst = kstTime(w?.observed_at_utc);
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
        <div
          className="header-badge weather-badge"
          title={observedKst ? `관측 ${observedKst} (KST)${w?.is_stale ? ' — 3시간 초과, 갱신 필요' : ''}` : '기상 데이터 없음'}
        >
          <FaCloudSun color={w?.is_stale ? '#f59e0b' : undefined} />
          <span>
            {w
              ? `풍속 ${w.wind_speed_ms ?? '-'}m/s · 파고 ${w.wave_height_sig_m ?? '-'}m`
              : '기상 로딩 중'}
            {observedKst && (
              <span style={{ color: w?.is_stale ? '#f59e0b' : '#8ba3b8', marginLeft: 6, fontSize: '11px' }}>
                {observedKst} 관측{w?.is_stale ? ' (오래됨)' : ''}
              </span>
            )}
          </span>
        </div>

        <div className="header-badge alert-badge" title={`${alerts.length}개 알림`}>
          <FaExclamationTriangle color={alerts.length > 0 ? '#ff4b6e' : '#8ba3b8'} />
          {alerts.length > 0 && <span className="alert-count">{alerts.length}</span>}
        </div>

        <div
          className="header-badge"
          title={connected ? '대시보드 데이터 폴링 정상 (30초 주기)' : `데이터 수신 실패: ${error || '서버 응답 없음'}`}
        >
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

import { useState, useEffect, useRef } from 'react';
import Scene from '../components/three/Scene';
import PortMap from '../components/dashboard/PortMap';
import VesselDetailPanel from '../components/dashboard/VesselDetailPanel';
import RadarMap from '../components/three/hud/RadarMap';
import CCTVPanel from '../components/three/hud/CCTVPanel';
import VesselTrafficList from '../components/three/hud/VesselTrafficList';
import BerthStatusBar from '../components/three/hud/BerthStatusBar';
import useSensorStore from '../stores/useSensorStore';
import useLiveTwinShips from '../hooks/useLiveTwinShips';
import useDashboardData from '../hooks/useDashboardData';
import { FaMap, FaPlay, FaPause, FaForward, FaFastForward, FaExclamationTriangle } from 'react-icons/fa';
import { alertSubject, levelStyle, typeLabel } from '../utils/alertUtils';

// Isaac Sim 6 WebRTC 스트리밍은 웹 뷰어(web-viewer-sample)를 통해 표시된다.
// 실행: D:\omniverse\start_twin_stream.bat (Isaac Sim 스트리밍 + 웹 뷰어 동시 기동)
//
// 뷰어 포트: Vite 는 5173 이 점유되어 있으면 5174, 5175… 로 올려서 뜬다.
// 5173 하나만 보고 있으면 "떠 있는데 못 찾는" 상황이 생기므로 후보를 순차 탐색한다.
const OMNIVERSE_PORTS = [5173, 5174, 5175, 5176];
const omniverseUrl = (port) => `http://localhost:${port}`;

// 경고 한 건이 화면에 머무는 시간. 결론만 보여주므로 5초면 충분히 읽힌다.
const TICKER_ROTATE_MS = 5000;

export default function DigitalTwinPage() {
  // 트윈 선박을 실 AIS·재항 화물로 채운다 (예전엔 스토어에 6척이 하드코딩돼 있었다)
  useLiveTwinShips();

  // 상단 띠에 흘릴 실경고 — 심각한 것부터 최대 6건. 화면 폭이 한정돼 있어
  // 전부 흘리면 한 바퀴가 너무 길어진다(현재 36건).
  const { data: dashForTicker } = useDashboardData();
  const allAlerts = dashForTicker?.alerts ?? [];
  const tickerItems = allAlerts.slice(0, 6);
  const dangerCount = allAlerts.filter((a) => a.level === 'DANGER').length;
  // 한 건씩 세워서 보여주고 자동으로 넘긴다(아래 배너 주석 참고)
  const [tickerIdx, setTickerIdx] = useState(0);
  useEffect(() => {
    if (tickerItems.length < 2) return undefined;
    const id = setInterval(
      () => setTickerIdx((i) => (i + 1) % tickerItems.length),
      TICKER_ROTATE_MS,
    );
    return () => clearInterval(id);
  }, [tickerItems.length]);
  const [showMap, setShowMap] = useState(false);
  const [showOmniverseStream, setShowOmniverseStream] = useState(false);
  // 'checking' | 'ok' | 'unreachable'
  const [streamStatus, setStreamStatus] = useState('checking');
  const [omniUrl, setOmniUrl] = useState(omniverseUrl(OMNIVERSE_PORTS[0]));
  const [streamKey, setStreamKey] = useState(0);   // iframe 재마운트용 (세션 재연결)

  // 웹 뷰어가 떠 있는 포트를 찾는다. no-cors 라 응답 내용은 못 읽지만,
  // 연결 거부/타임아웃이면 reject 되므로 "떠 있는지"는 판별 가능하다.
  const checkStream = async () => {
    setStreamStatus('checking');
    for (const port of OMNIVERSE_PORTS) {
      const url = omniverseUrl(port);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      try {
        await fetch(url, { mode: 'no-cors', signal: ctrl.signal });
        clearTimeout(timer);
        setOmniUrl(url);
        setStreamStatus('ok');
        return;
      } catch {
        clearTimeout(timer);   // 다음 포트 시도
      }
    }
    setStreamStatus('unreachable');
  };
  const predictionOffset = useSensorStore(state => state.predictionOffset);
  const setPredictionOffset = useSensorStore(state => state.setPredictionOffset);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setPredictionOffset(prev => {
          if (prev >= 720) {
            setIsPlaying(false);
            return 720;
          }
          return prev + 10;
        });
      }, 1000 / playSpeed);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, playSpeed, setPredictionOffset]);

  const togglePlay = () => setIsPlaying(!isPlaying);

  return (
    <div className="digital-twin-page" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <Scene />
      
      {/* 관제 경고 배너 — 한 건씩 세워 놓고 자동으로 넘긴다.
          예전엔 경고 전문을 가로로 흘렸는데(marquee), 메시지가 189~229자라
          줄글이 지나가는 꼴이 되어 읽히지 않았다(2026-08-24 피드백).
          결론만 남기고 대상·유형을 따로 세운다 — 상세는 안전/환경 관제에서 본다. */}
      {tickerItems.length > 0 && (() => {
        const a = tickerItems[Math.min(tickerIdx, tickerItems.length - 1)];
        const { subject, verdict } = alertSubject(a);
        const st = levelStyle(a.level);
        return (
          <div style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: 38,
            background: 'rgba(11,18,32,0.94)', borderBottom: `2px solid ${st.color}`,
            zIndex: 2000, display: 'flex', alignItems: 'center', gap: 10,
            padding: '0 14px', color: '#e8eef7', fontSize: 13, boxSizing: 'border-box',
          }}>
            <FaExclamationTriangle color={st.color} style={{ flexShrink: 0 }} />
            <span style={{
              flexShrink: 0, background: st.color, color: '#0b1220', fontWeight: 800,
              fontSize: 11, padding: '2px 7px', borderRadius: 4, letterSpacing: '0.02em',
            }}>{st.label}</span>
            <span style={{
              flexShrink: 0, border: '1px solid rgba(232,238,247,0.28)', color: '#c3cede',
              fontSize: 11, padding: '1px 7px', borderRadius: 4,
            }}>{typeLabel(a.type)}</span>
            {subject && (
              <span style={{ flexShrink: 0, fontWeight: 700 }}>{subject}</span>
            )}
            {/* 결론만 — 넘치면 자르되, 잘렸다는 것이 보이게 말줄임으로 둔다 */}
            <span style={{
              flex: 1, minWidth: 0, color: '#b8c4d6',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{verdict}</span>
            <span style={{ flexShrink: 0, color: '#8b98ab', fontSize: 11 }}>
              위험 {dangerCount} · 표시 {tickerIdx + 1}/{tickerItems.length}
            </span>
            {/* 어느 건을 보고 있는지 — 자동으로 넘어가므로 위치 표시가 필요하다 */}
            <span style={{ flexShrink: 0, display: 'flex', gap: 4 }}>
              {tickerItems.map((it, i) => (
                <button
                  key={`${it.type}-${i}`}
                  onClick={() => setTickerIdx(i)}
                  aria-label={`경고 ${i + 1}번 보기`}
                  style={{
                    width: 7, height: 7, padding: 0, borderRadius: '50%', border: 'none',
                    cursor: 'pointer',
                    background: i === tickerIdx ? st.color : 'rgba(232,238,247,0.3)',
                  }}
                />
              ))}
            </span>
          </div>
        );
      })()}

      {/* HUD Overlays — 2D 지도/스트리밍 중에는 숨김 */}
      {!showMap && !showOmniverseStream && (
        <>
          <RadarMap />
          <CCTVPanel />
          <VesselTrafficList />
          <BerthStatusBar />
        </>
      )}

      <div style={{ position: 'absolute', top: 50, right: 20, zIndex: 1000, display: 'flex', gap: '10px' }}>
        <button
          className="action-btn"
          onClick={() => {
            const next = !showOmniverseStream;
            setShowOmniverseStream(next);
            if (next) checkStream();
          }}
          style={{ 
            padding: '10px 16px', background: showOmniverseStream ? 'rgba(16, 185, 129, 0.8)' : 'rgba(15, 23, 42, 0.8)', 
            backdropFilter: 'blur(10px)', color: showOmniverseStream ? '#fff' : '#10b981', border: '1px solid rgba(16, 185, 129, 0.5)',
            borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold'
          }}
        >
          <FaPlay /> {showOmniverseStream ? 'Omniverse 스트리밍 끄기' : 'Omniverse 실시간 스트리밍 켜기'}
        </button>

        <button 
          className="action-btn"
          onClick={() => setShowMap(!showMap)}
          style={{ 
            padding: '10px 16px', background: 'rgba(15, 23, 42, 0.8)', 
            backdropFilter: 'blur(10px)', color: '#0ea5e9', border: '1px solid rgba(14, 165, 233, 0.5)',
            borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold'
          }}
        >
          <FaMap /> {showMap ? '3D View' : '2D Map'}
        </button>
      </div>

      {/* Omniverse WebRTC Streaming Player — 티커 아래에서 시작 */}
      {showOmniverseStream && (
        <div style={{ position: 'absolute', top: 30, left: 0, width: '100%', height: 'calc(100% - 30px)', zIndex: 850, background: '#000' }}>
          {streamStatus === 'ok' && (
            <>
              {/* Isaac Sim 기동 직후에는 인코더가 준비되기 전 첫 프레임이 드롭돼
                  검은/흰 화면으로 남는 경우가 있다. 그때 세션만 다시 맺으면 복구된다. */}
              <button
                onClick={() => setStreamKey((k) => k + 1)}
                style={{
                  position: 'absolute', top: 12, left: 12, zIndex: 860,
                  padding: '7px 14px', background: 'rgba(15,23,42,0.85)',
                  color: '#38bdf8', border: '1px solid rgba(56,189,248,0.5)',
                  borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 700,
                }}
                title="화면이 비어 있으면 눌러 세션을 다시 맺습니다"
              >
                ⟳ 스트림 다시 연결
              </button>
              <iframe
                key={streamKey}
                src={omniUrl}
                style={{ width: '100%', height: '100%', border: 'none' }}
                title="Omniverse WebRTC Stream"
                allow="camera; microphone; fullscreen; display-capture"
              />
            </>
          )}

          {streamStatus === 'checking' && (
            <div style={{
              height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#38bdf8', fontSize: '16px', fontWeight: 'bold',
            }}>
              Omniverse 스트리밍 서버 연결 확인 중...
            </div>
          )}

          {streamStatus === 'unreachable' && (
            <div style={{
              height: '100%', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: '14px',
              color: '#e8f0f2', textAlign: 'center', padding: '0 24px',
            }}>
              <FaExclamationTriangle size={42} color="#f59e0b" />
              <h2 style={{ margin: 0 }}>Omniverse 스트리밍이 실행되고 있지 않습니다</h2>
              <p style={{ margin: 0, color: '#94a3b8', maxWidth: '560px', lineHeight: 1.6 }}>
                웹 뷰어({OMNIVERSE_PORTS.map((p) => `:${p}`).join(', ')})에서 응답이 없습니다.<br />
                탐색기에서 <strong style={{ color: '#e8f0f2' }}>D:\omniverse\start_twin_stream.bat</strong> 을 실행하면
                Isaac Sim 스트리밍과 웹 뷰어가 함께 켜집니다. (최초 실행은 셰이더 컴파일로 수 분 소요)
              </p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={checkStream}
                  style={{
                    padding: '10px 18px', background: '#10b981', color: '#fff',
                    border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold',
                  }}
                >
                  다시 연결 시도
                </button>
                <button
                  onClick={() => setShowOmniverseStream(false)}
                  style={{
                    padding: '10px 18px', background: '#334155', color: '#fff',
                    border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold',
                  }}
                >
                  3D 시뮬레이션으로 돌아가기
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showMap && (
        /* 티커(30px) 아래에서 시작 → 지도 내부 버튼(온산확대·줌 등)이 가려지지 않음 */
        <div className="map-overlay" style={{ position: 'absolute', top: 30, left: 0, right: 0, bottom: 0, zIndex: 900 }}>
          <PortMap />
        </div>
      )}

      {/* 선박 상세 패널 (2D 지도 마커 클릭 시) */}
      <VesselDetailPanel />

      {/* Time Travel Slider with Media Controls — 스트리밍 중에는 숨김 */}
      {!showOmniverseStream && (
      <div className="time-slider-container" style={{ 
        position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)', 
        width: '600px', background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(10px)',
        padding: '16px 24px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', flexDirection: 'column', gap: '12px', zIndex: 1000 
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={togglePlay} style={{ background: isPlaying ? '#ef4444' : '#10b981', color: '#fff', border: 'none', borderRadius: '4px', padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
              {isPlaying ? <FaPause /> : <FaPlay />} {isPlaying ? '정지' : '오토플레이'}
            </button>
            <button onClick={() => setPlaySpeed(1)} style={{ background: playSpeed === 1 ? '#38bdf8' : '#334155', color: '#fff', border: 'none', borderRadius: '4px', padding: '6px 10px', cursor: 'pointer' }}>1x</button>
            <button onClick={() => setPlaySpeed(2)} style={{ background: playSpeed === 2 ? '#38bdf8' : '#334155', color: '#fff', border: 'none', borderRadius: '4px', padding: '6px 10px', cursor: 'pointer' }}><FaForward /></button>
            <button onClick={() => setPlaySpeed(5)} style={{ background: playSpeed === 5 ? '#38bdf8' : '#334155', color: '#fff', border: 'none', borderRadius: '4px', padding: '6px 10px', cursor: 'pointer' }}><FaFastForward /></button>
          </div>
          
          <span style={{ color: predictionOffset > 0 ? '#38bdf8' : '#10b981', fontSize: '13px', fontWeight: 'bold' }}>
            {predictionOffset === 0 ? '실시간 관제 중' : `예측 시뮬레이션: +${Math.floor(predictionOffset / 60)}시간 ${predictionOffset % 60}분 뒤`}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '11px', marginTop: '-4px' }}>
          <span>Live</span>
          <span>+12h</span>
        </div>

        {/* 슬라이더를 밀면 실AIS 선박이 움직인다. 무엇이 실측이고 무엇이 연출인지
            밝혀 둔다 — 하역 소요시간 예측 모델은 아직 없다. 현재 위치·상태는 실측이고,
            미래 이동(접안→출항)은 시나리오 애니메이션이다. */}
        {predictionOffset > 0 && (
          <div style={{
            fontSize: '11px', color: '#fbbf24', background: 'rgba(251,191,36,0.10)',
            border: '1px solid rgba(251,191,36,0.35)', borderRadius: '6px',
            padding: '6px 10px', lineHeight: 1.5, marginTop: '-2px',
          }}>
            ※ 선박의 <strong>현재 위치·항해상태는 실측(AIS)</strong>이지만, 미래 이동은
            데모 시나리오입니다 — 하역 소요시간 예측 모델은 아직 없습니다.
            일조/조명 변화만 시각 기준으로 실제 반영됩니다.
          </div>
        )}
        
        <input 
          type="range" 
          min="0" 
          max="720" 
          step="10" 
          value={predictionOffset} 
          onChange={(e) => {
            setIsPlaying(false);
            setPredictionOffset(parseInt(e.target.value));
          }}
          style={{ width: '100%', cursor: 'pointer', accentColor: '#38bdf8' }}
        />
      </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import Scene from '../components/three/Scene';
import { findBerthIdByName } from '../utils/geoUtils';
import PortMap from '../components/dashboard/PortMap';
import VesselDetailPanel from '../components/dashboard/VesselDetailPanel';
import RadarMap from '../components/three/hud/RadarMap';
import CCTVPanel from '../components/three/hud/CCTVPanel';
import VesselTrafficList from '../components/three/hud/VesselTrafficList';
import BerthStatusBar from '../components/three/hud/BerthStatusBar';
import useSensorStore from '../stores/useSensorStore';
import useLiveTwinShips from '../hooks/useLiveTwinShips';
import useDashboardData from '../hooks/useDashboardData';
import { BACKEND_BASE, postTwinFocus } from '../api/backendAdapter';
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

  // 다른 화면에서 넘어온 요청을 읽는다.
  //   ?berth=S-Oil 2부두  → 그 선석으로 카메라 이동 + 인접 선석 강조 (안전/환경 관제에서)
  //   ?omniverse=1        → 정밀 검토 스트림을 바로 켠다 (선박 상세 계류 검증에서)
  // 화면끼리 역할이 나뉘어 있어도 흐름이 끊기면 사용자는 매번 처음부터 찾아야 한다.
  const [searchParams] = useSearchParams();
  const focusBerth = searchParams.get('berth') || null;
  // 3D 장면에는 온산 11개 선석만 있다. 안전/환경 관제는 울산 전역(SK·가스부두 등)을
  // 다루므로, 장면 밖 선석으로 넘어오는 경우가 실제로 생긴다(2026-09-03 실측: SK3부두).
  // 그때 "빨간 링이 대상 선석"이라고 안내하면 있지도 않은 링을 찾게 만든다.
  const focusInScene = focusBerth ? Boolean(findBerthIdByName(focusBerth)) : false;
  const wantOmniverse = searchParams.get('omniverse') === '1';

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

  // 선박 상세의 계류 물리 검증에서 '정밀 검토'로 넘어온 경우 바로 켠다.
  // 사용자가 화면을 옮겨온 목적이 이미 분명한데 버튼을 한 번 더 누르게 할 이유가 없다.
  // 서버 확인(checkStream)도 같이 시작해야 한다 — 창만 열면 '연결 확인 중'에서 영원히 멈춘다(9/17 실측).
  useEffect(() => {
    if (wantOmniverse) {
      setShowOmniverseStream(true);
      checkStream();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantOmniverse]);

  // ── 정밀 검토 지목 ─────────────────────────────────────────────────────────
  // 3D 정보창의 [Omniverse 정밀 검토] → 스토어 요청 → 여기서 백엔드에 지목을 적고
  // 스트림을 연다. Omniverse 앱이 몇 초마다 지목을 읽어 그 선석으로 내려간다.
  // 지목이 없으면 Omniverse 는 조감 → 과거 사례 재생을 순환한다.
  const omniverseRequest = useSensorStore((s) => s.omniverseRequest);
  const clearOmniverseRequest = useSensorStore((s) => s.clearOmniverseRequest);
  const [omniFocus, setOmniFocus] = useState(null);       // 백엔드가 돌려준 현재 지목
  const [omniFocusError, setOmniFocusError] = useState(null);
  const [replayCases, setReplayCases] = useState([]);    // 과거 사례 — 실제로 있었던 날

  const sendFocus = async (focus) => {
    try {
      const res = await postTwinFocus(focus);
      setOmniFocus(res.berth ? res : null);
      setOmniFocusError(null);
    } catch (e) {
      // 지목이 안 적혀도 스트림은 그대로 본다 — Omniverse 는 순환 재생을 계속한다
      setOmniFocusError(e.message);
    }
  };

  useEffect(() => {
    if (!omniverseRequest) return;
    const { at, ...focus } = omniverseRequest;   // eslint-disable-line no-unused-vars
    setShowOmniverseStream(true);
    checkStream();
    sendFocus(focus);
    clearOmniverseRequest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [omniverseRequest?.at]);

  // 스트림을 열 때 지금 지목과 과거 사례 목록을 맞춰 둔다
  useEffect(() => {
    if (!showOmniverseStream) return;
    fetch(`${BACKEND_BASE}/twin/focus`)
      .then((r) => (r.ok ? r.json() : null))
      .then((f) => { if (f) setOmniFocus(f.berth ? f : null); })
      .catch(() => {});
    if (!replayCases.length) {
      fetch('/demo/replays.json')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setReplayCases((d?.replays || []).filter((r) => r.kind === 'vessel')))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOmniverseStream]);

  const togglePlay = () => setIsPlaying(!isPlaying);

  return (
    <div className="digital-twin-page" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <Scene focusBerth={focusBerth} />

      {/* 어느 선석을 보러 왔는지 알려준다.
          카메라만 옮기면 사용자는 '왜 여기가 비춰지는지' 모른다. */}
      {focusBerth && !showOmniverseStream && (
        <div style={{
          position: 'absolute', top: 46, left: '50%', transform: 'translateX(-50%)',
          zIndex: 840, display: 'flex', alignItems: 'center', gap: '10px',
          background: 'rgba(15, 23, 42, 0.88)', backdropFilter: 'blur(10px)',
          border: `1px solid ${focusInScene ? 'rgba(255, 75, 110, 0.55)' : 'rgba(245, 158, 11, 0.55)'}`,
          borderRadius: '10px', padding: '8px 14px', color: '#fff',
          fontSize: '12.5px', fontWeight: 700, maxWidth: '78%',
        }}>
          <span style={{ color: focusInScene ? '#ff4b6e' : '#f59e0b' }}>●</span>
          {focusBerth}
          <span style={{ color: '#94a3b8', fontWeight: 500 }}>
            {focusInScene
              ? '빨간 링이 대상 선석, 주황 링이 혼재 판정에 쓰인 인접 선석입니다'
              : '이 선석은 3차원 장면에 없습니다 — 장면은 온산 부두 11개 선석만 재현합니다'}
          </span>
        </div>
      )}
      
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
          {/* 문구를 '실시간 스트리밍'에서 '정밀 검토'로 바꿨다.
              바로 위 3D 화면도 실시간이라, 예전 문구로는 두 화면이 무엇이 다른지
              알 수 없었다(2026-09-03 IA 정리). 목적(정밀 검토)과 대가(기동 시간)를
              문구에 함께 담아 사용자가 누를지 말지 판단할 수 있게 한다. */}
          <FaPlay /> {showOmniverseStream ? '정밀 검토 닫기' : '정밀 검토 (Omniverse · 기동 1~2분)'}
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
          {/* 지금 Omniverse 가 무엇을 보여주려 하는지 — 영상만 보면 알 수 없다.
              지목은 3D 관제 화면에서 배·선석을 눌러 하고, 여기서는 과거 사례로 바꾸거나 풀 수 있다. */}
          <div style={{
            position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 870,
            display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'center',
            maxWidth: 'calc(100% - 260px)', padding: '7px 12px', borderRadius: '10px',
            background: 'rgba(15, 23, 42, 0.88)', border: '1px solid rgba(148, 163, 184, 0.35)',
            color: '#e8f0f2', fontSize: '12.5px',
          }}>
            <span style={{ color: omniFocus ? '#10b981' : '#94a3b8' }}>●</span>
            <span style={{ fontWeight: 800 }}>
              {omniFocus
                ? `${omniFocus.vessel_name ? `${omniFocus.vessel_name} · ` : ''}${omniFocus.berth}`
                : '순환 재생'}
            </span>
            <span style={{ color: '#94a3b8' }}>
              {omniFocus
                ? '— 앞으로 72시간 (기상청 단기예보 · 국립해양조사원 조석예보 · 판정 규칙 그대로)'
                : '— 조감 → 과거 사례 · 3D 관제 화면에서 배나 선석을 누르면 그곳을 봅니다'}
            </span>
            {replayCases.map((r) => (
              <button
                key={r.id}
                onClick={() => sendFocus({
                  berth: r.berth?.name, call_sign: r.vessel?.call_sign, vessel_name: r.vessel?.name,
                })}
                title={r.headline}
                style={{
                  padding: '3px 9px', borderRadius: '6px', cursor: 'pointer', fontSize: '11.5px',
                  fontWeight: 700, background: 'transparent', color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.5)',
                }}
              >
                과거 사례 {r.vessel?.name}
              </button>
            ))}
            {omniFocus && (
              <button
                onClick={() => sendFocus({})}
                style={{
                  padding: '3px 9px', borderRadius: '6px', cursor: 'pointer', fontSize: '11.5px',
                  fontWeight: 700, background: 'transparent', color: '#e8f0f2',
                  border: '1px solid rgba(232, 240, 242, 0.4)',
                }}
              >
                조감으로
              </button>
            )}
            {omniFocusError && (
              <span style={{ color: '#f59e0b', width: '100%', textAlign: 'center' }}>
                지목을 전하지 못했습니다({omniFocusError}) — Omniverse 는 순환 재생을 계속합니다
              </span>
            )}
          </div>

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
                탐색기에서 <strong style={{ color: '#e8f0f2' }}>D:\omniverse\start_twin_onsite.bat</strong> 을 실행하면
                경량 트윈(관제 스택과 동시 구동용)과 웹 뷰어가 함께 켜집니다. 1~2분 뒤 [다시 연결 시도]를 누르세요.
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

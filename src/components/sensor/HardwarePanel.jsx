import { useEffect, useState } from 'react';
import useHardwareData from '../../hooks/useHardwareData';
import { COLORS } from '../../utils/constants';
import { FaLock, FaLockOpen, FaPlug, FaExclamationTriangle, FaFlask } from 'react-icons/fa';

// 하역 개시 인터락 — 선석 A·B 게이트 실물(라즈베리파이 + 릴레이 + 상시닫힘 밸브 + LCD).
// 계약: 하드웨어/UI연동_전달사항_20260922.md. 판정은 백엔드가 기상 규칙으로 내려 장치에 보내고,
// 장치는 잠긴 동안 어떤 열기 요청도 거부한다. 이 화면은 그 사실을 보여줄 뿐 판단하지 않는다.

function Lamp({ on, color, label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
      <span style={{
        width: '18px', height: '18px', borderRadius: '50%',
        background: on ? color : COLORS.card, border: `1px solid ${on ? color : COLORS.border}`,
        boxShadow: on ? `0 0 12px ${color}` : 'none', transition: 'all 0.3s',
      }} />
      <span style={{ fontSize: '10px', color: COLORS.textDim }}>{label}</span>
    </div>
  );
}

function GateCard({ gate, onCommand }) {
  const st = gate.status || {};
  const sent = gate.interlock;            // 백엔드가 장치에 보낸 마지막 판정
  const locked = st.interlock === 'LOCKED';
  const valveOpen = st.valve === 'OPEN';
  const [pending, setPending] = useState(null);   // 방금 보낸 요청 — 장치 응답 전까지 표시
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!pending) return undefined;
    const id = setTimeout(() => setPending(null), 4000);
    return () => clearTimeout(id);
  }, [pending, st.ts]);

  const send = async (action) => {
    setError(null);
    try {
      await onCommand(gate.gate_id, action);
      setPending(action);
    } catch (e) {
      setError(e.message);
    }
  };

  const edge = gate.offline ? COLORS.textDim : locked ? COLORS.red : valveOpen ? COLORS.teal : COLORS.yellow;
  const reasonKo = sent?.reason_ko || null;

  return (
    <div className="sensor-card" style={{ borderLeft: `3px solid ${edge}`, opacity: gate.offline ? 0.75 : 1 }}>
      <div className="sensor-card-header">
        <span className="sensor-id">{gate.label} · {gate.berth}</span>
      </div>
      {gate.thresholds && (
        <div style={{ fontSize: '11px', color: COLORS.textDim, marginTop: '2px' }}>
          이 부두의 하역 중단 기준 — 풍속 {gate.thresholds.stop_wind_ms ?? '없음'} m/s
          {gate.thresholds.stop_wave_m != null ? ` · 파고 ${gate.thresholds.stop_wave_m} m` : ' · 파고 기준 없음'}
        </div>
      )}
      {/* 지금 이 선석에 붙어 있는 배와 그 배의 하역중 판정. 부적합·판정불가면 게이트가 잠긴다. */}
      {Array.isArray(gate.vessels) && (
        <div style={{ fontSize: '11.5px', marginTop: '3px', color: COLORS.textSecondary }}>
          {gate.vessels.length === 0 ? (
            <span style={{ color: COLORS.textDim }}>접안 선박 없음 — 기상 기준만 적용</span>
          ) : (
            gate.vessels.map((v) => (
              <div key={v.call_sign} style={{ color: v.blocking ? COLORS.red : COLORS.textSecondary }}>
                접안 선박 {v.vessel_name || v.call_sign} · 하역중 판정 <strong>{v.level || '아직 없음'}</strong>
                {v.blocking && v.reasons?.[0] && <span> — {v.reasons[0]}</span>}
              </div>
            ))
          )}
        </div>
      )}

      {gate.offline ? (
        <div style={{ margin: '12px 0', padding: '10px 12px', borderRadius: '8px', background: COLORS.card, color: COLORS.textSecondary, fontSize: '12.5px', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <FaPlug /> 게이트 연결 끊김 — 장치 응답이 15초 넘게 없습니다 (전원·Wi-Fi·브로커 확인)
          {st.interlock && <span style={{ color: COLORS.textDim }}> · 마지막 상태 {st.interlock === 'LOCKED' ? '잠김' : '해제'} / 밸브 {valveOpen ? '열림' : '닫힘'}</span>}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px', margin: '12px 0' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Lamp on={st.lamp === 'ON'} color={COLORS.red} label="잠금" />
            <Lamp on={st.ok_lamp === 'ON'} color={COLORS.teal} label="열림" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: locked ? COLORS.red : COLORS.teal, fontSize: '17px', fontWeight: 800 }}>
              {locked ? <FaLock /> : <FaLockOpen />} {locked ? '인터락 잠김 — 하역 개시 불가' : '인터락 해제'}
            </div>
            <div style={{ fontSize: '12.5px', color: COLORS.textPrimary, marginTop: '5px' }}>
              밸브 <strong>{valveOpen ? '열림 — 하역 중' : '닫힘'}</strong>
              {st.last_result && <span style={{ color: COLORS.textSecondary }}> · {st.last_result}</span>}
            </div>
            {locked && reasonKo && (
              <div style={{ fontSize: '12px', color: COLORS.red, marginTop: '4px' }}>근거: {reasonKo}</div>
            )}
            {st.simulate && (
              <div style={{ fontSize: '11px', color: COLORS.yellow, marginTop: '4px' }}>모의 장치 — 실물 없이 노트북에서 돌고 있습니다</div>
            )}
          </div>
        </div>
      )}

      {st.denied && !gate.offline && (
        <div style={{ margin: '0 0 10px', padding: '9px 12px', borderRadius: '8px', background: 'rgba(196, 50, 46, 0.10)', border: `1px solid ${COLORS.red}`, color: COLORS.red, fontSize: '12.5px', fontWeight: 700, display: 'flex', gap: '8px', alignItems: 'center' }}>
          <FaExclamationTriangle /> 요청 거부 — 인터락이 잠긴 상태라 장치가 열지 않았습니다.
        </div>
      )}
      {pending && !st.denied && (
        <div style={{ margin: '0 0 10px', fontSize: '12px', color: COLORS.info }}>
          {pending === 'OPEN' ? '하역 개시 요청' : '하역 중단'} 보냄 — 장치 응답 기다리는 중
        </div>
      )}
      {error && <div style={{ margin: '0 0 10px', fontSize: '12px', color: COLORS.yellow }}>보내지 못했습니다: {error}</div>}

      <div style={{ display: 'flex', gap: '8px' }}>
        {/* 잠겨 있어도 누를 수 있다 — 거부는 장치가 한다(그게 시연의 핵심 장면). 끊겼을 때만 막는다. */}
        <button
          onClick={() => send('OPEN')}
          disabled={gate.offline}
          style={{
            flex: 1, padding: '8px', borderRadius: '8px', border: 'none', fontWeight: 'bold',
            cursor: gate.offline ? 'not-allowed' : 'pointer',
            background: gate.offline ? COLORS.card : COLORS.teal, color: gate.offline ? COLORS.textDim : '#FFFFFF',
          }}
        >
          하역 개시 요청
        </button>
        <button
          onClick={() => send('CLOSE')}
          disabled={gate.offline}
          style={{
            flex: 1, padding: '8px', borderRadius: '8px', border: `1px solid ${COLORS.red}`, fontWeight: 'bold',
            cursor: gate.offline ? 'not-allowed' : 'pointer', background: 'transparent', color: COLORS.red,
          }}
        >
          하역 중단
        </button>
      </div>
    </div>
  );
}

// 시연 입력 — 시연장에서 실제 바람이 16 m/s 가 될 리 없어 값을 넣는다.
// 판정 규칙은 실제와 같고 값만 주입되며, 주입 중이면 배지가 뜬다(심사 질문에 정직하게).
function DemoControl({ demo, onApply, onClear }) {
  const [wind, setWind] = useState(demo?.wind_ms ?? 16);
  const [wave, setWave] = useState(demo?.wave_m ?? 0.5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (fn) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="sensor-card" style={{ borderLeft: `3px solid ${demo ? COLORS.yellow : COLORS.border}` }}>
      <div className="sensor-card-header">
        <span className="sensor-id"><FaFlask style={{ marginRight: '6px' }} />시연 입력 — 기상값 주입</span>
        {demo && (
          <span style={{ fontSize: '11px', fontWeight: 800, color: '#FFFFFF', background: COLORS.yellow, padding: '2px 8px', borderRadius: '999px' }}>
            시연 입력 중
          </span>
        )}
      </div>
      <div style={{ fontSize: '12px', color: COLORS.textSecondary, margin: '8px 0 10px', lineHeight: 1.5 }}>
        {demo
          ? `지금 판정은 주입값(풍속 ${demo.wind_ms ?? '실측'} m/s · 파고 ${demo.wave_m ?? '실측'} m)으로 돌고 있습니다. 판정 규칙은 실제와 같습니다.`
          : '해제 상태 — 판정은 실측(기상·파고 관측)으로 돕니다.'}
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '12px', color: COLORS.textSecondary }}>
          풍속 <input type="number" step="1" min="0" max="60" value={wind} onChange={(e) => setWind(Number(e.target.value))}
            style={{ width: '64px', marginLeft: '4px', padding: '4px 6px', borderRadius: '6px', border: `1px solid ${COLORS.border}`, background: COLORS.card, color: COLORS.textPrimary }} /> m/s
        </label>
        <label style={{ fontSize: '12px', color: COLORS.textSecondary }}>
          파고 <input type="number" step="0.1" min="0" max="15" value={wave} onChange={(e) => setWave(Number(e.target.value))}
            style={{ width: '64px', marginLeft: '4px', padding: '4px 6px', borderRadius: '6px', border: `1px solid ${COLORS.border}`, background: COLORS.card, color: COLORS.textPrimary }} /> m
        </label>
        <button disabled={busy} onClick={() => run(() => onApply({ wind_ms: wind, wave_m: wave }))}
          style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: COLORS.yellow, color: '#FFFFFF', fontWeight: 700, cursor: 'pointer' }}>
          적용
        </button>
        <button disabled={busy || !demo} onClick={() => run(onClear)}
          style={{ padding: '6px 12px', borderRadius: '8px', border: `1px solid ${COLORS.border}`, background: 'transparent', color: demo ? COLORS.textPrimary : COLORS.textDim, fontWeight: 700, cursor: demo ? 'pointer' : 'not-allowed' }}>
          해제 (실측으로)
        </button>
      </div>
      {error && <div style={{ marginTop: '6px', fontSize: '12px', color: COLORS.red }}>{error}</div>}
    </div>
  );
}

export default function HardwarePanel() {
  const { snapshot, wsState, sendGateCommand, setDemoWeather, clearDemoWeather } = useHardwareData();
  const broker = snapshot?.broker;

  return (
    <>
      <h3 style={{ fontSize: '16px', margin: '24px 0 6px', color: 'var(--teal)' }}>
        하역 개시 인터락 — 선석 A·B 게이트 (실물)
      </h3>
      <div style={{ fontSize: '12px', color: COLORS.textSecondary, marginBottom: '14px', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
        <span>화면 ↔ 관제 서버: <strong style={{ color: (wsState === 'open' || wsState === 'polling') ? COLORS.teal : COLORS.yellow }}>{wsState === 'open' ? '연결됨' : wsState === 'polling' ? '연결됨 (1초 조회)' : wsState === 'connecting' ? '연결 중' : '끊김 — 다시 연결 중'}</strong></span>
        {broker && (
          <span>관제 서버 ↔ 장치 중계: <strong style={{ color: broker.connected ? COLORS.teal : COLORS.red }}>{broker.connected ? '연결됨' : '끊김'}</strong>
            {!broker.connected && <span style={{ color: COLORS.textDim }}> (노트북에서 mosquitto 를 켜야 합니다)</span>}
          </span>
        )}
        <span style={{ color: COLORS.textDim }}>잠긴 동안의 열기 요청은 장치가 거부합니다 — 화면은 판단하지 않습니다</span>
      </div>

      {!snapshot ? (
        <div className="sensor-card" style={{ color: COLORS.textSecondary, fontSize: '13px' }}>
          {wsState === 'closed'
            ? '관제 서버(8001)에 연결할 수 없습니다 — 관제시스템_시작.bat 을 실행하세요.'
            : '게이트 상태를 기다리는 중…'}
        </div>
      ) : (
        <div className="sensor-grid">
          {snapshot.gates.map((gate) => (
            <GateCard key={gate.gate_id} gate={gate} onCommand={sendGateCommand} />
          ))}
          <DemoControl demo={snapshot.demo} onApply={setDemoWeather} onClear={clearDemoWeather} />
        </div>
      )}
    </>
  );
}

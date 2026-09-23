import { useCallback, useEffect, useRef, useState } from 'react';
import { BACKEND_BASE } from '../api/backendAdapter';

// ─────────────────────────────────────────────────────────────────────────────
// 하역 개시 인터락 게이트(라즈베리파이 실물) 상태 훅.
//
// 백엔드가 MQTT(gate/{id}/status)를 받아 /ws/gate 로 1초마다 상태 한 장을 밀어준다
// (backend app/gate/bridge.py · 계약은 하드웨어/UI연동_전달사항_20260922.md).
// 7월의 mockHardware.js(smartport/gate/… 계약)는 폐기했다 — 화면이 가짜 상태를
// 보여주면 실물이 붙었을 때 "왜 화면과 장치가 다르냐"가 된다.
//
// 요청은 보내기만 한다. "하역 개시 요청"을 눌렀을 때 열어도 되는지는 장치가 정하고,
// 그 결과가 다음 status 의 denied 로 돌아온다 — 화면이 먼저 거부하지 않는다.
// ─────────────────────────────────────────────────────────────────────────────

const WS_PATH = '/ws/gate';
const RECONNECT_MS = 2000;

async function call(path, body, method = 'POST') {
  const res = await fetch(`${BACKEND_BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export default function useHardwareData() {
  const [snapshot, setSnapshot] = useState(null);
  // 'connecting' | 'open' | 'closed' — 백엔드 WebSocket 자체의 상태(브로커·장치 상태와 별개)
  const [wsState, setWsState] = useState('connecting');
  const wsRef = useRef(null);

  useEffect(() => {
    let closed = false;
    let timer = null;
    const connect = () => {
      if (closed) return;
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${window.location.host}${WS_PATH}`);
      wsRef.current = ws;
      setWsState('connecting');
      ws.onopen = () => setWsState('open');
      ws.onmessage = (ev) => {
        try { setSnapshot(JSON.parse(ev.data)); } catch { /* 깨진 한 장은 버린다 */ }
      };
      ws.onclose = () => {
        setWsState('closed');
        if (!closed) timer = setTimeout(connect, RECONNECT_MS);
      };
      ws.onerror = () => { /* onclose 가 뒤따른다 */ };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      wsRef.current?.close();
    };
  }, []);

  const sendGateCommand = useCallback(
    (gateId, action) => call(`/gate/${gateId}/cmd`, { action }),
    [],
  );
  const setDemoWeather = useCallback(
    ({ wind_ms = null, wave_m = null }) => call('/gate/demo/weather', { wind_ms, wave_m }),
    [],
  );
  const clearDemoWeather = useCallback(() => call('/gate/demo/weather', null, 'DELETE'), []);

  return { snapshot, wsState, sendGateCommand, setDemoWeather, clearDemoWeather };
}

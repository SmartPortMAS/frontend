// ─────────────────────────────────────────────
// 하드웨어 노드 mock — 사전 승인 게이트 (CLAUDE.md 8-B)
//
// ★ MQTT 토픽 계약 (하드웨어 담당과 공유할 것) ★
//
// 사전 승인 게이트 (라즈베리파이 + 릴레이, 페일세이프·인터락)
//    상태 발행 topic:   smartport/gate/{gateId}/status
//    payload: { gate_id, state: 'OPEN'|'CLOSED'|'INTERLOCK',
//               mode: 'AUTO'|'MANUAL', beacon: 'GREEN'|'AMBER'|'RED',
//               fail_safe_ok: boolean, ts_utc }
//    명령 수신 topic:   smartport/gate/{gateId}/cmd
//    payload: { command: 'APPROVE'|'BLOCK', requested_by }
//
// (선석 기상노드(ESP32+풍속계)는 범위에서 제외 — 추후 구현 시
//  topic: smartport/berth/{berthId}/weather 형태로 이 파일에 계약 추가)
//
// 브라우저는 MQTT 를 직접 구독하지 않는다.
// 백엔드(FastAPI)가 MQTT ↔ WebSocket(/ws/hardware) 릴레이 예정.
// 백엔드 완성 전까지 이 mock 으로 UI 를 개발한다.
// ─────────────────────────────────────────────

export const initialHardware = {
  gates: [
    {
      gate_id: 'G01',
      name: '부두 진입 게이트',
      state: 'OPEN',
      mode: 'AUTO',
      beacon: 'GREEN',
      fail_safe_ok: true,
      ts_utc: '2026-07-19T02:00:00Z',
    },
    {
      gate_id: 'G02',
      name: '위험물 구역 게이트',
      state: 'INTERLOCK', // 혼재금지 위반 감지 → 인터락 차단 (데모 시나리오)
      mode: 'AUTO',
      beacon: 'RED',
      fail_safe_ok: true,
      ts_utc: '2026-07-19T01:55:00Z',
    },
  ],
};

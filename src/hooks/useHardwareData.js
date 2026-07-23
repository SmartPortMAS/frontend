import { useCallback, useState } from 'react';
import { initialHardware } from '../mocks/mockHardware';

// 백엔드 /ws/hardware 릴레이가 완성되면 false 로 바꾸고 WebSocket 구독으로 교체
const USE_MOCK = true;

/**
 * 하드웨어 노드(사전 승인 게이트) 상태 훅.
 * sendGateCommand 는 mock 모드에서는 즉시 상태를 바꾸지만,
 * 실제 연동 시에는 백엔드 API 호출(→ MQTT cmd 발행)로 교체한다.
 */
export default function useHardwareData() {
  const [hardware, setHardware] = useState(initialHardware);

  // TODO(실물 연동): USE_MOCK=false 시 /ws/hardware 구독으로 setHardware 갱신
  void USE_MOCK;

  const sendGateCommand = useCallback((gateId, command) => {
    // 실제 구현: POST /api/hardware/gates/{gateId}/cmd { command }
    setHardware((hw) => ({
      ...hw,
      gates: hw.gates.map((g) => {
        if (g.gate_id !== gateId) return g;
        // 인터락 상태는 안전상 원격 승인으로 해제할 수 없다 (하드웨어 페일세이프 규칙)
        if (g.state === 'INTERLOCK' && command === 'APPROVE') return g;
        return {
          ...g,
          state: command === 'APPROVE' ? 'OPEN' : 'CLOSED',
          beacon: command === 'APPROVE' ? 'GREEN' : 'AMBER',
          mode: 'MANUAL',
          ts_utc: new Date().toISOString(),
        };
      }),
    }));
  }, []);

  return { hardware, sendGateCommand };
}

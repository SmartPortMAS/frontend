// ─────────────────────────────────────────────
// 선박별 안전 심사 mock — 온산 MVP 안전 게이트(R1~R15)의 응답 형태를 따른다.
// 결정론: 같은 화물(UN번호) = 같은 결과.
// 백엔드 연동 시 POST /api/v1/safety/assess 응답으로 교체.
// ─────────────────────────────────────────────

const CARGO_GATE_RESULTS = {
  // 부타디엔: 인화성 가스, 인접작업·이월화물 게이트 히트 (검토패키지 3-2 유형)
  UN1010: {
    risk_level: '위험',
    gates_hit: [
      { rule: 'R13', severity: 'HOLD', reason: '인접 선석 하역작업 중 — IMDG 격리코드 요구 이격 미달, 증기운 중첩 위험' },
      { rule: 'R15', severity: 'HOLD', reason: '이월(100% 초과) 화물 — 탱크 잔량 증명 미제출, 배정 보류' },
    ],
  },
  // 벤젠: 독성·인화성 (검토패키지 실측 예시)
  UN1114: {
    risk_level: '위험',
    gates_hit: [
      { rule: 'R13', severity: 'HOLD', reason: '인접 선석 하역 중 벤젠 증기 중첩 위험 — 배정 보류' },
    ],
  },
  UN1294: {
    risk_level: '주의',
    gates_hit: [
      { rule: 'R9', severity: 'WARN', reason: '톨루엔 — 정전기 대전 위험, 접지·유속제한 확인 필요' },
    ],
  },
  UN1203: {
    risk_level: '주의',
    gates_hit: [
      { rule: 'R9', severity: 'WARN', reason: '가솔린 — 고휘발성, 하역 중 가스검지 상시 감시' },
    ],
  },
};

const BASE_CHECKLIST = [
  '하역 전 선체-안벽 접지(bonding) 확인',
  '로딩암/호스 연결부 누출 점검',
  '비상차단밸브(ESD) 작동 확인',
];

const CARGO_CHECKLIST = {
  UN1010: ['부타디엔 중합 억제제 유효성 확인', '가스검지기(LEL) 연속 감시'],
  UN1114: ['벤젠 발암성 — 작업자 호흡보호구 착용 확인', 'H2S/VOC 가스 감지 확인'],
  UN1294: ['정전기 방지 유속 제한 (초기 1m/s) 준수'],
  UN1203: ['증기회수라인(VRS) 연결 확인'],
  UN1170: ['에탄올 수용성 — 소포 소화약제 준비 확인'],
  UN1223: ['등유 — 정전기 축적 주의, 스플래시 로딩 금지'],
};

export function assessVesselSafety(vessel) {
  if (!vessel?.is_liquid_cargo_vessel || !vessel.cargo) {
    return { risk_level: '안전', gates_hit: [], checklist: [], is_mock: true };
  }
  const hit = CARGO_GATE_RESULTS[vessel.cargo.un_no] || { risk_level: '안전', gates_hit: [] };
  return {
    ...hit,
    checklist: [...BASE_CHECKLIST, ...(CARGO_CHECKLIST[vessel.cargo.un_no] || [])],
    is_mock: true,
  };
}

import { COLORS } from './constants';

// ─────────────────────────────────────────────────────────────────────────────
// 관제 경고 공통 유틸 — 헤더 벨(AlertBell)과 안전 페이지 위험 선석 패널
// (ActiveRiskPanel)이 같은 규칙을 쓰도록 한 곳에 모아 둔다.
//
// 특히 alertId 를 두 벌로 두면 안 된다. 확인(ACK) 이력이 이 키로 저장되기 때문에,
// 한쪽에서 확인한 경고가 다른 쪽에서는 미확인으로 남는다.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 확인(ACK) 식별자.
 *
 * 백엔드 경고(GET /dashboard/alerts)는 재항 현황을 매번 다시 판정해 만들기 때문에
 * 생성시각이 없다 — 시각을 키에 쓰면 같은 유형 경고가 전부 한 덩어리로 묶여 하나만
 * 확인해도 전부 확인 처리된다. 선석과 내용(message)까지 넣어야 경고가 구분된다.
 */
export const alertId = (a) =>
  `${a.type}-${a.berth_name ?? ''}-${a.message ?? a.created_at_utc ?? ''}`;

export const LEVEL_STYLE = {
  DANGER: { color: COLORS.red, label: '위험' },
  WARNING: { color: COLORS.yellow, label: '경고' },
  INFO: { color: COLORS.info, label: '정보' },
};

export const levelStyle = (level) => LEVEL_STYLE[level] || LEVEL_STYLE.INFO;

/** 경고 유형 코드 → 화면 표기 */
export const TYPE_LABEL = {
  SEGREGATION: '혼재금지',
  DRAUGHT: '흘수/UKC',
  UNIDENTIFIED_CARGO: '화물 미확인',
};

export const typeLabel = (type) => TYPE_LABEL[type] || type;

export const formatAlertKST = (utc) =>
  utc
    ? new Date(utc).toLocaleString('ko-KR', {
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
        hour12: false, timeZone: 'Asia/Seoul',
      })
    : '-';

/**
 * 경고를 선석 단위로 묶는다. 관제 단위가 선석이기 때문이다 —
 * 한 선석에 혼재금지와 흘수 경고가 같이 뜨면 그건 두 건이 아니라 그 선석 한 곳의 문제다.
 * 가장 무거운 등급을 대표(worst)로 올리고, 위험한 선석이 위로 오게 정렬한다.
 */
export function groupAlertsByBerth(alerts) {
  const byBerth = new Map();
  for (const a of alerts) {
    const key = a.berth_name || '(선석 미상)';
    if (!byBerth.has(key)) byBerth.set(key, { berth: key, items: [], worst: 'INFO' });
    const g = byBerth.get(key);
    g.items.push(a);
    if (a.level === 'DANGER') g.worst = 'DANGER';
    else if (a.level === 'WARNING' && g.worst !== 'DANGER') g.worst = 'WARNING';
  }
  const rank = { DANGER: 0, WARNING: 1, INFO: 2 };
  return [...byBerth.values()].sort((a, b) => rank[a.worst] - rank[b.worst]);
}

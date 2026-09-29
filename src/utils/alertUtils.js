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
  // [2026-09-22] D3 — 같은 선석이 아니라 **옆 부두** 재항 화물과의 충돌.
  // 같은 '혼재금지'로 적으면 관제사가 어디를 봐야 하는지 알 수 없다.
  ADJACENT_SEGREGATION: '인접 선석 혼재',
  // [2026-09-27] 같은 배에 함께 실린 화물쌍 — 선석 판정이 아니라 탱크 배치 확인 대상
  ONBOARD_SEGREGATION: '선내 적부 확인',
  DRAUGHT: '흘수/UKC',
  UNIDENTIFIED_CARGO: '화물 미확인',
  // arrival_watcher 자동배정 결과 — 표기가 없으면 화면에 영문 코드가 그대로 나온다
  ALL_CANDIDATES_UNSAFE: '전 후보 부적합',
  NO_ELIGIBLE_BERTH: '적합 선석 없음',
  // 판정 이력 경고(berth_alerts._assessment_alerts)는 `ASSESSMENT_{등급}` 으로 온다.
  // 표기가 없어 화면에 'ASSESSMENT_부적합' 이 그대로 찍히고 있었다.
  ASSESSMENT_부적합: '판정 부적합',
  ASSESSMENT_주의: '판정 주의',
  ASSESSMENT_판정불가: '판정불가',
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


/**
 * 경고 문구를 "결론"과 "LLM 상세 설명"으로 가른다.
 *
 * arrival_watcher 의 자동배정 경고는 "GRAND WINNER 6: 자동 배정 불가 — 전 후보
 * 배정 불가(안전) (이번에 배정된 선박…다행입니다.)" 처럼 결론 뒤 괄호에 서너
 * 문장의 LLM 설명이 붙는다. 목록에서 전문이 다 펼쳐지면 스캔이 불가능해지므로
 * (2026-08-23 피드백) 결론만 보이고 상세는 펼침으로 넘긴다.
 * 판정 내용은 하나도 버리지 않는다 — 자르는 게 아니라 접는 것이다.
 */
export function splitAlertMessage(message) {
  const msg = message || '';
  const cut = msg.indexOf(' (');
  // 괄호가 없거나 짧은 부가어(단위·코드 등)면 그대로 둔다
  if (cut === -1 || msg.length - cut < 60) return { head: msg, detail: null };
  return {
    head: msg.slice(0, cut),
    detail: msg.slice(cut + 2).replace(/\)\s*$/, ''),
  };
}


/**
 * 경고 결론을 "대상"과 "판정"으로 한 번 더 가른다.
 *
 * 자동배정 경고의 결론은 "RYOUMEI MARU: 자동 배정 불가 — 전 후보 배정 불가(안전)"
 * 처럼 '대상: 판정' 꼴이다. 3D 상단 배너처럼 폭이 좁은 자리에서는 대상과 판정을
 * 따로 세워야 눈이 잡는다 — 한 줄로 이으면 결국 줄글이 된다.
 */
export function alertSubject(alert) {
  const { head } = splitAlertMessage(alert?.message);
  const cut = head.indexOf(': ');
  if (cut === -1) return { subject: alert?.berth_name || '', verdict: head };
  return { subject: head.slice(0, cut), verdict: head.slice(cut + 2) };
}


// ─────────────────────────────────────────────────────────────────────────────
// [2026-09-29 밤] 경고 문장을 칸으로 가른다 — 줄글 한 덩어리는 읽히지 않았다(현우).
//   판정 경고  "[입항전] 한유울산 @ OTK1부두: 부적합 — 이유 → 대체선석 검토 필요(선석운영주체)"
//   혼재 경고  "4부두: 황산 ↔ 디젤 연료 혼재금지(가연성물질) → 위험 외 4쌍"
//   인접 참고  "3부두: 아이소부텐 ↔ 인접 4부두(150m) 옥타메틸… — IMDG 격리코드 2 (참고 …)"
//   흘수 경고  "대한유화부두: 9VDY7 흘수 여유 부족 (UKC 1.07 m, MARGINAL)"
// 서버 문장은 버리지 않는다 — 전체 문장은 마우스를 올리면 보인다.
// ─────────────────────────────────────────────────────────────────────────────
const STAGE_KO = { 입항전: '입항 전', 접안직전: '접안 직전', 하역중: '하역 중' };

function shortWhy(why) {
  const t = why || '';
  if (/혼재 충돌/.test(t)) return '이웃 화물과 혼재 충돌';
  if (/혼재 등급이 '주의'/.test(t)) return '이웃 화물 혼재 주의';
  if (/찾을 수 없습니다|마스터 미등록/.test(t)) return '선석 자료 없음';
  if (/화물을 식별/.test(t)) return '화물 미확인';
  if (/항해상태/.test(t)) return '항해 상태 미확인';
  if (/흘수|수심|UKC/.test(t)) return '수심 여유 부족';
  if (/풍속|파고|기상|관측/.test(t)) return '기상 기준';
  return t.length > 34 ? `${t.slice(0, 33)}…` : t;
}

export function alertParts(alert, nameOf = () => null) {
  const msg = alert?.message || '';
  let m = msg.match(/^\[(입항전|접안직전|하역중)\]\s*(.+?)\s*@\s*(.+?):\s*(부적합|주의|판정불가)\s*—\s*(.+)$/);
  if (m) {
    const [, stage, vessel, berth, level, rest] = m;
    const [why, act] = rest.split(/\s*→\s*/);
    const am = (act || '').match(/^(.+?)\((.+?)\)\s*\.?$/);
    return {
      kind: 'verdict', title: vessel, place: berth, stage: STAGE_KO[stage], level,
      why: shortWhy(why), action: am ? am[1].replace(/\s*검토 필요\s*$/, '').trim() : null, recipient: am ? am[2] : null, full: msg,
    };
  }
  if (alert?.type === 'SEGREGATION' || alert?.type === 'ONBOARD_SEGREGATION') {
    m = msg.match(/^(.+?):\s*(.+?)\s*↔\s*(.+?)\s*혼재금지(?:\((.+?)\))?/);
    if (m) {
      const more = (alert.pair_count || 1) - 1;
      return {
        kind: 'pair', title: `${m[2]} ↔ ${m[3]}`, place: alert.berth_name || m[1], level: alert.risk_level || null,
        why: ['혼재금지', m[4], more > 0 ? `외 ${more}쌍` : null].filter(Boolean).join(' · '), details: alert.details || [], full: msg,
      };
    }
  }
  if (alert?.type === 'ADJACENT_SEGREGATION') {
    m = msg.match(/^(.+?):\s*(.+?)\s*↔\s*인접\s*(.+?)\((\d+)m\)\s*(.+?)\s*—/);
    if (m) {
      return { kind: 'pair', title: `${m[2]} ↔ ${m[5]}`, place: `${m[1]} ↔ ${m[3]}`, level: null, why: `이웃 선석 ${m[4]} m`, full: msg };
    }
  }
  if (alert?.type === 'DRAUGHT') {
    m = msg.match(/^(.+?):\s*(\S+)\s*흘수 여유 부족\s*\(UKC\s*([\d.]+)\s*m/);
    if (m) {
      return { kind: 'draught', title: nameOf(m[2]) || m[2], place: m[1], level: null, why: `흘수 여유 ${m[3]} m`, full: msg };
    }
  }
  const { head } = splitAlertMessage(msg);
  const cut = head.indexOf(': ');
  return cut === -1
    ? { kind: 'plain', title: alert?.berth_name || typeLabel(alert?.type), place: null, why: head, full: msg }
    : { kind: 'plain', title: head.slice(0, cut), place: alert?.berth_name && alert.berth_name !== head.slice(0, cut) ? alert.berth_name : null, why: head.slice(cut + 2), full: msg };
}

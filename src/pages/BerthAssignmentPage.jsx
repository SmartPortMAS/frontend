import { useCallback, useEffect, useState } from 'react';
import BerthAssignmentMap from '../components/dashboard/BerthAssignmentMap';
import { fetchBerthAssignments } from '../api/backendAdapter';
import { COLORS } from '../utils/constants';
import useSensorStore from '../stores/useSensorStore';

function formatKST(iso) {
  return new Date(iso).toLocaleString('ko-KR', { hour12: false, timeZone: 'Asia/Seoul' });
}

// 판정 등급 색 — 지도 팝업(BerthAssignmentMap VERDICT_BG)과 같은 값을 쓴다.
// 두 화면이 같은 등급을 다른 색으로 칠하면 관제사가 둘을 대조할 수 없다.
const VERDICT_COLOR = {
  '적합': COLORS.teal,
  '주의': COLORS.yellow,
  '부적합': COLORS.red,
  '판정불가': COLORS.yellow,
};

// 실제 입출항(portmis_vessel 우선, 없으면 upa_port_call, call_sign 대조)을 쓴다.
//
// departure_scheduled_utc는 PORT-MIS가 입항 시점에 이미 받아 둔 출항 신고
// 시각이다 — 아직 실제 출항 전이어도 "언제쯤 이 자리가 빌지" 보여줄 수 있다
// (2026-08-20, "출항시간 기준으로 자리를 비워야" 요청).
//
// [2026-09-22] planned_window(window_start/window_end) 대체 경로를 걷어냈다.
// 그 두 필드는 예약(berth_assignment)이 있던 시절의 것이고 지금
// GET /dashboard/berth-assignments 응답에 아예 없다(실측 — 슬롯 키 22개 중
// 없음). 없는 필드를 보는 분기라 한 번도 탄 적이 없다. 입항 실측이 아직
// 안 잡힌 배는 '-'가 아니라 접안 판정 근거를 대신 적는다 — 그 배가 왜
// 여기 있다고 보는지는 말할 수 있어야 한다.
function periodLabel(row) {
  if (row.actual_arrival_utc) {
    const departurePart = row.actual_departure_utc
      ? `출항 ${formatKST(row.actual_departure_utc)}`
      : row.departure_scheduled_utc
        ? `출항예정 ${formatKST(row.departure_scheduled_utc)}`
        : '(재항 중)';
    return `입항 ${formatKST(row.actual_arrival_utc)} ~ ${departurePart}`;
  }
  // PORT-MIS 입출항 신고가 아직 안 잡힌 배 — 위치 판정으로만 접안을 안다.
  if (row.berth_basis) {
    const age = row.position_age_min != null ? ` · ${row.position_age_min}분 전 관측` : '';
    return `입항신고 미확인 (${row.berth_basis} 판정${age})`;
  }
  return '-';
}

// 나갔어야 할 시각이 지났는데 아직 이 자리에 잡혀 있는 배가 며칠째인지.
// 실제 항만에서는 출항하면 그 자리가 바로 비고 다음 배가 들어온다 — 출항
// 예정이 지났는데 여전히 "점유 중"이면 그건 현재 상태가 아니라 닫히지 않은
// 기록일 수 있다. 화면이 그걸 "지금 접안 중"인 것처럼 보여주면 안 되므로
// 경과일을 같이 띄운다(2026-09-08 실측 — 7건 전부 8/25에 기간이 끝나 있었다).
//
// [2026-09-22] 기준을 window_end -> departure_scheduled_utc 로 바꿨다.
// window_end 는 응답에 없는 필드라 이 함수는 추가된 커밋(27aa32a, "배정 경과일
// 표시")부터 지금까지 **항상 0** 이었다 — 뱃지가 한 번도 뜬 적이 없다.
// departure_scheduled_utc 는 PORT-MIS 출항 신고 시각이고 실제로 내려온다
// (실측 3건 모두 값 있음). "언제 나가기로 했나"가 곧 "언제 비었어야 하나"다.
function overdueDays(row) {
  if (row.actual_departure_utc) return 0;   // 실제로 나갔으면 경과가 아니다
  const end = row.departure_scheduled_utc;
  if (!end) return 0;
  const days = Math.floor((Date.now() - new Date(end).getTime()) / 86400000);
  return days > 0 ? days : 0;
}

// 08_스케줄링_전면재설계_자동배정_설계문서.md §7.2 — 선석 배정현황 페이지.
// 지도는 "어디"를, 아래 목록은 "지금 뭐가 차 있는지"를 보여주는 읽기전용
// 화면이다 — 승인/반려는 여기서 하지 않는다.
//
// [2026-08-19] 승인 액션을 이 페이지에서 뺐다. 원래 지도 팝업(SlotRow)의 승인
// 버튼은 /dashboard/berth-assignments 응답에 assignment_id가 없어 항상
// "undefined"로 호출되며 실패했다(관제사가 실제로 겪은 버그: 승인 눌러도
// [object Object] 에러만 뜸). 게다가 종합에이전트 콘솔(AgentConsole)에도
// 겉보기엔 똑같이 생긴 승인/반려 버튼이 있어, 관제사 입장에서 "어느 쪽이
// 진짜 승인인가"가 애초에 불명확했다. 승인 액션의 유일한 지점을 콘솔 쪽으로
// 정리했다(콘솔은 이미 "종합에이전트 판단 → 관제사 승인"이라는 §5.3 흐름 그대로다).
//
// [2026-08-19 재수정] "승인 대기 목록"(GET /approvals/pending)을 없앴다 — 위
// 지도가 이제 REQUESTED/APPROVED를 구분하지 않고 "점유 여부"만 보여주는
// 것과 같은 이유다. 이 목록도 지도와 같은 질문("지금 뭐가 배정돼 있나")에
// 맞춰 GET /dashboard/berth-assignments 기준 점유 목록으로 바꿨다.

function OccupiedList({ scope }) {
  const [berths, setBerths] = useState([]);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setBerths(await fetchBerthAssignments());
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  // 선석×슬롯 구조를 평평한 행 목록으로 편다 — 이 표는 "지금 뭐가 어디 붙어
  // 있나"만 보면 되므로 빈 슬롯은 뺀다.
  const requestConsole = useSensorStore((st) => st.requestConsole);
  // 지도와 목록이 같은 스코프를 본다 — 지도만 온산인데 목록은 전체면 숫자가 안 맞는다

  const scopedBerths = scope === 'onsan'
    ? berths.filter((b) => b.port_name === '온산항')
    : berths;
  // [2026-09-22] 점유 판단을 status -> call_sign 으로 바꿨다. 지도가 d681dea 에서
  // 먼저 옮겨간 계약을 이 목록만 따라가지 못하고 있었다.
  //
  //   status 는 이제 **배정 상태가 아니라 판정 등급**(적합/주의/부적합/판정불가)
  //   이고, 아직 판정 전이면 null 이다. 그걸 점유 조건으로 쓰면 "배는 붙어 있는데
  //   판정이 아직 없는" 슬롯이 통째로 사라진다 — 실측으로 접안 6척 중 3척이
  //   목록에서 빠져 있었고, 위 지도는 같은 순간 6을 세고 있었다(6 vs 3).
  //   판정이 하나도 없는 시점이면 배가 붙어 있어도 목록이 완전히 빈다.
  //
  //   "지금 뭐가 차 있나"의 답은 판정 유무가 아니라 배의 유무다.
  const rows = scopedBerths
    .flatMap((b) => b.slots
      .filter((s) => s.call_sign)
      .map((s) => ({ wharf_name: b.wharf_name, ...s })))
    .sort((a, b) => a.wharf_name.localeCompare(b.wharf_name, 'ko'));

  return (
    <div className="glass-card">
      <div className="glass-card-header">
        <h3 className="glass-card-title">선석 점유 목록 ({rows.length}건)</h3>
      </div>
      {error && <p style={{ color: COLORS.red, fontSize: '13px' }}>{error}</p>}
      {rows.length === 0 ? (
        <p style={{ color: COLORS.textDim, fontSize: '13px' }}>점유 중인 선석이 없습니다.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: COLORS.textDim, borderBottom: `1px solid ${COLORS.border}` }}>
              <th style={{ padding: '6px 8px' }}>선석</th>
              <th style={{ padding: '6px 8px' }}>선박</th>
              <th style={{ padding: '6px 8px' }}>화물</th>
              <th style={{ padding: '6px 8px' }}>입출항</th>
              {/* '승인자'가 아니라 '확인자'다 — 이 시스템은 선석을 배정하지 않으므로
                  승인할 대상이 없다. 남는 기록은 "관제사가 이 판정을 봤다"뿐이고,
                  그 값은 acknowledged_by 로 내려온다(응답에 approved_by 는 없다). */}
              <th style={{ padding: '6px 8px' }}>확인자</th>
              <th style={{ padding: '6px 8px' }}>판정</th>
            </tr>
          </thead>
          <tbody>
            {/* key 는 assignment_id 였는데 그 필드는 응답에 없다(위 2026-08-19
                주석이 이미 적어 둔 사실이다) — 늘 undefined 라, 한 부두에 배가
                둘 붙는 순간 키가 겹친다. 선석·슬롯은 이 표에서 언제나 유일하다. */}
            {rows.map((row) => (
              <tr key={`${row.wharf_name}-${row.slot_no}`} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                <td style={{ padding: '6px 8px' }}>{row.wharf_name}{row.slot_no ? ` · 슬롯${row.slot_no}` : ''}</td>
                <td style={{ padding: '6px 8px' }}>{row.vessel_name || '(선명 미상)'} ({row.call_sign || '-'})</td>
                <td style={{ padding: '6px 8px', color: COLORS.textSecondary }}>{row.cargo_name || '-'}</td>
                <td style={{ padding: '6px 8px', color: COLORS.textDim }}>{periodLabel(row)}</td>
                <td style={{ padding: '6px 8px', color: COLORS.textDim }}>{row.acknowledged_by || '-'}</td>
                <td style={{ padding: '6px 8px' }}>
                  {/* 판정 전인 행에서 바로 콘솔로 — 예전엔 이 화면이 "승인은 협상
                      로그에서"라고 안내만 하고 이동 수단이 없어, 대시보드로 돌아가
                      그 배를 다시 찾아야 했다(③↔④ 왕복). 클릭하면 콘솔이 이
                      실선박을 대상으로 열린다 — 판정은 콘솔에서 새로 실행한다.

                      [2026-09-22] 조건을 status === 'REQUESTED' 에서 "판정이 없다"로
                      바꿨다. status 는 이제 판정 등급이라 'REQUESTED' 가 나올 수
                      없고(backend approvals.py: 적합|주의|부적합|판정불가), 이
                      버튼은 계약이 바뀐 뒤로 한 번도 뜬 적이 없다 — 행에서 콘솔로
                      가는 길이 끊겨 있었다. 지금 콘솔이 필요한 행은 "배는 붙어
                      있는데 아직 판정이 없는" 행이므로, 그 조건이 곧 이 버튼이다. */}
                  {!row.status ? (
                    <button
                      type="button"
                      onClick={() => requestConsole(row.call_sign, {
                        // 이 선석이 실제로 취급 중인 화물 — 콘솔이 같은 것으로 판정하게 한다
                        chem_id: row.cargo_chem_id,
                        name: row.cargo_name,
                      })}
                      title={`${row.vessel_name || row.call_sign} 을(를) 판단 과정 로그에서 판정`}
                      style={{
                        border: `1px solid ${COLORS.yellow}`, background: 'transparent',
                        color: COLORS.yellow, borderRadius: '6px', padding: '2px 8px',
                        fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      판정 전 — 판단 과정 로그 →
                    </button>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      {/* 등급별 색 — 지도 팝업(BerthAssignmentMap VERDICT_BG)과 같은 표다.
                          예전엔 무엇이든 teal(적합 색)로 칠해 '부적합'이 안전해 보였다. */}
                      <span style={{ color: VERDICT_COLOR[row.status] ?? COLORS.textPrimary, fontSize: '12px', fontWeight: 700 }}>
                        {row.status}
                      </span>
                      {overdueDays(row) > 0 && (
                        <span
                          title="PORT-MIS 출항 신고 시각이 지났는데 아직 이 선석에 잡혀 있습니다 — 현재 점유가 아닐 수 있습니다"
                          style={{
                            color: COLORS.yellow, fontSize: '11px', fontWeight: 700,
                            border: `1px solid ${COLORS.yellow}`, borderRadius: '4px', padding: '1px 5px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          출항예정 {overdueDays(row)}일 경과
                        </span>
                      )}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function BerthAssignmentPage() {
  // 기본 스코프는 온산항 — 이 시스템의 관제 대상(2026-08-23 피드백)
  const [scope, setScope] = useState('onsan');
  return (
    <div className="dashboard-page">
      <div className="glass-card dash-section">
        <div className="glass-card-header">
          <h3 className="glass-card-title">선석 배정현황</h3>
        </div>
        <div style={{ height: 'clamp(460px, 62vh, 760px)' }}>
          <BerthAssignmentMap scope={scope} onScopeChange={setScope} />
        </div>
      </div>

      <div className="dash-section">
        <OccupiedList scope={scope} />
      </div>
    </div>
  );
}

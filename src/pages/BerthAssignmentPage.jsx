import { useCallback, useEffect, useState } from 'react';
import BerthAssignmentMap from '../components/dashboard/BerthAssignmentMap';
import { fetchBerthAssignments } from '../api/backendAdapter';
import { COLORS } from '../utils/constants';

function formatKST(iso) {
  return new Date(iso).toLocaleString('ko-KR', { hour12: false, timeZone: 'Asia/Seoul' });
}

// 실제 입출항(portmis_vessel 우선, 없으면 upa_port_call, call_sign 대조)을
// 우선 쓰고, 아직 실측이 안 잡힌 배정(막 추천/승인된 미래 방문)만 계획값
// (planned_window)으로 대체한다 — 2026-08-19 "입항/출항시간 있지 않냐" 지적.
// 계획값을 쓸 땐 "예정"이라고 명시해서 실측과 헷갈리지 않게 한다.
//
// departure_scheduled_utc는 PORT-MIS가 입항 시점에 이미 받아 둔 출항 신고
// 시각이다 — 아직 실제 출항 전이어도 "언제쯤 이 자리가 빌지" 보여줄 수 있다
// (2026-08-20, "출항시간 기준으로 자리를 비워야" 요청).
function periodLabel(row) {
  if (row.actual_arrival_utc) {
    const departurePart = row.actual_departure_utc
      ? `출항 ${formatKST(row.actual_departure_utc)}`
      : row.departure_scheduled_utc
        ? `출항예정 ${formatKST(row.departure_scheduled_utc)}`
        : '(재항 중)';
    return `입항 ${formatKST(row.actual_arrival_utc)} ~ ${departurePart}`;
  }
  if (row.window_start) {
    return `${formatKST(row.window_start)} ~ ${row.window_end ? formatKST(row.window_end) : '-'} (예정)`;
  }
  return '-';
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

function OccupiedList() {
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
  const rows = berths
    .flatMap((b) => b.slots
      .filter((s) => s.status)
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
              <th style={{ padding: '6px 8px' }}>승인자</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.wharf_name}-${row.assignment_id}`} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                <td style={{ padding: '6px 8px' }}>{row.wharf_name}{row.slot_no ? ` · 슬롯${row.slot_no}` : ''}</td>
                <td style={{ padding: '6px 8px' }}>{row.vessel_name || '(선명 미상)'} ({row.call_sign || '-'})</td>
                <td style={{ padding: '6px 8px', color: COLORS.textSecondary }}>{row.cargo_name || '-'}</td>
                <td style={{ padding: '6px 8px', color: COLORS.textDim }}>{periodLabel(row)}</td>
                <td style={{ padding: '6px 8px', color: COLORS.textDim }}>{row.approved_by || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function BerthAssignmentPage() {
  return (
    <div className="dashboard-page">
      <div className="glass-card dash-section">
        <div className="glass-card-header">
          <h3 className="glass-card-title">선석 배정현황</h3>
        </div>
        <div style={{ height: 'clamp(460px, 62vh, 760px)' }}>
          <BerthAssignmentMap />
        </div>
      </div>

      <div className="dash-section">
        <OccupiedList />
      </div>
    </div>
  );
}

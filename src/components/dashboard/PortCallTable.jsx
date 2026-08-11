import { useEffect, useMemo, useState } from 'react';
import useDashboardData from '../../hooks/useDashboardData';
import useSensorStore from '../../stores/useSensorStore';
import { COLORS, NAV_STATUS } from '../../utils/constants';

const formatKST = (utcString) => {
  if (!utcString) return '-';
  return new Date(utcString).toLocaleString('ko-KR', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hour12: false, timeZone: 'Asia/Seoul',
  });
};

const cellStyle = {
  padding: '10px 12px', fontSize: '13px', whiteSpace: 'nowrap',
  overflow: 'hidden', textOverflow: 'ellipsis',
};
const headStyle = {
  ...cellStyle,
  color: COLORS.textSecondary,
  fontWeight: 'bold',
  textAlign: 'left',
  borderBottom: `1px solid ${COLORS.border}`,
  userSelect: 'none',
  cursor: 'pointer',
};

const PAGE_SIZE = 10;

// 컬럼별 정렬값 추출 — real_traffic(backendAdapter.mapVessel) 필드 기준.
// 문자열/숫자를 섞어 반환해도 compareVessels가 타입에 맞게 비교한다.
// width: table-layout:fixed 에서 쓸 고정 비율 (합계 100%) — 정렬 시 내용 길이에 따라
// 컬럼 폭이 흔들리던 문제를 없애기 위함.
const COLUMNS = [
  { key: 'vessel_name', label: '선박명', width: '20%', getValue: (v) => v.vessel_name ?? '' },
  { key: 'callsgn', label: '호출부호', width: '10%', getValue: (v) => v.callsgn ?? '' },
  { key: 'nav_status_category', label: '상태', width: '10%', getValue: (v) => (NAV_STATUS[v.nav_status_category] || NAV_STATUS.UNKNOWN).label },
  { key: 'cargo', label: '화물', width: '20%', getValue: (v) => v.cargo?.name ?? '일반화물' },
  { key: 'berth', label: '배정 선석', width: '16%', getValue: (v) => v.berth ?? (v.anchorage ? `정박지 ${v.anchorage}` : '') },
  { key: 'sog', label: '속력', width: '8%', getValue: (v) => v.sog ?? 0 },
  { key: 'received_at_utc', label: '최근 수신 (KST)', width: '16%', getValue: (v) => (v.received_at_utc ? new Date(v.received_at_utc).getTime() : 0) },
];

function compareVessels(a, b, getValue) {
  const av = getValue(a);
  const bv = getValue(b);
  if (typeof av === 'number' && typeof bv === 'number') return av - bv;
  return String(av).localeCompare(String(bv), 'ko');
}

export default function PortCallTable() {
  const { data } = useDashboardData();
  const setSelectedVessel = useSensorStore((s) => s.setSelectedVessel);

  // 최근 수신 순 기본 정렬 — 이전 동작(입항 최신순 정렬)과 동일한 기본값 유지.
  const [sort, setSort] = useState({ key: 'received_at_utc', dir: 'desc' });
  const [page, setPage] = useState(1);

  const handleSort = (key) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
    setPage(1);
  };

  // 실데이터(data.real_traffic, backendAdapter.mapVessel) 사용 — mock인 data.vessels는 미사용.
  const vessels = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sort.key);
    const list = [...(data?.real_traffic ?? [])];
    list.sort((a, b) => {
      const cmp = compareVessels(a, b, col.getValue);
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [data, sort]);

  const totalPages = Math.max(1, Math.ceil(vessels.length / PAGE_SIZE));
  // 정렬/데이터 갱신으로 목록이 줄어들면 마지막 페이지로 보정
  const currentPage = Math.min(page, totalPages);
  useEffect(() => {
    if (page !== currentPage) setPage(currentPage);
  }, [currentPage, page]);
  const pageVessels = vessels.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="glass-card">
      <div className="glass-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 className="glass-card-title">입항 선박 목록</h3>
        <span style={{ fontSize: '12px', color: COLORS.textDim }}>
          총 {vessels.length}척 · 위험물선 {vessels.filter((v) => v.is_liquid_cargo_vessel).length}척
        </span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', color: COLORS.textPrimary }}>
          <colgroup>
            {COLUMNS.map((col) => <col key={col.key} style={{ width: col.width }} />)}
          </colgroup>
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th key={col.key} style={headStyle} onClick={() => handleSort(col.key)} title="클릭하면 정렬됩니다">
                  {col.label}
                  {sort.key === col.key && (
                    <span style={{ marginLeft: '4px', color: COLORS.teal }}>{sort.dir === 'asc' ? '▲' : '▼'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageVessels.map((v) => {
              const status = NAV_STATUS[v.nav_status_category] || NAV_STATUS.UNKNOWN;
              return (
                <tr
                  key={v.port_call_id}
                  onClick={() => setSelectedVessel(v)}
                  style={{ borderBottom: `1px solid rgba(78, 205, 196, 0.06)`, cursor: 'pointer' }}
                  title="클릭하면 선박 상세 패널이 열립니다"
                >
                  <td style={{ ...cellStyle, fontWeight: 'bold' }}>
                    {v.vessel_name}
                    {v.is_liquid_cargo_vessel && (
                      <span style={{
                        marginLeft: '8px', background: COLORS.red, color: '#fff',
                        borderRadius: '4px', padding: '1px 6px', fontSize: '11px',
                      }}>위험물</span>
                    )}
                  </td>
                  <td style={{ ...cellStyle, color: COLORS.textSecondary }}>{v.callsgn}</td>
                  <td style={cellStyle}>
                    <span style={{
                      color: status.color, border: `1px solid ${status.color}`,
                      borderRadius: '999px', padding: '2px 10px', fontSize: '12px',
                    }}>
                      {status.label}
                    </span>
                  </td>
                  <td style={cellStyle}>
                    {v.cargo ? `${v.cargo.name} (${v.cargo.un_no})` : '일반화물'}
                  </td>
                  <td style={cellStyle}>
                    {v.berth
                      ? v.berth
                      : v.anchorage
                        ? <span style={{ color: COLORS.yellow }}>정박지 {v.anchorage} 대기</span>
                        : <span style={{ color: COLORS.textDim }}>-</span>}
                  </td>
                  <td style={{ ...cellStyle, color: COLORS.textSecondary }}>{v.sog} kn</td>
                  <td style={{ ...cellStyle, color: COLORS.textSecondary }}>{formatKST(v.received_at_utc)}</td>
                </tr>
              );
            })}
            {pageVessels.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} style={{ ...cellStyle, color: COLORS.textDim, textAlign: 'center', padding: '24px' }}>
                  표시할 선박이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', padding: '10px 0 4px' }}>
          <button
            onClick={() => setPage(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            style={pagerButtonStyle(currentPage <= 1)}
          >
            이전
          </button>
          <span style={{ fontSize: '12px', color: COLORS.textSecondary }}>
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
            style={pagerButtonStyle(currentPage >= totalPages)}
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}

function pagerButtonStyle(disabled) {
  return {
    background: 'transparent',
    border: `1px solid ${COLORS.border}`,
    color: disabled ? COLORS.textDim : COLORS.textPrimary,
    borderRadius: '6px',
    padding: '4px 12px',
    fontSize: '12px',
    cursor: disabled ? 'default' : 'pointer',
  };
}

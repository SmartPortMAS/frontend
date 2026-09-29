import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import useSensorStore from '../../stores/useSensorStore';
import useDashboardData from '../../hooks/useDashboardData';
import { COLORS } from '../../utils/constants';
import { alertId, LEVEL_STYLE, levelStyle, alertParts } from '../../utils/alertUtils';
import { FaExclamationTriangle, FaCheck, FaTimes, FaChevronRight } from 'react-icons/fa';

// ─────────────────────────────────────────────────────────────────────────────
// 관제 경고 — 헤더 알림 벨 + 드롭다운
//
// 경고는 "항상 보고 있어야 하는 것"이 아니라 "떴을 때 열어보는 것"이므로 헤더 벨로 접는다.
// 미확인 건수는 벨 배지로 항상 보인다.
//
// [2026-09-29 밤] 줄글 한 덩어리를 칸으로 갈랐다(현우) — 대상(선박·화물쌍) / 선석 · 시점 / 이유 / 조치 → 받는 곳.
//   아래 회색 줄(자료 출처 이름)은 뺐다. 위 등급 수는 누르면 그 등급만 본다.
//   줄을 누르면 그 경고를 처리하는 화면으로 간다 — 판정 경고는 선박 판정(그 배), 화물 경고는 혼재 심사(그 선석).
//
// 화물 혼재 심사 화면(/safety)에서는 벨을 띄우지 않는다. 그 화면 오른쪽이 같은 경고를 선석 단위로 펼쳐 놓았다.
// ─────────────────────────────────────────────────────────────────────────────

const ALERT_OWNED_PATHS = ['/safety'];
const LEVEL_TONE = { 부적합: COLORS.red, 주의: COLORS.yellow, 판정불가: COLORS.textSecondary };

export default function AlertBell() {
  const { data } = useDashboardData();
  const alertAcks = useSensorStore((s) => s.alertAcks);
  const ackAlert = useSensorStore((s) => s.ackAlert);
  const trackVessel = useSensorStore((s) => s.trackVessel);
  const requestThreadFocus = useSensorStore((s) => s.requestThreadFocus);
  const setSafetyPrefill = useSensorStore((s) => s.setSafetyPrefill);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const ownedByPage = ALERT_OWNED_PATHS.includes(pathname);

  const [open, setOpen] = useState(false);
  const [only, setOnly] = useState(null);   // 'DANGER' | 'WARNING' | 'INFO' | null
  const wrapRef = useRef(null);

  const alerts = data?.alerts ?? [];
  const vessels = data?.real_traffic ?? [];
  const nameOf = (cs) => vessels.find((v) => v.callsgn === cs)?.vessel_name || null;
  // 배지 숫자는 참고(INFO)를 뺀 실제 경고만 센다. 참고 항목도 목록에는 남는다.
  const warnings = alerts.filter((a) => a.level !== 'INFO');
  const unacked = warnings.filter((a) => !alertAcks[alertId(a)]);

  const counts = alerts.reduce((acc, a) => {
    const key = LEVEL_STYLE[a.level] ? a.level : 'INFO';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  useEffect(() => {
    if (ownedByPage) setOpen(false);
  }, [ownedByPage]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // 경고를 처리하는 화면으로 — 판정 경고는 그 배의 선박 판정, 화물 경고는 그 선석의 혼재 심사
  const openAlert = (a, parts) => {
    const cs = (a.callsgns || [])[0];
    if (parts.kind === 'verdict' || parts.kind === 'draught') {
      if (cs) trackVessel({ callsgn: cs, vessel_name: parts.title });
      requestThreadFocus('verdict');
      navigate('/arrivals');
    } else if (a.berth_name) {
      setSafetyPrefill({ berth_name: a.berth_name, chem_ids: a.chem_ids || [] });
      navigate('/safety');
    }
    setOpen(false);
  };

  // 미확인을 위로 — 확인한 건 아래로 내려 흐리게 남긴다
  const ordered = [...alerts]
    .filter((a) => !only || (LEVEL_STYLE[a.level] ? a.level : 'INFO') === only)
    .sort((a, b) => (alertAcks[alertId(a)] ? 1 : 0) - (alertAcks[alertId(b)] ? 1 : 0));

  if (ownedByPage) return null;

  return (
    <div className="alert-bell" ref={wrapRef}>
      <button
        type="button"
        className="header-badge alert-badge"
        onClick={() => setOpen((v) => !v)}
        title={`관제 경고 ${warnings.length}건 · 미확인 ${unacked.length}건`}
        aria-expanded={open}
      >
        <FaExclamationTriangle color={unacked.length > 0 ? COLORS.red : COLORS.textSecondary} />
        <span style={{ fontSize: '12px', color: unacked.length > 0 ? COLORS.red : COLORS.textSecondary }}>
          경고 {warnings.length}
        </span>
        {unacked.length > 0 && <span className="alert-count">{unacked.length}</span>}
      </button>

      {open && (
        <div className="alert-dropdown">
          <div className="alert-dropdown-head">
            <strong style={{ fontSize: '14px' }}>관제 경고</strong>
            <div className="alert-filter" role="group" aria-label="등급">
              {['DANGER', 'WARNING', 'INFO'].filter((lv) => counts[lv]).map((lv) => (
                <button
                  key={lv} type="button" aria-pressed={only === lv}
                  onClick={() => setOnly((cur) => (cur === lv ? null : lv))}
                  style={{ '--tone': LEVEL_STYLE[lv].color }}
                >
                  {LEVEL_STYLE[lv].label} <b>{counts[lv]}</b>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
              {unacked.length > 0 && (
                <button type="button" className="alert-dropdown-allack" onClick={() => unacked.forEach((a) => ackAlert(alertId(a)))}>
                  모두 확인
                </button>
              )}
              <button type="button" className="alert-dropdown-close" onClick={() => setOpen(false)} title="닫기">
                <FaTimes />
              </button>
            </div>
          </div>

          <div className="alert-dropdown-list">
            {ordered.length === 0 && (
              <div style={{ color: COLORS.textDim, fontSize: '13px', padding: '18px', textAlign: 'center' }}>
                활성 경고 없음
              </div>
            )}
            {ordered.map((a) => {
              const id = alertId(a);
              const ack = alertAcks[id];
              const style = levelStyle(a.level);
              const p = alertParts(a, nameOf);
              const canOpen = p.kind === 'verdict' || p.kind === 'draught' || Boolean(a.berth_name);
              return (
                <div
                  key={id}
                  className={`alert-card${canOpen ? ' can-open' : ''}`}
                  style={{ borderLeftColor: style.color, opacity: ack ? 0.45 : 1 }}
                  title={p.full}
                  role={canOpen ? 'button' : undefined}
                  tabIndex={canOpen ? 0 : undefined}
                  onClick={canOpen ? () => openAlert(a, p) : undefined}
                  onKeyDown={canOpen ? (e) => { if (e.key === 'Enter') openAlert(a, p); } : undefined}
                >
                  <div className="alert-card-top">
                    <span className="alert-row-level" style={{ color: style.color, borderColor: style.color }}>{style.label}</span>
                    <strong className="alert-card-title">{p.title}</strong>
                    {p.level && <span className="alert-card-level" style={{ color: LEVEL_TONE[p.level] || style.color }}>{p.level}</span>}
                    {canOpen && <FaChevronRight className="alert-card-go" aria-hidden="true" />}
                  </div>
                  <dl className="alert-card-grid">
                    {p.place && (<><dt>선석</dt><dd>{p.place}{p.stage ? <span className="alert-card-stage">{p.stage}</span> : null}</dd></>)}
                    {p.why && (<><dt>이유</dt><dd>{p.why}</dd></>)}
                    {p.action && (<><dt>조치</dt><dd>{p.action}{p.recipient ? <> → <b>{p.recipient}</b></> : null}</dd></>)}
                  </dl>
                  {p.details?.length > 1 && (
                    <details className="alert-card-more" onClick={(e) => e.stopPropagation()}>
                      <summary>화물쌍 {p.details.length}건</summary>
                      <ul>{p.details.map((d) => <li key={d}>{d}</li>)}</ul>
                    </details>
                  )}
                  <div className="alert-card-ack">
                    {ack
                      ? <span style={{ color: COLORS.teal, fontSize: 11.5, fontWeight: 700 }}>✓ {ack.by}</span>
                      : (
                        <button
                          type="button" className="alert-row-btn alert-row-btn--ack" title="확인 처리"
                          onClick={(e) => { e.stopPropagation(); ackAlert(id); }}
                        >
                          <FaCheck />
                        </button>
                      )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

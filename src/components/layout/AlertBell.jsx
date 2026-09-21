import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import useSensorStore from '../../stores/useSensorStore';
import useDashboardData from '../../hooks/useDashboardData';
import { COLORS } from '../../utils/constants';
import { alertId, LEVEL_STYLE, levelStyle, typeLabel, formatAlertKST, splitAlertMessage } from '../../utils/alertUtils';
import { FaExclamationTriangle, FaCheck, FaShip, FaTimes, FaShieldAlt } from 'react-icons/fa';

// ─────────────────────────────────────────────────────────────────────────────
// 관제 경고 — 헤더 알림 벨 + 드롭다운
//
// 예전에는 대시보드 본문 맨 위에 "경고 센터" 카드로 펼쳐져 있었다. 경고가
// 재항 전수 판정으로 늘어나면서(2026-08-15 기준 36건) 첫 화면의 절반 이상을
// 차지해, 정작 지도·기상·선석 판정이 스크롤 아래로 밀렸다.
//
// 경고는 "항상 보고 있어야 하는 것"이 아니라 "떴을 때 열어보는 것"이므로
// 헤더 벨로 접는다. 미확인 건수는 벨 배지로 항상 보이니 놓칠 일은 없다.
//
// 단, 안전/환경 관제 화면(/safety)에서는 벨 자체를 띄우지 않는다. 그 화면 오른쪽이
// 이미 같은 경고를 선석 단위로 펼쳐 놓고 있어서, 벨까지 두면 한 화면에 같은 36건이
// 두 번 나온다. 확인(ACK)은 양쪽이 같은 키(alertUtils.alertId)를 쓰므로 어느 쪽에서
// 눌러도 같은 이력이다.
// ─────────────────────────────────────────────────────────────────────────────

// 벨을 숨길 경로 — 그 화면이 경고를 이미 전담해 보여주는 곳
const ALERT_OWNED_PATHS = ['/safety'];

export default function AlertBell() {
  const { data } = useDashboardData();
  const alertAcks = useSensorStore((s) => s.alertAcks);
  const ackAlert = useSensorStore((s) => s.ackAlert);
  const setSelectedVessel = useSensorStore((s) => s.setSelectedVessel);
  const setSafetyPrefill = useSensorStore((s) => s.setSafetyPrefill);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const ownedByPage = ALERT_OWNED_PATHS.includes(pathname);

  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // 경고 → 그 선석의 안전 심사로 보낸다.
  //
  // 이 버튼이 없을 때 경고는 막다른 길이었다. 백엔드 경고에는 port_call_id 가 항상
  // 비어 있어(실측) "선박 보기" 버튼이 뜨는 일이 사실상 없었고, 남는 단서인
  // berth_name 으로는 화면에서 아무 데도 갈 수 없었다.
  const reviewAlert = (a) => {
    // 경고가 지목한 두 물질(chem_ids)을 같이 넘겨, 심사 폼이 그 조합을 그대로
    // 재현하게 한다. 선석 이름만 넘기면 폼이 그 선석의 아무 화물이나 집어넣는다.
    setSafetyPrefill({ berth_name: a.berth_name, chem_ids: a.chem_ids || [] });
    setOpen(false);
    navigate('/safety');
  };

  const alerts = data?.alerts ?? [];
  const vessels = data?.real_traffic ?? [];
  const unacked = alerts.filter((a) => !alertAcks[alertId(a)]);
  // 규칙엔진 실판정인지, 백엔드가 죽어 폴백인지 화면에 드러낸다
  const fromRuleEngine = data?.data_source?.alerts === 'REAL_RULE_ENGINE';

  const counts = alerts.reduce((acc, a) => {
    const key = LEVEL_STYLE[a.level] ? a.level : 'INFO';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  // 경고를 전담하는 화면으로 이동하면 열려 있던 드롭다운을 닫는다
  // (그 화면에서는 벨 자체가 사라지므로, 안 닫으면 유령 패널이 남는다)
  useEffect(() => {
    if (ownedByPage) setOpen(false);
  }, [ownedByPage]);

  // 바깥 클릭 / Esc 로 닫기
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

  // 미확인을 위로 — 확인한 건 아래로 내려 흐리게 남긴다(사라지면 되돌릴 수 없다)
  const ordered = [...alerts].sort((a, b) => {
    const aAck = alertAcks[alertId(a)] ? 1 : 0;
    const bAck = alertAcks[alertId(b)] ? 1 : 0;
    return aAck - bAck;
  });

  // 안전/환경 관제 화면은 오른쪽 "현재 위험 선석" 패널이 같은 경고를 이미 전담한다
  if (ownedByPage) return null;

  return (
    <div className="alert-bell" ref={wrapRef}>
      <button
        type="button"
        className="header-badge alert-badge"
        onClick={() => setOpen((v) => !v)}
        title={`관제 경고 ${alerts.length}건 · 미확인 ${unacked.length}건`}
        aria-expanded={open}
      >
        <FaExclamationTriangle color={unacked.length > 0 ? COLORS.red : COLORS.textSecondary} />
        <span style={{ fontSize: '12px', color: unacked.length > 0 ? COLORS.red : COLORS.textSecondary }}>
          경고 {alerts.length}
        </span>
        {unacked.length > 0 && <span className="alert-count">{unacked.length}</span>}
      </button>

      {open && (
        <div className="alert-dropdown">
          <div className="alert-dropdown-head">
            <div>
              <strong style={{ fontSize: '14px' }}>관제 경고</strong>
              <span style={{ marginLeft: '10px', fontSize: '12px', color: COLORS.textSecondary }}>
                총 {alerts.length}건 · 미확인 {unacked.length}건
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {unacked.length > 0 && (
                <button
                  type="button"
                  className="alert-dropdown-allack"
                  onClick={() => unacked.forEach((a) => ackAlert(alertId(a)))}
                >
                  모두 확인
                </button>
              )}
              <button type="button" className="alert-dropdown-close" onClick={() => setOpen(false)} title="닫기">
                <FaTimes />
              </button>
            </div>
          </div>

          <div className="alert-dropdown-sub">
            {['DANGER', 'WARNING', 'INFO'].filter((lv) => counts[lv]).map((lv) => (
              <span key={lv} style={{ color: LEVEL_STYLE[lv].color }}>
                {LEVEL_STYLE[lv].label} {counts[lv]}
              </span>
            ))}
            <span style={{ color: COLORS.textDim, marginLeft: 'auto' }}>
              {fromRuleEngine ? '혼재금지·IMDG 격리·흘수 (safety 규칙엔진)' : '확인 이력은 세션 내 보존'}
            </span>
          </div>

          <div className="alert-dropdown-list">
            {alerts.length === 0 && (
              <div style={{ color: COLORS.textDim, fontSize: '13px', padding: '18px', textAlign: 'center' }}>
                활성 경고 없음
              </div>
            )}
            {ordered.map((a) => {
              const id = alertId(a);
              const ack = alertAcks[id];
              const style = levelStyle(a.level);
              // 경고에 걸린 배 중 지금 AIS 신호가 잡히는 첫 척.
              //
              // 예전엔 port_call_id 로 찾았는데 이 경로의 경고에는 그 값이 절대 없다
              // (경고는 요청형 판정이 아니라 재항 현황 전수 판정에서 나온다).
              // 그래서 "선박 보기" 버튼이 뜬 적이 없었다. 지금은 백엔드가 callsgns 를
              // 실어 보내서 실제로 연결된다.
              const vessel = (a.callsgns || [])
                .map((cs) => vessels.find((v) => v.callsgn === cs))
                .find(Boolean) || null;
              return (
                <div key={id} className="alert-row" style={{ borderLeftColor: style.color, opacity: ack ? 0.45 : 1 }}>
                  <span className="alert-row-level" style={{ color: style.color, borderColor: style.color }}>
                    {style.label}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, lineHeight: 1.4 }}>
                      {/* 결론만 먼저 — LLM 상세는 펼침(splitAlertMessage 참고) */}
                      {(() => {
                        const { head, detail } = splitAlertMessage(a.message);
                        if (!detail) return head;
                        return (
                          <>
                            {head}
                            <details style={{ marginTop: '3px' }}>
                              <summary style={{ cursor: 'pointer', color: COLORS.info, fontSize: '11.5px', fontWeight: 600 }}>
                                상세 설명
                              </summary>
                              <span style={{ fontWeight: 400, color: COLORS.textSecondary, fontSize: '12px' }}>{detail}</span>
                            </details>
                          </>
                        );
                      })()}
                      {a.risk_level && (
                        <span className="alert-row-risk" style={{ color: style.color, borderColor: style.color }}>
                          {a.risk_level}
                        </span>
                      )}
                      {/* [2026-09-22] D3 — 그래프가 만든 경로 문장을 그대로 싣는다.
                          어떤 간선을 타고 이 결론에 닿았는지는 그래프가 제일 정확히
                          알고 있으므로 화면에서 다시 조립하지 않는다. */}
                      {a.graph_path && (
                        <div style={{
                          marginTop: '4px', fontWeight: 400, fontSize: '11px',
                          color: COLORS.textDim, wordBreak: 'break-word',
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        }}>
                          {a.graph_path}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: COLORS.textDim, marginTop: '3px' }}>
                      {typeLabel(a.type)}
                      {/* 근거를 숨기지 않는다 — 관제사가 무엇을 믿고 조치하는지 알아야 한다 */}
                      {a.basis ? ` · ${a.basis}` : ''}
                      {a.created_at_utc ? ` · ${formatAlertKST(a.created_at_utc)}` : ''}
                      {ack && <span style={{ color: COLORS.teal, marginLeft: '8px' }}>✓ {ack.by} 확인</span>}
                    </div>
                  </div>
                  {a.berth_name && (
                    <button
                      type="button"
                      className="alert-row-btn"
                      onClick={() => reviewAlert(a)}
                      title={`${a.berth_name} 안전 심사로 이동 — 재항 화물이 폼에 채워집니다`}
                    >
                      <FaShieldAlt />
                    </button>
                  )}
                  {vessel && (
                    <button
                      type="button"
                      className="alert-row-btn"
                      onClick={() => { setSelectedVessel(vessel); setOpen(false); }}
                      title={`${vessel.vessel_name} 상세 보기`}
                    >
                      <FaShip />
                    </button>
                  )}
                  {!ack && (
                    <button
                      type="button"
                      className="alert-row-btn alert-row-btn--ack"
                      onClick={() => ackAlert(id)}
                      title="확인 처리"
                    >
                      <FaCheck />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

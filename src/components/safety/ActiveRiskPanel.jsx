import { useMemo } from 'react';
import useDashboardData from '../../hooks/useDashboardData';
import useSensorStore from '../../stores/useSensorStore';
import { COLORS } from '../../utils/constants';
import { alertId, levelStyle, typeLabel, groupAlertsByBerth } from '../../utils/alertUtils';
import { FaCheck, FaCheckCircle, FaExclamationTriangle, FaShieldAlt, FaShip } from 'react-icons/fa';

// ─────────────────────────────────────────────────────────────────────────────
// 현재 위험 선석 — 안전/환경 관제 화면의 오른쪽 열
//
// 이 화면에서는 헤더 알림 벨을 감춘다(AlertBell 이 /safety 에서 스스로 빠진다).
// 같은 경고 36건을 한 화면에 두 번 보여주고 있었기 때문이다. 대신 여기가 그 역할을
// 전부 가져간다 — 확인(ACK)도 여기서 한다.
//
// 벨 목록과 다른 점은 묶는 단위다. 벨은 경고 36건을 그대로 나열하고, 여기는 관제
// 단위인 선석으로 묶는다(가스부두 = 혼재금지 + 화물 미확인). 이 화면에서 할 일은
// "어느 선석을 심사할까"를 고르는 것이므로 선석이 맞는 단위다.
//
// 여기 있던 것들을 왜 걷어냈는지도 남겨 둔다:
//   · "종합 안전 지수 98 / A" — 스토어에 박힌 고정값이라 무슨 일이 있어도 98이었다.
//     바로 왼쪽 SafetyGraph 가 백엔드 실계산 종합점수를 이미 보여주고 있어서,
//     한 화면에 종합 안전 숫자가 둘인데 서로 다른 값이었다.
//   · "실시간 안전 알림" — 아무도 연결하지 않는 WebSocket 스토어를 읽고 있었다.
//     헤더 벨이 경고 36건을 띄우는 순간에도 여기는 늘 "알림 없습니다"였다.
//   · "제어 패널(긴급 차단/점검 요청)" — onClick 이 없는 죽은 버튼이었고,
//     고르는 대상(T-101 탱크)도 우리가 수집하지 않는 mock 설비였다.
//     실제 현장 제어(게이트 승인/차단)는 센서 데이터 탭 HardwarePanel 에 있다.
// ─────────────────────────────────────────────────────────────────────────────

export default function ActiveRiskPanel() {
  const { data } = useDashboardData();
  const setSafetyPrefill = useSensorStore((s) => s.setSafetyPrefill);
  const prefill = useSensorStore((s) => s.safetyPrefill);
  const alertAcks = useSensorStore((s) => s.alertAcks);
  const ackAlert = useSensorStore((s) => s.ackAlert);
  const setSelectedVessel = useSensorStore((s) => s.setSelectedVessel);

  // 이 패널의 주어는 '선석'이다. 선석이 특정되지 않은 경고는 여기 두지 않는다.
  //
  // 자동배정 결과 경고(전 후보 부적합·적합 선석 없음)는 선석이 비어 있어 전부
  // '(선석 미상)' 한 덩어리로 묶였고, 같은 문장이 열세 줄씩 반복돼 정작 봐야 할
  // 혼재금지·흘수 경고를 덮었다(2026-08-25 실측: 110건 중 75건). 그 경고들은
  // 선석 안전이 아니라 배정 결과라, 배정현황과 협상 로그에서 다룰 일이다.
  // 헤더 경고 벨에는 전량 그대로 남는다 — 화면에서 지우는 게 아니라 자리를 가린다.
  const allAlerts = data?.alerts ?? [];
  const alerts = useMemo(() => allAlerts.filter((a) => a.berth_name), [allAlerts]);
  const vessels = data?.real_traffic ?? [];
  const berths = useMemo(() => groupAlertsByBerth(alerts), [alerts]);

  /** 이 선석 경고에 걸린 배 중 지금 AIS 신호가 잡히는 첫 척 */
  const vesselFor = (items) => {
    for (const a of items) {
      for (const cs of a.callsgns || []) {
        const v = vessels.find((x) => x.callsgn === cs);
        if (v) return v;
      }
    }
    return null;
  };

  const unackedTotal = alerts.filter((a) => !alertAcks[alertId(a)]).length;

  return (
    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="glass-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        <h3 className="glass-card-title">
          <FaShieldAlt style={{ marginRight: '8px', color: unackedTotal ? COLORS.red : COLORS.teal }} />
          현재 위험 선석 ({berths.length})
        </h3>
        {unackedTotal > 0 && (
          <button
            type="button"
            onClick={() => alerts.forEach((a) => ackAlert(alertId(a)))}
            style={{
              background: COLORS.teal, color: '#FFFFFF', border: 'none', borderRadius: '6px',
              padding: '5px 12px', fontSize: '11.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            모두 확인
          </button>
        )}
      </div>

      <div style={{ fontSize: '11.5px', color: COLORS.textDim, marginBottom: '10px', lineHeight: 1.5 }}>
        혼재금지 · IMDG 격리 · 흘수 경고 {alerts.length}건 (미확인 {unackedTotal}건)
        <br />
        선석을 누르면 왼쪽 심사 폼이 그 선석의 재항 화물로 채워집니다.
      </div>

      {berths.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '48px 16px', color: COLORS.textDim, textAlign: 'center',
        }}>
          <FaCheckCircle size={38} color={COLORS.teal} style={{ marginBottom: '14px', opacity: 0.5 }} />
          <p style={{ margin: 0 }}>현재 위험 판정된 선석이 없습니다.</p>
          <p style={{ margin: '6px 0 0', fontSize: '12px' }}>
            재항 화물이 없거나, 혼재·흘수 판정을 모두 통과한 상태입니다.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', minHeight: 0 }}>
          {berths.map((g) => {
            const color = levelStyle(g.worst).color;
            const active = prefill?.berth_name === g.berth;
            const types = [...new Set(g.items.map((a) => typeLabel(a.type)))];
            const unacked = g.items.filter((a) => !alertAcks[alertId(a)]);
            const allAcked = unacked.length === 0;
            const vessel = vesselFor(g.items);
            return (
              <div
                key={g.berth}
                style={{
                  background: active ? 'rgba(0, 212, 170, 0.10)' : COLORS.card,
                  border: `1px solid ${active ? COLORS.teal : COLORS.border}`,
                  borderLeft: `4px solid ${color}`,
                  borderRadius: '8px', padding: '10px 12px',
                  opacity: allAcked ? 0.5 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '13.5px' }}>{g.berth}</strong>
                  {types.map((t) => (
                    <span key={t} style={{
                      fontSize: '10.5px', fontWeight: 800, color,
                      border: `1px solid ${color}`, borderRadius: '4px', padding: '0 6px',
                    }}>{t}</span>
                  ))}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {vessel && (
                      <button
                        type="button"
                        onClick={() => setSelectedVessel(vessel)}
                        title={`${vessel.vessel_name} 상세 보기 (AIS 신호 수신 중)`}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '4px',
                          background: 'transparent', border: `1px solid ${COLORS.border}`,
                          color: COLORS.info, borderRadius: '6px', padding: '3px 8px',
                          fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                          maxWidth: '130px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                        }}
                      >
                        <FaShip size={9} /> {vessel.vessel_name}
                      </button>
                    )}
                    {!allAcked && (
                      <button
                        type="button"
                        onClick={() => unacked.forEach((a) => ackAlert(alertId(a)))}
                        title={`${g.berth} 경고 ${unacked.length}건 확인 처리`}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '4px',
                          background: 'transparent', border: `1px solid ${COLORS.border}`,
                          color: COLORS.teal, borderRadius: '6px', padding: '3px 8px',
                          fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        <FaCheck size={9} /> 확인
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSafetyPrefill({
                        berth_name: g.berth,
                        // 이 선석 경고 중 물질 조합이 지목된 첫 건을 그대로 재현한다
                        chem_ids: (g.items.find((a) => a.chem_ids?.length) || {}).chem_ids || [],
                      })}
                      title="왼쪽 심사 폼을 이 경고가 지목한 화물 조합으로 채웁니다"
                      style={{
                        background: 'transparent', border: 'none', color: COLORS.teal,
                        fontSize: '11.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', padding: '3px 2px',
                      }}
                    >
                      심사 →
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: '11.5px', color: COLORS.textSecondary, marginTop: '5px', lineHeight: 1.5 }}>
                  {g.items.map((a, i) => (
                    <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                      <FaExclamationTriangle size={10} color={levelStyle(a.level).color} style={{ marginTop: '3px', flexShrink: 0 }} />
                      {/* 선석 이름은 위에 이미 있으므로 문장에서 뺀다.
                          LLM 상세 설명(괄호 안 서너 문장)은 접는다 — 카드마다 전문이
                          펼쳐져 있으면 목록이 아니라 보고서가 된다(정보 과부하 피드백,
                          2026-08-21). 결론 한 줄 + 펼침. */}
                      {(() => {
                        const msg = (a.message || '').replace(`${g.berth}: `, '');
                        const cut = msg.indexOf(' (');
                        if (cut === -1 || msg.length < 90) return <span>{msg}</span>;
                        const head = msg.slice(0, cut);
                        const rest = msg.slice(cut + 2).replace(/\)\s*$/, '');
                        return (
                          <span style={{ minWidth: 0 }}>
                            {head}
                            <details style={{ marginTop: '2px' }}>
                              <summary style={{ cursor: 'pointer', color: COLORS.info, fontSize: '11px', fontWeight: 600 }}>
                                상세 설명
                              </summary>
                              <span style={{ color: COLORS.textDim }}>{rest}</span>
                            </details>
                          </span>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

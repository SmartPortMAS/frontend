import { useMemo, useState } from 'react';
import useSensorStore from '../../stores/useSensorStore';
import { COLORS, NAV_STATUS, WEATHER_STATUS_COLORS } from '../../utils/constants';
import { ONSAN_BERTHS, ONSAN_WEATHER_GROUP, findBerthIdByName } from '../../utils/geoUtils';
import useVesselSafety from '../../hooks/useVesselSafety';
import useDashboardData from '../../hooks/useDashboardData';
import { FaTimes, FaShieldAlt, FaAnchor, FaCloudSun, FaBell, FaCogs } from 'react-icons/fa';
import { simulateMooring } from '../../utils/mooringPhysics';
import { alertId } from '../../utils/alertUtils';

const RISK_COLORS = {
  '안전': COLORS.teal, '주의': COLORS.yellow, '위험': COLORS.red,
  '배정불가': COLORS.red, '판단불가': COLORS.textDim,
};

const STEPS = ['안전 심사', '선석 배정', '입항', '접안', '하역', '출항'];

// 선박 상태 → 여정 단계 인덱스
function journeyIndex(vessel) {
  switch (vessel.nav_status_category) {
    case 'UNDER_WAY': return 2;
    case 'AT_ANCHOR': return 1; // 배정 단계에서 정박 대기 중
    case 'MOORED': return 4;
    default: return 2;
  }
}

const berthIdByName = (name) => findBerthIdByName(name);

const formatKST = (utc) =>
  utc ? new Date(utc).toLocaleString('ko-KR', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hour12: false, timeZone: 'Asia/Seoul',
  }) : '-';

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '13px', lineHeight: 1.9 }}>
      <span style={{ color: COLORS.textSecondary, flexShrink: 0 }}>{label}</span>
      <span style={{ textAlign: 'right' }}>{children}</span>
    </div>
  );
}

function SectionTitle({ icon, children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700,
      color: COLORS.info, margin: '18px 0 8px', borderBottom: `1px solid ${COLORS.border}`, paddingBottom: '6px',
    }}>
      {icon} {children}
    </div>
  );
}

const MOOR_VERDICT_COLORS = { '정상': COLORS.teal, '주의': COLORS.yellow, '경고': '#ff8c42', '위험': COLORS.red };
const ASSUMED_DWT = 20000; // 케미컬 탱커 가정값 (하드코딩 유지 — 실DWT 소스 없음)

const DRAUGHT_VERDICT_STYLE = {
  NOT_ALLOWED: { label: '접안 불가', color: COLORS.red },
  MARGINAL: { label: '여유 부족', color: COLORS.yellow },
  UNKNOWN: { label: '판정 불가', color: COLORS.textDim },
  OK: { label: '정상', color: COLORS.teal },
};

export default function VesselDetailPanel() {
  const vessel = useSensorStore((s) => s.selectedVessel);
  const [moorSim, setMoorSim] = useState(null);
  const [simLoading, setSimLoading] = useState(false);
  const [moorDwt, setMoorDwt] = useState(ASSUMED_DWT);
  const setSelectedVessel = useSensorStore((s) => s.setSelectedVessel);
  const setSelectedBerthGroup = useSensorStore((s) => s.setSelectedBerthGroup);
  const berthWeather = useSensorStore((s) => s.berthWeather);
  const alertAcks = useSensorStore((s) => s.alertAcks);
  const ackAlert = useSensorStore((s) => s.ackAlert);
  const { data } = useDashboardData();

  const { assessment, loading: safetyLoading } = useVesselSafety(vessel);

  if (!vessel) return null;

  const status = NAV_STATUS[vessel.nav_status_category] || NAV_STATUS.UNKNOWN;
  const stepIdx = journeyIndex(vessel);
  const berthId = vessel.berth ? berthIdByName(vessel.berth) : null;
  const berthInfo = berthId ? ONSAN_BERTHS[berthId] : null;
  const weatherGroup = berthId ? ONSAN_WEATHER_GROUP[berthId] : null;
  const groupVerdict =
    berthWeather && weatherGroup && berthWeather.berth_group === weatherGroup
      ? berthWeather.status
      : null;
  const riskColor = RISK_COLORS[assessment?.risk_level] || COLORS.textDim;
  // 이 선박에 걸린 경고.
  //
  // 예전엔 port_call_id 로 대조했는데 백엔드 경고에는 그 값이 절대 없어(경고는
  // 요청형 판정이 아니라 재항 전수 판정에서 나온다) "관련 경고"가 영구히 0건이었다.
  // 지금은 경고가 callsgns 를 실어 보내므로 그걸로 찾는다. 접안 선석이 같은 경고도
  // 이 배와 무관하지 않으므로 함께 본다.
  const vesselAlerts = (data?.alerts || []).filter((a) => {
    if (vessel.callsgn && (a.callsgns || []).includes(vessel.callsgn)) return true;
    return Boolean(vessel.berth) && a.berth_name === vessel.berth;
  });

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, height: '100vh', width: '390px', zIndex: 2500,
      background: 'rgba(13, 27, 42, 0.97)', backdropFilter: 'blur(12px)',
      borderLeft: `1px solid ${COLORS.borderHover}`, boxShadow: '-12px 0 40px rgba(0,0,0,0.5)',
      padding: '20px', overflowY: 'auto', color: COLORS.textPrimary,
    }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: '19px' }}>{vessel.vessel_name}</h2>
            {vessel.is_liquid_cargo_vessel && (
              <span style={{ background: COLORS.red, color: '#fff', borderRadius: '4px', padding: '2px 7px', fontSize: '11px', fontWeight: 700 }}>위험물</span>
            )}
          </div>
          <div style={{ fontSize: '12px', color: COLORS.textDim, marginTop: '4px' }}>{vessel.port_call_id}</div>
        </div>
        <button
          onClick={() => setSelectedVessel(null)}
          style={{ background: 'none', border: 'none', color: COLORS.textSecondary, cursor: 'pointer', fontSize: '18px', padding: '4px' }}
        >
          <FaTimes />
        </button>
      </div>

      {/* 여정 스테퍼 */}
      <div style={{ display: 'flex', alignItems: 'center', margin: '18px 0 4px' }}>
        {STEPS.map((s, i) => {
          const done = i < stepIdx;
          const current = i === stepIdx;
          const c = current ? COLORS.teal : done ? COLORS.info : COLORS.textDim;
          return (
            <div key={s} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              {i > 0 && (
                <div style={{
                  position: 'absolute', top: '7px', right: '50%', width: '100%', height: '2px',
                  background: i <= stepIdx ? COLORS.info : COLORS.card,
                }} />
              )}
              <div style={{
                width: current ? '16px' : '12px', height: current ? '16px' : '12px', borderRadius: '50%',
                background: done || current ? c : COLORS.card, border: `2px solid ${c}`,
                zIndex: 1, boxShadow: current ? `0 0 10px ${COLORS.teal}` : 'none',
              }} />
              <span style={{ fontSize: '10px', color: c, marginTop: '5px', fontWeight: current ? 700 : 400, whiteSpace: 'nowrap' }}>
                {s}
              </span>
            </div>
          );
        })}
      </div>
      {/* anchorage(정박지 코드)는 AIS·PORT-MIS 어느 쪽에서도 오지 않는다
          (backendAdapter.mapVessel 이 만들지 않는 필드). 예전엔 그대로 찍어
          "정박지 undefined 에서 선석 대기 중"이 떴다. 아는 것만 말한다. */}
      {vessel.nav_status_category === 'AT_ANCHOR' && (
        <div style={{ fontSize: '12px', color: COLORS.yellow, textAlign: 'center', marginTop: '6px' }}>
          {vessel.anchorage
            ? `정박지 ${vessel.anchorage} 에서 선석 대기 중`
            : '묘박 중 — 정박지 코드는 수집 소스 없음'}
        </div>
      )}

      {/* 기본 정보 */}
      <SectionTitle icon={<FaAnchor />}>선박 · 입항 정보</SectionTitle>
      <Row label="상태">
        <span style={{ color: status.color, fontWeight: 700 }}>{status.label}</span> · {vessel.sog} kn
      </Row>
      <Row label="호출부호 / MMSI">{vessel.callsgn} / {vessel.mmsi}</Row>
      <Row label="화물">
        {vessel.cargo
          ? `${vessel.cargo.name} (${vessel.cargo.un_no})`
          : vessel.liquid_by_ship_type === true ? '액체화물선 · 화물 미신고'
            : vessel.liquid_by_ship_type === false ? '일반화물' : '미확인'}
      </Row>
      {vessel.ship_kind_nm && <Row label="선종 (PORT-MIS)">{vessel.ship_kind_nm}</Row>}
      {/* arrival_at_utc 는 지도 마커로 연 경우에만 채워진다(PortMap 이 붙여준다).
          목록·경고에서 연 경우엔 없으므로 AIS 최근 수신 시각을 대신 보여준다. */}
      <Row label={vessel.arrival_at_utc ? '입항시각 (KST)' : 'AIS 최근 수신 (KST)'}>
        {formatKST(vessel.arrival_at_utc || vessel.received_at_utc)}
      </Row>
      <Row label="배정 선석">{vessel.berth || '미배정'}</Row>
      {berthInfo && (
        <Row label="선석 제원">
          {berthInfo.operator} · 최대 {berthInfo.maxDwt.toLocaleString()} DWT · 수심 {berthInfo.depthM}m
        </Row>
      )}
      {(() => {
        const dc = (data?.draught_checks || []).find((r) => r.callsgn === vessel.callsgn);
        if (!dc) return null;
        const v = DRAUGHT_VERDICT_STYLE[dc.draught_verdict] || DRAUGHT_VERDICT_STYLE.UNKNOWN;
        return (
          <Row label="흘수·UKC (조위 반영)">
            <span style={{ color: v.color, fontWeight: 700 }}>{v.label}</span>
            {dc.ukc_m != null && ` · UKC ${dc.ukc_m}m (필요 ${dc.ukc_required_m}m)`}
          </Row>
        );
      })()}

      {/* 하역 작업 진행률 */}
      {(() => {
        const op = (data?.operations || []).find(
          (o) => !o.is_real_record && o.vessel_name === vessel.vessel_name
        );
        if (!op) return null;
        const opColor = op.status === 'IN_PROGRESS' ? COLORS.teal : COLORS.yellow;
        return (
          <div style={{ marginTop: '10px', padding: '10px 12px', background: COLORS.card, borderRadius: '10px', border: `1px solid ${COLORS.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '6px' }}>
              <span style={{ fontWeight: 700 }}>
                하역 작업 {op.status === 'IN_PROGRESS' ? '진행 중' : '대기'}
              </span>
              <span style={{ color: opColor, fontWeight: 800 }}>{Math.round(op.progress_pct)}%</span>
            </div>
            <div style={{ height: '9px', background: '#0d1b2a', borderRadius: '5px', overflow: 'hidden' }}>
              <div style={{ width: `${op.progress_pct}%`, height: '100%', background: opColor, borderRadius: '5px', transition: 'width 1s' }} />
            </div>
            {op.planned_tons != null && (
              <div style={{ fontSize: '11.5px', color: COLORS.textSecondary, marginTop: '5px' }}>
                {(op.done_tons ?? 0).toLocaleString()} / {op.planned_tons.toLocaleString()} t · {op.cargo}
              </div>
            )}
            {/* 간트차트에는 "진행률은 데모값" 고지가 있는데 여기엔 없어서, 같은
                데이터가 한 화면에선 데모, 다른 화면에선 실측처럼 보였다. */}
            <div style={{ fontSize: '11px', color: COLORS.yellow, marginTop: '6px' }}>
              데모값 — 유량계 미도입으로 실시간 진행률 수집 소스가 없습니다
            </div>
          </div>
        );
      })()}

      {/* 안전 심사 — 백엔드 안전 에이전트 (MSDS 혼재금지 + IMDG 격리) */}
      <SectionTitle icon={<FaShieldAlt />}>안전 심사 — 혼재금지 · IMDG 격리</SectionTitle>
      {!assessment ? (
        <div style={{ fontSize: '13px', color: COLORS.textDim, lineHeight: 1.7 }}>
          안전 에이전트 조회 중…
          <div style={{ fontSize: '11px' }}>처음 조회하는 물질은 MSDS 수집에 1~2분 걸릴 수 있습니다</div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <div style={{
              display: 'inline-block', padding: '4px 14px', borderRadius: '999px',
              border: `2px solid ${riskColor}`, color: riskColor, fontWeight: 800, fontSize: '15px',
            }}>
              {assessment.risk_level}
            </div>
            {safetyLoading && <span style={{ fontSize: '11px', color: COLORS.textDim }}>갱신 중…</span>}
          </div>

          {assessment.summary && (
            <div style={{ fontSize: '12.5px', color: COLORS.textPrimary, lineHeight: 1.65, marginBottom: '8px' }}>
              {assessment.summary}
            </div>
          )}

          {assessment.gates_hit.length > 0 ? (
            <ul style={{ margin: '4px 0', paddingLeft: '16px', fontSize: '12.5px', lineHeight: 1.7 }}>
              {assessment.gates_hit.map((g, i) => (
                <li key={`${g.rule}-${i}`}>
                  <strong style={{ color: g.severity === 'BLOCK' ? COLORS.red : g.severity === 'HOLD' ? '#ff8c42' : COLORS.yellow }}>
                    {g.rule}
                  </strong>{' '}{g.reason}
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ fontSize: '13px', color: COLORS.textSecondary }}>
              인접 선석 화물과 혼재금지·격리 충돌 없음
            </div>
          )}

          {assessment.hazards?.length > 0 && (
            <>
              <div style={{ fontSize: '12px', fontWeight: 700, color: COLORS.textSecondary, margin: '10px 0 4px' }}>
                주요 유해성 (MSDS)
              </div>
              <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '12.5px', color: COLORS.textSecondary, lineHeight: 1.7 }}>
                {assessment.hazards.map((h, i) => <li key={i}>{h}</li>)}
              </ul>
            </>
          )}

          {assessment.checklist.length > 0 && (
            <>
              <div style={{ fontSize: '12px', fontWeight: 700, color: COLORS.textSecondary, margin: '10px 0 4px' }}>
                하역 전 안전 체크리스트 (MSDS 근거)
              </div>
              <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '12.5px', color: COLORS.textSecondary, lineHeight: 1.7 }}>
                {assessment.checklist.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </>
          )}

          <div style={{ fontSize: '11px', color: COLORS.textDim, marginTop: '6px', lineHeight: 1.6 }}>
            {assessment.is_local_fallback
              ? '※ 백엔드 안전 에이전트 미응답 — 판단 보류(fail-safe). 임의로 안전 판정하지 않습니다'
              : '※ 백엔드 안전 에이전트 판정 — MSDS 반응성 + IMDG 7.2 격리표 기준'}
            {assessment.msds_sections_used?.length > 0
              && ` · 근거 섹션 ${assessment.msds_sections_used.length}개`}
          </div>
        </>
      )}

      {/* 선석 기상 판정 연동 */}
      {weatherGroup && (
        <>
          <SectionTitle icon={<FaCloudSun />}>선석 기상 판정</SectionTitle>
          <Row label="기상 임계군">{weatherGroup}</Row>
          {groupVerdict && (
            <Row label="최근 판정">
              <span style={{ color: WEATHER_STATUS_COLORS[groupVerdict], fontWeight: 800 }}>{groupVerdict}</span>
            </Row>
          )}
          <button
            onClick={() => setSelectedBerthGroup(weatherGroup)}
            style={{
              marginTop: '8px', width: '100%', padding: '9px', borderRadius: '8px', border: 'none',
              background: `linear-gradient(135deg, ${COLORS.teal}, ${COLORS.tealDark})`,
              color: '#04222b', fontWeight: 700, cursor: 'pointer', fontSize: '13px',
            }}
          >
            이 선석 기상 판정 실행 → 판정 패널로 이동
          </button>
        </>
      )}

      {/* 계류 물리 검증 (8월 시나리오 S1 — 준정적 근사, PhysX 스크립트로 검증) */}
      {vessel.berth && (
        <>
          <SectionTitle icon={<FaCogs />}>계류 안정성 물리 검증</SectionTitle>
          {/* 예전엔 mock-server(:8000)의 /sim/mooring 을 호출했는데, mock-server 를
              걷어낸 뒤로는 그 주소가 죽어 항상 "응답 없음"만 떴다. 같은 상수·같은
              식을 utils/mooringPhysics.js 로 옮겨 화면에서 계산한다(순수 함수라
              서버 왕복이 필요 없다). */}
          <button
            disabled={simLoading || !data?.weather}
            onClick={() => {
              setSimLoading(true);
              try {
                const wind = data?.weather?.wind_speed_ms;
                const wave = data?.weather?.wave_height_sig_m;
                if (wind == null) {
                  // 관측이 없으면 임의값으로 계산하지 않는다 — 없는 근거로 낸
                  // "정상"은 가장 위험한 종류의 답이다.
                  setMoorSim({ error: '풍속 관측값이 없어 계산할 수 없습니다 (판단 보류)' });
                } else {
                  setMoorSim(simulateMooring(moorDwt, wind, wave ?? 0));
                }
              } finally {
                setSimLoading(false);
              }
            }}
            style={{
              width: '100%', padding: '9px', borderRadius: '8px',
              border: `1px solid ${COLORS.info}`, background: 'transparent',
              color: COLORS.info, fontWeight: 700, cursor: 'pointer', fontSize: '13px',
            }}
          >
            {simLoading ? '계산 중...' : '현재 기상으로 계류삭 장력 검증'}
          </button>
          {/* DWT 는 AIS·PORT-MIS 어느 쪽도 수집하지 않는다. 고정 가정값을 숨기고
              쓰면 "이 배의 실제 계산"으로 오해하므로, 가정값임을 드러내고 조정도
              할 수 있게 한다. */}
          <label style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            fontSize: '11.5px', color: COLORS.textDim, marginTop: '7px',
          }}>
            DWT 가정값
            <input
              type="number" step="1000" min="1000" value={moorDwt}
              onChange={(e) => { setMoorDwt(Number(e.target.value) || ASSUMED_DWT); setMoorSim(null); }}
              style={{
                width: '92px', background: COLORS.card, color: COLORS.textPrimary,
                border: `1px solid ${COLORS.border}`, borderRadius: '6px',
                padding: '3px 7px', fontSize: '11.5px',
              }}
            />
            <span>t — 실 DWT 미수집(AIS·PORT-MIS 모두 없음)</span>
          </label>
          {moorSim && !moorSim.error && (
            <div style={{ marginTop: '8px', padding: '10px 12px', background: COLORS.card, borderRadius: '10px', border: `1px solid ${MOOR_VERDICT_COLORS[moorSim.verdict] || COLORS.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                <span style={{ fontWeight: 800, color: MOOR_VERDICT_COLORS[moorSim.verdict] }}>
                  {moorSim.verdict} — 장력 {moorSim.tension_pct}%
                </span>
                <span style={{ color: COLORS.textSecondary }}>
                  {moorSim.line_tension_kn} / {moorSim.mbl_kn} kN
                </span>
              </div>
              <div style={{ height: '8px', background: '#0d1b2a', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(100, moorSim.tension_pct)}%`, height: '100%',
                  background: MOOR_VERDICT_COLORS[moorSim.verdict], borderRadius: '4px',
                }} />
              </div>
              <div style={{ fontSize: '12px', color: COLORS.textSecondary, marginTop: '6px' }}>
                {moorSim.action} · 정상 한계풍속 <strong style={{ color: COLORS.textPrimary }}>{moorSim.safe_wind_limit_ms} m/s</strong>
              </div>
              <div style={{ fontSize: '10.5px', color: COLORS.textDim, marginTop: '4px' }}>{moorSim.model}</div>
            </div>
          )}
          {moorSim?.error && (
            <div style={{ marginTop: '8px', fontSize: '12px', color: COLORS.yellow }}>{moorSim.error}</div>
          )}
        </>
      )}

      {/* 관련 경고 */}
      <SectionTitle icon={<FaBell />}>관련 경고 ({vesselAlerts.length})</SectionTitle>
      {vesselAlerts.length === 0 && (
        <div style={{ fontSize: '13px', color: COLORS.textDim }}>이 선박 관련 경고 없음</div>
      )}
      {vesselAlerts.map((a) => {
        // ACK 키는 공용 규칙(alertUtils.alertId) 하나만 쓴다. 예전엔 여기만
        // `${type}-${created_at_utc}` 라는 두 번째 규칙을 갖고 있어서, 헤더 벨에서
        // 확인한 경고가 여기서는 미확인으로 남았다(게다가 백엔드 경고엔
        // created_at_utc 가 없어 같은 유형이 전부 한 키로 뭉쳤다).
        const id = alertId(a);
        const ack = alertAcks[id];
        return (
          <div key={id} style={{
            border: `1px solid ${a.level === 'DANGER' ? COLORS.red : COLORS.yellow}`,
            borderRadius: '8px', padding: '10px', fontSize: '12.5px', marginBottom: '8px',
            opacity: ack ? 0.6 : 1,
          }}>
            <div style={{ fontWeight: 700, color: a.level === 'DANGER' ? COLORS.red : COLORS.yellow }}>
              [{a.level}] {a.type}
            </div>
            <div style={{ margin: '4px 0' }}>{a.message}</div>
            {ack ? (
              <div style={{ color: COLORS.teal, fontSize: '11.5px' }}>
                ✓ 확인 — {ack.by} · {formatKST(ack.at)}
              </div>
            ) : (
              <button
                onClick={() => ackAlert(id)}
                style={{
                  padding: '5px 12px', borderRadius: '6px', border: `1px solid ${COLORS.teal}`,
                  background: 'transparent', color: COLORS.teal, cursor: 'pointer', fontSize: '12px', fontWeight: 700,
                }}
              >
                확인 처리
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

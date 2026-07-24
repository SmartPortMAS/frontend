import { useMemo, useState } from 'react';
import useSensorStore from '../../stores/useSensorStore';
import { COLORS, NAV_STATUS, WEATHER_STATUS_COLORS } from '../../utils/constants';
import { ONSAN_BERTHS, ONSAN_WEATHER_GROUP } from '../../utils/geoUtils';
import { assessVesselSafety } from '../../mocks/mockAssessment';
import useDashboardData from '../../hooks/useDashboardData';
import { FaTimes, FaShieldAlt, FaAnchor, FaCloudSun, FaBell, FaCogs } from 'react-icons/fa';
import { API_BASE } from '../../utils/constants';

const RISK_COLORS = { '안전': COLORS.teal, '주의': COLORS.yellow, '위험': COLORS.red };

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

const berthIdByName = (name) =>
  Object.keys(ONSAN_BERTHS).find((k) => ONSAN_BERTHS[k].name === name);

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
const ASSUMED_DWT = 20000; // 케미컬 탱커 가정값 (AIS static 연동 시 실값으로 교체)

export default function VesselDetailPanel() {
  const vessel = useSensorStore((s) => s.selectedVessel);
  const [moorSim, setMoorSim] = useState(null);
  const [simLoading, setSimLoading] = useState(false);
  const setSelectedVessel = useSensorStore((s) => s.setSelectedVessel);
  const setSelectedBerthGroup = useSensorStore((s) => s.setSelectedBerthGroup);
  const berthWeather = useSensorStore((s) => s.berthWeather);
  const alertAcks = useSensorStore((s) => s.alertAcks);
  const ackAlert = useSensorStore((s) => s.ackAlert);
  const { data } = useDashboardData();

  const assessment = useMemo(
    () => (vessel ? assessVesselSafety(vessel) : null),
    [vessel]
  );

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
  const riskColor = RISK_COLORS[assessment.risk_level] || COLORS.textDim;
  const vesselAlerts = (data?.alerts || []).filter(
    (a) => a.port_call_id === vessel.port_call_id
  );

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
      {vessel.nav_status_category === 'AT_ANCHOR' && (
        <div style={{ fontSize: '12px', color: COLORS.yellow, textAlign: 'center', marginTop: '6px' }}>
          정박지 {vessel.anchorage} 에서 선석 대기 중
        </div>
      )}

      {/* 기본 정보 */}
      <SectionTitle icon={<FaAnchor />}>선박 · 입항 정보</SectionTitle>
      <Row label="상태">
        <span style={{ color: status.color, fontWeight: 700 }}>{status.label}</span> · {vessel.sog} kn
      </Row>
      <Row label="호출부호 / MMSI">{vessel.callsgn} / {vessel.mmsi}</Row>
      <Row label="화물">{vessel.cargo ? `${vessel.cargo.name} (${vessel.cargo.un_no})` : '일반화물'}</Row>
      <Row label="입항시각 (KST)">{formatKST(vessel.arrival_at_utc)}</Row>
      <Row label="배정 선석">
        {vessel.berth || (vessel.anchorage ? `정박지 ${vessel.anchorage} 대기` : '-')}
      </Row>
      {berthInfo && (
        <Row label="선석 제원">
          {berthInfo.operator} · 최대 {berthInfo.maxDwt.toLocaleString()} DWT · 수심 {berthInfo.depthM}m
        </Row>
      )}

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
          </div>
        );
      })()}

      {/* 안전 심사 (게이트 R1~R15) */}
      <SectionTitle icon={<FaShieldAlt />}>안전 심사 — 게이트 R1~R15</SectionTitle>
      <div style={{
        display: 'inline-block', padding: '4px 14px', borderRadius: '999px',
        border: `2px solid ${riskColor}`, color: riskColor, fontWeight: 800, fontSize: '15px', marginBottom: '8px',
      }}>
        {assessment.risk_level}
      </div>
      {assessment.gates_hit.length > 0 ? (
        <ul style={{ margin: '4px 0', paddingLeft: '16px', fontSize: '12.5px', lineHeight: 1.7 }}>
          {assessment.gates_hit.map((g) => (
            <li key={g.rule}>
              <strong style={{ color: g.severity === 'HOLD' ? COLORS.red : COLORS.yellow }}>{g.rule}</strong>{' '}
              {g.reason}
            </li>
          ))}
        </ul>
      ) : (
        <div style={{ fontSize: '13px', color: COLORS.textSecondary }}>게이트 15개 전체 통과 — 히트 없음</div>
      )}
      {assessment.checklist.length > 0 && (
        <>
          <div style={{ fontSize: '12px', fontWeight: 700, color: COLORS.textSecondary, margin: '10px 0 4px' }}>
            하역 전 안전 체크리스트 (MSDS 기반)
          </div>
          <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '12.5px', color: COLORS.textSecondary, lineHeight: 1.7 }}>
            {assessment.checklist.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </>
      )}
      <div style={{ fontSize: '11px', color: COLORS.textDim, marginTop: '6px' }}>
        ※ mock 결과 — 백엔드 연동 시 /api/v1/safety/assess 응답으로 교체
      </div>

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
          <button
            disabled={simLoading}
            onClick={async () => {
              setSimLoading(true);
              try {
                const res = await fetch(`${API_BASE}/v1/sim/mooring`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    dwt: ASSUMED_DWT,
                    wind_speed: data?.weather?.wind_speed_ms ?? 10,
                    wave_height: data?.weather?.wave_height_sig_m ?? 0.5,
                  }),
                });
                setMoorSim(await res.json());
              } catch {
                setMoorSim({ error: '시뮬레이션 서버(8000) 응답 없음' });
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
            {simLoading ? '계산 중...' : `현재 기상으로 계류삭 장력 검증 (DWT ${ASSUMED_DWT.toLocaleString()} 가정)`}
          </button>
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
        const id = `${a.type}-${a.created_at_utc}`;
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

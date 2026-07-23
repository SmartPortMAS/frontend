import { useState } from 'react';
import useOnsanApi from '../../hooks/useOnsanApi';
import useSensorStore from '../../stores/useSensorStore';
import { COLORS } from '../../utils/constants';
import { FaRoute, FaAnchor, FaShip, FaCheck, FaHourglassHalf } from 'react-icons/fa';

// 전용 → 대체 → 정박지대기 판단 경로 시각화 (오케스트레이터 berth_decision.trace)
const STATUS_STYLE = {
  APPROVED: { color: COLORS.teal, label: '배정 승인' },
  WAITING_ANCHORAGE: { color: COLORS.yellow, label: '정박지 대기' },
  REJECTED: { color: COLORS.red, label: '반려' },
  PENDING: { color: COLORS.info, label: '대기' },
};

const PATH_LABEL = { '전용': '전용 선석 배정', '대체': '같은 운영사 대체 배정', '정박지대기': '정박지 대기' };

const CARGOS = ['벤젠', '톨루엔', '메탄올', '에탄올', '황산', '휘발유', '경유', '등유', '나프타'];
const BERTHS = [
  'OTK 1부두', 'OTK 2부두', 'UTK 부두', '대한유화 부두', '정일 1부두', '정일 2부두',
  '효성 부두', 'S-Oil 1부두', 'S-Oil 2부두', 'S-Oil 3부두', 'S-Oil 4부두',
  'S-Oil 부이', '오일허브 부이', '석유공사 부이',
];

export default function BerthDecisionPanel() {
  const { orchestrate } = useOnsanApi();
  const result = useSensorStore((s) => s.orchestration);
  const [form, setForm] = useState({ cargoName: '에탄올', berthName: 'OTK 1부두', dwt: 9000, draught: 7.5, gt: 8000 });
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const run = async () => {
    setLoading(true);
    await orchestrate(form);
    setLoading(false);
  };

  const style = STATUS_STYLE[result?.status] || { color: COLORS.textDim, label: result?.status };
  const decision = result?.berth_decision;

  const inputStyle = {
    width: '100%', background: COLORS.card, color: COLORS.textPrimary,
    border: `1px solid ${COLORS.border}`, borderRadius: '8px', padding: '7px 10px', fontSize: '13px',
  };
  const labelStyle = { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: COLORS.textSecondary };

  return (
    <div className="glass-card">
      <div className="glass-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 className="glass-card-title">
          <FaRoute style={{ marginRight: '8px', color: COLORS.teal }} />선석 배정 시뮬레이션 — 전용 → 대체 → 정박지 대기
        </h3>
        <span style={{ fontSize: '12px', color: COLORS.textDim }}>기상 → 스케줄링 → 안전 게이트 순차 실행</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px', marginBottom: '12px' }}>
        <label style={labelStyle}>화물
          <select value={form.cargoName} onChange={set('cargoName')} style={inputStyle}>
            {CARGOS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label style={labelStyle}>희망 선석
          <select value={form.berthName} onChange={set('berthName')} style={inputStyle}>
            {BERTHS.map((b) => <option key={b}>{b}</option>)}
          </select>
        </label>
        <label style={labelStyle}>DWT
          <input type="number" value={form.dwt} onChange={set('dwt')} style={inputStyle} />
        </label>
        <label style={labelStyle}>흘수 (m)
          <input type="number" step="0.1" value={form.draught} onChange={set('draught')} style={inputStyle} />
        </label>
        <label style={labelStyle}>GT
          <input type="number" value={form.gt} onChange={set('gt')} style={inputStyle} />
        </label>
        <button onClick={run} disabled={loading} style={{
          alignSelf: 'flex-end', background: `linear-gradient(135deg, ${COLORS.teal}, ${COLORS.tealDark})`, color: '#04222b',
          border: 'none', borderRadius: '8px', padding: '9px 16px', fontWeight: 700,
          cursor: loading ? 'wait' : 'pointer', fontSize: '14px', opacity: loading ? 0.6 : 1,
        }}>
          {loading ? '실행 중…' : '배정 실행'}
        </button>
      </div>

      {result && (
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* 결과 카드 */}
          <div style={{
            minWidth: '190px', padding: '14px 16px', background: COLORS.card,
            border: `2px solid ${style.color}`, borderRadius: '12px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '22px', fontWeight: 800, color: style.color }}>{style.label}</div>
            <div style={{ fontSize: '13px', color: COLORS.textPrimary, marginTop: '6px', display: 'flex', justifyContent: 'center', gap: '6px', alignItems: 'center' }}>
              {result.berth_assigned
                ? <><FaShip color={COLORS.teal} /> {result.berth_assigned}</>
                : result.anchorage
                  ? <><FaAnchor color={COLORS.yellow} /> {result.anchorage}</>
                  : null}
            </div>
            {decision?.path && (
              <div style={{ fontSize: '12px', color: COLORS.textSecondary, marginTop: '4px' }}>
                경로: {PATH_LABEL[decision.path] || decision.path}
              </div>
            )}
            {result.risk_level && (
              <div style={{ fontSize: '12px', color: COLORS.textSecondary, marginTop: '2px' }}>
                안전등급 {result.risk_level} · 기상 {result.weather_grade}
              </div>
            )}
            {!result.risk_level && result.weather_grade && (
              <div style={{ fontSize: '12px', color: COLORS.textSecondary, marginTop: '2px' }}>기상 {result.weather_grade}</div>
            )}
          </div>

          {/* 판단 경로 타임라인 */}
          <div style={{ flex: 1, minWidth: '280px' }}>
            {decision?.trace?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {decision.trace.map((step, i) => {
                  const last = i === decision.trace.length - 1;
                  return (
                    <div key={i} style={{ display: 'flex', gap: '12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{
                          width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
                          background: COLORS.card, border: `2px solid ${last ? style.color : COLORS.info}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: last ? style.color : COLORS.info, fontSize: '11px',
                        }}>
                          {last ? <FaCheck /> : <FaHourglassHalf />}
                        </div>
                        {!last && <div style={{ width: '2px', flex: 1, minHeight: '14px', background: COLORS.border }} />}
                      </div>
                      <div style={{ fontSize: '13px', color: COLORS.textPrimary, paddingBottom: '12px', lineHeight: 1.5 }}>
                        <span style={{ color: COLORS.textDim, marginRight: '8px' }}>{i + 1}단계</span>
                        {step}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: '13px', color: COLORS.textSecondary }}>{result.reason}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

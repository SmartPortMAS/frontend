import { useEffect, useState } from 'react';
import useOnsanApi, { useChemicalList } from '../../hooks/useOnsanApi';
import useSensorStore from '../../stores/useSensorStore';
import { COLORS } from '../../utils/constants';
import { onsanAdjacentBerthNames } from '../../utils/geoUtils';
import { FaShieldAlt, FaCheckCircle, FaTimesCircle } from 'react-icons/fa';

// risk_level 4등급 (결정론: 같은 입력 = 같은 등급)
const RISK_STYLE = {
  '안전': { color: COLORS.teal },
  '주의': { color: COLORS.yellow },
  '위험': { color: '#ff8c42' },
  '배정불가': { color: COLORS.red },
};

const BERTHS = [
  'OTK 1부두', 'OTK 2부두', 'UTK 부두', '대한유화 부두', '정일 1부두', '정일 2부두',
  '효성 부두', 'S-Oil 1부두', 'S-Oil 2부두', 'S-Oil 3부두', 'S-Oil 4부두',
  'S-Oil 부이', '오일허브 부이', '석유공사 부이',
];

export default function SafetyGatesPanel() {
  const { assessSafetyGates } = useOnsanApi();
  // 이 패널의 판정 결과는 DashboardPage "최근 안전 심사" KPI가 참조하므로
  // 여기서만 전역 스토어(gateAssessment)에 반영한다 — 다른 화면에서 선박을
  // 클릭할 때 자동으로 도는 useVesselSafety는 이 스토어를 건드리지 않는다.
  const result = useSensorStore((s) => s.gateAssessment);
  const setGateAssessment = useSensorStore((s) => s.setGateAssessment);

  // 지식그래프 등재 화물 전체(현재 36종) — 하드코딩 목록 대신 DB/그래프에서 직접 불러온다.
  const chemicals = useChemicalList();

  const [form, setForm] = useState({
    cargo_chem_id: '', berth_name: 'OTK 1부두',
    dwt: 9000, gt: 8000, draught_m: 7.5, loa_m: 120,
    sire_valid: true, cdi_valid: true, work_hour: 14,
    adjacent_berth: '', adjacent_chem_id: '', // 인접 선석 동시작업 (ADJACENT_TO 기반)
  });
  // 목록이 로드되면 첫 화물을 기본 선택값으로 채운다 (로딩 전엔 빈 값)
  useEffect(() => {
    if (chemicals.length && !form.cargo_chem_id) {
      setForm((f) => ({ ...f, cargo_chem_id: chemicals[0].chem_id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chemicals]);
  const [showAllGates, setShowAllGates] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const selectedCargo = chemicals.find((c) => c.chem_id === form.cargo_chem_id);
  const adjacentCargo = chemicals.find((c) => c.chem_id === form.adjacent_chem_id);

  // 선택한 선석의 실제 ADJACENT_TO 인접 선석만 후보로 제시
  const adjacentOptions = onsanAdjacentBerthNames(form.berth_name);
  const adjacentBerth = adjacentOptions.includes(form.adjacent_berth)
    ? form.adjacent_berth
    : (adjacentOptions[0] || '');

  const run = async () => {
    const adjacent_operations = adjacentBerth && adjacentCargo
      ? [{ berth_name: adjacentBerth, chem_id: adjacentCargo.chem_id, cargo_name: adjacentCargo.name_ko, activity: '하역중' }]
      : [];
    const res = await assessSafetyGates({
      cargo_name: selectedCargo?.name_ko,
      chem_id: form.cargo_chem_id,
      berth_name: form.berth_name,
      dwt: Number(form.dwt), gt: Number(form.gt),
      draught_m: Number(form.draught_m), loa_m: Number(form.loa_m),
      sire_valid: form.sire_valid, cdi_valid: form.cdi_valid,
      work_hour: Number(form.work_hour),
      adjacent_operations,
    });
    setGateAssessment(res);
  };

  const style = RISK_STYLE[result?.risk_level] || { color: COLORS.textDim };
  const hits = (result?.gates || []).filter((g) => g.hit);
  const passes = (result?.gates || []).filter((g) => !g.hit);

  const inputStyle = {
    width: '100%', background: COLORS.card, color: COLORS.textPrimary,
    border: `1px solid ${COLORS.border}`, borderRadius: '8px', padding: '7px 10px', fontSize: '13px',
  };
  const labelStyle = { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: COLORS.textSecondary };

  return (
    <div className="glass-card">
      <div className="glass-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 className="glass-card-title">
          <FaShieldAlt style={{ marginRight: '8px', color: COLORS.teal }} />신규 입항 안전 심사 — 게이트 R1~R15
        </h3>
        <span style={{ fontSize: '12px', color: COLORS.textDim }}>결정론 판정 · LLM은 설명만</span>
      </div>

      {/* 입항 정보 폼 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px', marginBottom: '12px' }}>
        <label style={labelStyle}>화물
          <select value={form.cargo_chem_id} onChange={set('cargo_chem_id')} style={inputStyle} disabled={chemicals.length === 0}>
            {chemicals.length === 0 && <option value="">불러오는 중…</option>}
            {chemicals.map((c) => <option key={c.chem_id} value={c.chem_id}>{c.name_ko}</option>)}
          </select>
        </label>
        <label style={labelStyle}>선석
          <select value={form.berth_name} onChange={set('berth_name')} style={inputStyle}>
            {BERTHS.map((b) => <option key={b}>{b}</option>)}
          </select>
        </label>
        <label style={labelStyle}>DWT
          <input type="number" value={form.dwt} onChange={set('dwt')} style={inputStyle} />
        </label>
        <label style={labelStyle}>GT
          <input type="number" value={form.gt} onChange={set('gt')} style={inputStyle} />
        </label>
        <label style={labelStyle}>흘수 (m)
          <input type="number" step="0.1" value={form.draught_m} onChange={set('draught_m')} style={inputStyle} />
        </label>
        <label style={labelStyle}>전장 (m)
          <input type="number" value={form.loa_m} onChange={set('loa_m')} style={inputStyle} />
        </label>
        <label style={labelStyle}>작업시각 (0~23시)
          <input type="number" min="0" max="23" value={form.work_hour} onChange={set('work_hour')} style={inputStyle} />
        </label>
        <label style={labelStyle}>인접 선석 (ADJACENT_TO)
          {adjacentOptions.length > 0 ? (
            <select value={adjacentBerth} onChange={set('adjacent_berth')} style={inputStyle}>
              {adjacentOptions.map((b) => <option key={b}>{b}</option>)}
            </select>
          ) : (
            <span style={{ ...inputStyle, color: COLORS.textDim, display: 'inline-block', boxSizing: 'border-box' }}>인접 선석 없음</span>
          )}
        </label>
        <label style={labelStyle}>인접 선석 하역화물 (없으면 비움)
          <select value={form.adjacent_chem_id} onChange={set('adjacent_chem_id')} style={inputStyle}
            disabled={adjacentOptions.length === 0}>
            <option value="">작업 없음</option>
            {chemicals.map((c) => <option key={c.chem_id} value={c.chem_id}>{c.name_ko}</option>)}
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '13px', color: COLORS.textPrimary, display: 'flex', gap: '6px', alignItems: 'center' }}>
          <input type="checkbox" checked={form.sire_valid} onChange={set('sire_valid')} /> SIRE 승인 이력 (유조선)
        </label>
        <label style={{ fontSize: '13px', color: COLORS.textPrimary, display: 'flex', gap: '6px', alignItems: 'center' }}>
          <input type="checkbox" checked={form.cdi_valid} onChange={set('cdi_valid')} /> CDI 검사 이력 (케미칼선)
        </label>
        <button onClick={run} style={{
          marginLeft: 'auto', background: `linear-gradient(135deg, ${COLORS.teal}, ${COLORS.tealDark})`, color: '#04222b',
          border: 'none', borderRadius: '8px', padding: '9px 22px', fontWeight: 700, cursor: 'pointer', fontSize: '14px',
        }}>
          안전 심사 실행
        </button>
      </div>

      {/* 판정 결과 */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{
              padding: '10px 22px', borderRadius: '10px', border: `2px solid ${style.color}`,
              color: style.color, fontSize: '22px', fontWeight: 800, background: COLORS.card,
            }}>
              {result.risk_level}
            </div>
            <div style={{ fontSize: '12px', color: COLORS.textSecondary, lineHeight: 1.6 }}>
              {result.explanation?.summary}<br />
              혼재 룰엔진 하한 {result.risk_level_basis?.rule_engine_floor}
              {result.risk_level_basis?.imdg_segregation_code != null && ` · IMDG 격리코드 ${result.risk_level_basis.imdg_segregation_code}`}
              {` · 인화성 ${result.risk_level_basis?.flammability_grade}`}
            </div>
          </div>

          {hits.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {hits.map((g) => (
                <div key={g.rule} style={{
                  display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '10px 12px',
                  background: 'rgba(255, 75, 110, 0.08)', border: '1px solid rgba(255, 75, 110, 0.3)', borderRadius: '8px',
                }}>
                  <FaTimesCircle color={COLORS.red} style={{ marginTop: '2px', flexShrink: 0 }} />
                  <div style={{ fontSize: '13px', color: COLORS.textPrimary }}>
                    <b>[{g.rule}] {g.name}</b>
                    <span style={{
                      marginLeft: '8px', fontSize: '11px', color: COLORS.red,
                      border: `1px solid ${COLORS.red}`, borderRadius: '4px', padding: '1px 6px',
                    }}>{g.severity}</span>
                    <div style={{ color: COLORS.textSecondary, marginTop: '2px' }}>{g.reason}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button onClick={() => setShowAllGates((v) => !v)} style={{
            alignSelf: 'flex-start', background: 'none', border: 'none', color: COLORS.info,
            cursor: 'pointer', fontSize: '12px', padding: 0,
          }}>
            {showAllGates ? '▲ 통과 게이트 접기' : `▼ 통과 게이트 ${passes.length}개 펼치기`}
          </button>
          {showAllGates && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '6px' }}>
              {passes.map((g) => (
                <div key={g.rule} style={{ fontSize: '12px', color: COLORS.textSecondary, display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                  <FaCheckCircle color={COLORS.teal} style={{ marginTop: '2px', flexShrink: 0, opacity: 0.6 }} />
                  <span><b>{g.rule}</b> {g.name} — {g.reason}</span>
                </div>
              ))}
            </div>
          )}

          {result.explanation?.checklist?.length > 0 && (
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: COLORS.textPrimary, marginBottom: '6px' }}>
                MSDS 안전 체크리스트
              </div>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: COLORS.textSecondary, lineHeight: 1.8 }}>
                {result.explanation.checklist.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

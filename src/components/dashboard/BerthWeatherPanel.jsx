import { useEffect, useRef, useState } from 'react';
import useOnsanApi from '../../hooks/useOnsanApi';
import useSensorStore from '../../stores/useSensorStore';
import { COLORS } from '../../utils/constants';
import { FaAnchor, FaExclamationTriangle } from 'react-icons/fa';

// 4단계 에스컬레이션 뱃지 색 (정상 → 하역중단 → 이안 → 호스분리)
const LEVEL_STYLE = {
  '정상': { color: COLORS.teal, label: '정상 — 하역 가능' },
  '하역중단': { color: COLORS.yellow, label: '하역작업 중단' },
  '이안': { color: '#ff8c42', label: '부두 이안' },
  '호스분리': { color: COLORS.red, label: '로딩암/호스 분리' },
  '판단불가': { color: COLORS.textDim, label: '판단불가 (fail-safe)' },
};

function ThresholdChip({ name, t }) {
  if (!t || (t.wind == null && t.wave == null)) return null;
  const parts = [];
  if (t.wind != null) parts.push(`풍속 ${t.wind}m/s`);
  if (t.wave != null) parts.push(`파고 ${t.wave}m`);
  return (
    <span style={{
      fontSize: '11px', color: COLORS.textSecondary, background: COLORS.card,
      border: `1px solid ${COLORS.border}`, borderRadius: '6px', padding: '3px 8px',
    }}>
      {name} {parts.join(' · ')}
    </span>
  );
}

export default function BerthWeatherPanel() {
  const { fetchBerthGroups, assessBerthWeather } = useOnsanApi();
  const berthGroups = useSensorStore((s) => s.berthGroups);
  const verdict = useSensorStore((s) => s.berthWeather);
  const selectedBerthGroup = useSensorStore((s) => s.selectedBerthGroup);

  const [berthGroup, setBerthGroup] = useState('');
  const [windSpeed, setWindSpeed] = useState('13');
  const [waveHeight, setWaveHeight] = useState('1.2');
  const [flash, setFlash] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => { fetchBerthGroups(); }, [fetchBerthGroups]);

  // 선석군 로드되면 첫 항목 선택 + 최초 판정
  useEffect(() => {
    if (!berthGroup && berthGroups.length > 0) setBerthGroup(berthGroups[0]);
  }, [berthGroups, berthGroup]);

  // 지도에서 선석 클릭 시 해당 선석군으로 전환 + 패널로 스크롤 + 하이라이트
  useEffect(() => {
    if (!selectedBerthGroup) return;
    if (selectedBerthGroup !== berthGroup) setBerthGroup(selectedBerthGroup);
    rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBerthGroup]);

  useEffect(() => {
    if (berthGroup) assessBerthWeather({ berthGroup, windSpeed, waveHeight });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [berthGroup]);

  const run = () => assessBerthWeather({ berthGroup, windSpeed, waveHeight });
  const style = LEVEL_STYLE[verdict?.status] || LEVEL_STYLE['판단불가'];
  const th = verdict?.thresholds_used;

  const inputStyle = {
    width: '80px', background: COLORS.card, color: COLORS.textPrimary,
    border: `1px solid ${COLORS.border}`, borderRadius: '8px', padding: '8px 10px', fontSize: '14px',
  };

  return (
    <div
      ref={rootRef}
      className="glass-card"
      style={{
        transition: 'box-shadow 0.4s, border-color 0.4s',
        ...(flash ? { boxShadow: `0 0 0 2px ${COLORS.teal}, 0 0 18px ${COLORS.teal}55` } : {}),
      }}
    >
      <div className="glass-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 className="glass-card-title"><FaAnchor style={{ marginRight: '8px', color: COLORS.teal }} />선석별 하역 판정 (온산 MVP)</h3>
        <span style={{ fontSize: '12px', color: COLORS.textDim }}>터미널 입항정보 9.8 실측 임계 · 3단계 에스컬레이션</span>
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '16px' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: COLORS.textSecondary }}>
          선석군
          <select value={berthGroup} onChange={(e) => setBerthGroup(e.target.value)}
            style={{ ...inputStyle, width: '220px' }}>
            {berthGroups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: COLORS.textSecondary }}>
          풍속 (m/s)
          <input type="number" step="0.1" value={windSpeed} onChange={(e) => setWindSpeed(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: COLORS.textSecondary }}>
          파고 (m)
          <input type="number" step="0.1" value={waveHeight} onChange={(e) => setWaveHeight(e.target.value)} style={inputStyle} />
        </label>
        <button onClick={run} style={{
          background: `linear-gradient(135deg, ${COLORS.teal}, ${COLORS.tealDark})`, color: '#04222b',
          border: 'none', borderRadius: '8px', padding: '9px 20px', fontWeight: 700, cursor: 'pointer', fontSize: '14px',
        }}>
          판정
        </button>
      </div>

      {verdict && (
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{
            minWidth: '170px', textAlign: 'center', padding: '16px',
            background: COLORS.card, border: `2px solid ${style.color}`, borderRadius: '12px',
          }}>
            <div style={{ fontSize: '28px', fontWeight: 800, color: style.color }}>{verdict.status}</div>
            <div style={{ fontSize: '12px', color: COLORS.textSecondary, marginTop: '4px' }}>{style.label}</div>
          </div>

          <div style={{ flex: 1, minWidth: '260px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <ThresholdChip name="중단" t={th?.stop} />
              <ThresholdChip name="이안" t={th?.unberth} />
              <ThresholdChip name="호스분리" t={th?.disconnect} />
              {th?.source && (
                <span style={{ fontSize: '11px', color: COLORS.textDim, alignSelf: 'center' }}>출처 {th.source}</span>
              )}
            </div>
            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: COLORS.textPrimary, lineHeight: 1.7 }}>
              {(verdict.reasons || []).map((r, i) => <li key={i}>{r}</li>)}
            </ul>
            {verdict.forecast_warning && (
              <div style={{ fontSize: '13px', color: COLORS.yellow, display: 'flex', gap: '6px', alignItems: 'center' }}>
                <FaExclamationTriangle /> {verdict.forecast_warning}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

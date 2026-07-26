import useDashboardData from '../../hooks/useDashboardData';
import { COLORS } from '../../utils/constants';
import { FaWind, FaWater, FaArrowsAltV, FaEye, FaLocationArrow } from 'react-icons/fa';

// 임계값 (CLAUDE.md: 풍속 14m/s 초과 시 경고)
const THRESHOLDS = {
  wind: { warn: 10, danger: 14 }, // m/s
  wave: { warn: 1.5, danger: 2.0 }, // m
  visibility: { warnBelow: 5, dangerBelow: 1 }, // km
};

const statusColor = (value, { warn, danger, warnBelow, dangerBelow }) => {
  if (danger != null && value >= danger) return COLORS.red;
  if (warn != null && value >= warn) return COLORS.yellow;
  if (dangerBelow != null && value <= dangerBelow) return COLORS.red;
  if (warnBelow != null && value <= warnBelow) return COLORS.yellow;
  return COLORS.teal;
};

function WeatherTile({ icon, label, value, unit, color, sub }) {
  return (
    <div style={{
      flex: 1, minWidth: '140px', background: COLORS.card,
      border: `1px solid ${color === COLORS.teal ? COLORS.border : color}`,
      borderRadius: '12px', padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: '6px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: COLORS.textSecondary, fontSize: '13px' }}>
        <span style={{ color }}>{icon}</span> {label}
      </div>
      <div style={{ fontSize: '26px', fontWeight: 'bold', color }}>
        {value}
        <span style={{ fontSize: '14px', color: COLORS.textSecondary, marginLeft: '4px' }}>{unit}</span>
      </div>
      {sub && <div style={{ fontSize: '12px', color: COLORS.textDim }}>{sub}</div>}
    </div>
  );
}

export default function WeatherPanel() {
  const { data } = useDashboardData();
  const w = data?.weather;
  if (!w) return null;

  const windColor = statusColor(w.wind_speed_ms, THRESHOLDS.wind);
  const waveColor = statusColor(w.wave_height_sig_m, THRESHOLDS.wave);
  // 계약 필드명은 visibility_m 이지만 값 스케일(19.8)상 km 단위로 표시
  const visColor = statusColor(w.visibility_m, THRESHOLDS.visibility);

  const observed = w.observed_at_utc
    ? new Date(w.observed_at_utc).toLocaleString('ko-KR', {
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
        hour12: false, timeZone: 'Asia/Seoul',
      })
    : '-';

  return (
    <div className="glass-card">
      <div className="glass-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 className="glass-card-title">항만 기상 현황</h3>
        <span style={{ fontSize: '12px', color: COLORS.textDim }}>관측 {observed} (KST)</span>
      </div>
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
        <WeatherTile
          icon={<FaWind />}
          label="풍속"
          value={w.wind_speed_ms?.toFixed(1)}
          unit="m/s"
          color={windColor}
          sub={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <FaLocationArrow style={{
                // FaLocationArrow 기본 방향(북동 45°) 보정 후 풍향 적용
                transform: `rotate(${(w.wind_dir_deg ?? 0) - 45}deg)`,
                color: COLORS.textSecondary,
              }} />
              풍향 {w.wind_dir_deg}° · 임계 {THRESHOLDS.wind.danger}m/s
            </span>
          }
        />
        <WeatherTile
          icon={<FaWater />}
          label="유의파고"
          value={w.wave_height_sig_m?.toFixed(1)}
          unit="m"
          color={waveColor}
          sub={`임계 ${THRESHOLDS.wave.danger}m`}
        />
        <WeatherTile
          icon={<FaArrowsAltV />}
          label="조위"
          value={w.tide_level_cm}
          unit="cm"
          color={COLORS.info}
          sub="울산 조위관측소"
        />
        <WeatherTile
          icon={<FaEye />}
          label="시정"
          value={w.visibility_m?.toFixed(1)}
          unit="km"
          color={visColor}
          sub={`경고 ${THRESHOLDS.visibility.warnBelow}km 미만`}
        />
      </div>
    </div>
  );
}

import useSensorStore from '../../stores/useSensorStore';
import useDashboardData from '../../hooks/useDashboardData';
import { COLORS } from '../../utils/constants';
import { FaBell, FaCheck, FaShip } from 'react-icons/fa';

const LEVEL_STYLE = {
  DANGER: { color: COLORS.red, label: '위험' },
  WARNING: { color: COLORS.yellow, label: '경고' },
  INFO: { color: COLORS.info, label: '정보' },
};

const formatKST = (utc) =>
  utc ? new Date(utc).toLocaleString('ko-KR', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hour12: false, timeZone: 'Asia/Seoul',
  }) : '-';

export default function AlertCenter() {
  const { data } = useDashboardData();
  const alertAcks = useSensorStore((s) => s.alertAcks);
  const ackAlert = useSensorStore((s) => s.ackAlert);
  const setSelectedVessel = useSensorStore((s) => s.setSelectedVessel);

  const alerts = data?.alerts ?? [];
  const vessels = data?.vessels ?? [];
  const unackedCount = alerts.filter((a) => !alertAcks[`${a.type}-${a.created_at_utc}`]).length;

  return (
    <div className="glass-card">
      <div className="glass-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 className="glass-card-title">
          <FaBell style={{ marginRight: '8px', color: unackedCount > 0 ? COLORS.red : COLORS.teal }} />
          경고 센터
          {unackedCount > 0 && (
            <span style={{
              marginLeft: '10px', background: COLORS.red, color: '#fff', borderRadius: '999px',
              padding: '2px 10px', fontSize: '12px', fontWeight: 800,
            }}>
              미확인 {unackedCount}
            </span>
          )}
        </h3>
        <span style={{ fontSize: '12px', color: COLORS.textDim }}>
          확인(ACK) 이력은 세션 내 보존 · 백엔드 연동 시 DB 기록
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {alerts.length === 0 && (
          <div style={{ color: COLORS.textDim, fontSize: '13px' }}>활성 경고 없음</div>
        )}
        {alerts.map((a) => {
          const id = `${a.type}-${a.created_at_utc}`;
          const ack = alertAcks[id];
          const style = LEVEL_STYLE[a.level] || LEVEL_STYLE.INFO;
          const vessel = a.port_call_id ? vessels.find((v) => v.port_call_id === a.port_call_id) : null;
          return (
            <div key={id} style={{
              display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
              background: COLORS.card, borderLeft: `4px solid ${style.color}`,
              borderRadius: '8px', padding: '10px 14px', opacity: ack ? 0.55 : 1,
            }}>
              <span style={{
                color: style.color, fontWeight: 800, fontSize: '12px',
                border: `1px solid ${style.color}`, borderRadius: '4px', padding: '2px 8px', flexShrink: 0,
              }}>
                {style.label}
              </span>
              <div style={{ flex: 1, minWidth: '220px' }}>
                <div style={{ fontSize: '13.5px', fontWeight: 600 }}>{a.message}</div>
                <div style={{ fontSize: '11.5px', color: COLORS.textDim, marginTop: '2px' }}>
                  {a.type} · {formatKST(a.created_at_utc)} (KST)
                  {ack && <span style={{ color: COLORS.teal, marginLeft: '10px' }}>✓ {ack.by} · {formatKST(ack.at)} 확인</span>}
                </div>
              </div>
              {vessel && (
                <button
                  onClick={() => setSelectedVessel(vessel)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
                    borderRadius: '6px', border: `1px solid ${COLORS.border}`, background: 'transparent',
                    color: COLORS.info, cursor: 'pointer', fontSize: '12px', fontWeight: 700,
                  }}
                >
                  <FaShip /> {vessel.vessel_name}
                </button>
              )}
              {!ack && (
                <button
                  onClick={() => ackAlert(id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px',
                    borderRadius: '6px', border: 'none', background: COLORS.teal,
                    color: '#04222b', cursor: 'pointer', fontSize: '12px', fontWeight: 800,
                  }}
                >
                  <FaCheck /> 확인
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

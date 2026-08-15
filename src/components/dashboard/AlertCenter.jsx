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

// 확인(ACK) 식별자. 백엔드 경고(GET /dashboard/alerts)는 재항 현황을 매번 다시
// 판정해 만들기 때문에 생성시각이 없다 — 시각을 키에 쓰면 같은 유형 경고가 전부
// 한 덩어리로 묶여 하나만 확인해도 전부 확인 처리된다. 내용(message)까지 넣어야
// 경고 하나하나가 구분된다.
const alertId = (a) => `${a.type}-${a.berth_name ?? ''}-${a.message ?? a.created_at_utc ?? ''}`;

export default function AlertCenter() {
  const { data } = useDashboardData();
  const alertAcks = useSensorStore((s) => s.alertAcks);
  const ackAlert = useSensorStore((s) => s.ackAlert);
  const setSelectedVessel = useSensorStore((s) => s.setSelectedVessel);

  const alerts = data?.alerts ?? [];
  // 경고에 딸린 '선박 보기' 버튼용 — 실AIS 목록에서 찾는다(mock 아님)
  const vessels = data?.real_traffic ?? [];
  const unackedCount = alerts.filter((a) => !alertAcks[alertId(a)]).length;
  // 규칙엔진 실판정인지, 백엔드가 죽어 mock-server 폴백인지 화면에 드러낸다
  const fromRuleEngine = data?.data_source?.alerts === 'REAL_RULE_ENGINE';

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
          {fromRuleEngine
            ? '혼재금지·IMDG 격리·흘수 판정 (safety 규칙엔진) · 확인 이력은 세션 내 보존'
            : '확인(ACK) 이력은 세션 내 보존 · 백엔드 연동 시 DB 기록'}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {alerts.length === 0 && (
          <div style={{ color: COLORS.textDim, fontSize: '13px' }}>활성 경고 없음</div>
        )}
        {alerts.map((a) => {
          const id = alertId(a);
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
                <div style={{ fontSize: '13.5px', fontWeight: 600 }}>
                  {a.message}
                  {/* 규칙엔진이 낸 최종 등급 — 문장 안에도 있지만 눈에 먼저 띄게 뱃지로 */}
                  {a.risk_level && (
                    <span style={{
                      marginLeft: '8px', fontSize: '11px', fontWeight: 800, color: style.color,
                      border: `1px solid ${style.color}`, borderRadius: '4px', padding: '1px 6px',
                    }}>
                      {a.risk_level}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '11.5px', color: COLORS.textDim, marginTop: '2px' }}>
                  {a.type}
                  {/* 근거를 숨기지 않는다 — 관제사가 무엇을 믿고 조치하는지 알아야 한다 */}
                  {a.basis ? ` · ${a.basis}` : ''}
                  {a.created_at_utc ? ` · ${formatKST(a.created_at_utc)} (KST)` : ''}
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

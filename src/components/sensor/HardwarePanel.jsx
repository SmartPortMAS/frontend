import useHardwareData from '../../hooks/useHardwareData';
import { COLORS } from '../../utils/constants';
import { FaDoorOpen, FaDoorClosed, FaLock } from 'react-icons/fa';

const GATE_STATE = {
  OPEN: { label: '승인 (통행 가능)', color: COLORS.teal, icon: <FaDoorOpen /> },
  CLOSED: { label: '차단', color: COLORS.yellow, icon: <FaDoorClosed /> },
  INTERLOCK: { label: '인터락 차단', color: COLORS.red, icon: <FaLock /> },
};

const BEACON_COLOR = {
  GREEN: COLORS.teal,
  AMBER: COLORS.yellow,
  RED: COLORS.red,
};

// 경광등: 현재 점등 색만 발광
function Beacon({ beacon }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', alignItems: 'center' }}>
      {['RED', 'AMBER', 'GREEN'].map((c) => {
        const on = beacon === c;
        return (
          <span
            key={c}
            style={{
              width: '16px', height: '16px', borderRadius: '50%',
              background: on ? BEACON_COLOR[c] : COLORS.card,
              border: `1px solid ${on ? BEACON_COLOR[c] : COLORS.border}`,
              boxShadow: on ? `0 0 10px ${BEACON_COLOR[c]}` : 'none',
              transition: 'all 0.3s',
            }}
          />
        );
      })}
      <span style={{ fontSize: '10px', color: COLORS.textDim, marginTop: '2px' }}>경광등</span>
    </div>
  );
}

function GateCard({ gate, onCommand }) {
  const st = GATE_STATE[gate.state] || GATE_STATE.CLOSED;
  const interlocked = gate.state === 'INTERLOCK';

  return (
    <div className="sensor-card" style={{ borderLeft: `3px solid ${st.color}` }}>
      <div className="sensor-card-header">
        <span className="sensor-id">{gate.name} ({gate.gate_id})</span>
        <span style={{ fontSize: '11px', color: COLORS.textDim }}>{gate.mode}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', margin: '12px 0' }}>
        <Beacon beacon={gate.beacon} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: st.color, fontSize: '17px', fontWeight: 'bold' }}>
            {st.icon} {st.label}
          </div>
          <div style={{ fontSize: '12px', color: gate.fail_safe_ok ? COLORS.textSecondary : COLORS.red, marginTop: '6px' }}>
            페일세이프 {gate.fail_safe_ok ? '정상' : '이상!'}
          </div>
          {interlocked && (
            <div style={{ fontSize: '12px', color: COLORS.red, marginTop: '4px' }}>
              혼재금지 위반 감지 — 현장 확인 전까지 원격 승인 불가
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => onCommand(gate.gate_id, 'APPROVE')}
          disabled={interlocked}
          style={{
            flex: 1, padding: '8px', borderRadius: '8px', border: 'none', fontWeight: 'bold',
            cursor: interlocked ? 'not-allowed' : 'pointer',
            background: interlocked ? COLORS.card : COLORS.teal,
            color: interlocked ? COLORS.textDim : '#04211c',
          }}
        >
          승인
        </button>
        <button
          onClick={() => onCommand(gate.gate_id, 'BLOCK')}
          style={{
            flex: 1, padding: '8px', borderRadius: '8px', border: `1px solid ${COLORS.red}`,
            fontWeight: 'bold', cursor: 'pointer', background: 'transparent', color: COLORS.red,
          }}
        >
          차단
        </button>
      </div>
    </div>
  );
}

export default function HardwarePanel() {
  const { hardware, sendGateCommand } = useHardwareData();

  return (
    <>
      <h3 style={{ fontSize: '16px', margin: '24px 0 16px', color: 'var(--teal)' }}>
        하드웨어 노드 — 사전 승인 게이트 (라즈베리파이 + 릴레이)
      </h3>
      <div className="sensor-grid">
        {hardware.gates.map((gate) => (
          <GateCard key={gate.gate_id} gate={gate} onCommand={sendGateCommand} />
        ))}
      </div>
    </>
  );
}

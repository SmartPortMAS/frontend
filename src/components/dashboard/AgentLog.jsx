import { FaRobot } from 'react-icons/fa';

export default function AgentLog({ logs }) {
  if (!logs || logs.length === 0) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '13px' }}>
        최근 에이전트 활동이 없습니다.
      </div>
    );
  }

  return (
    <div className="agent-log-list">
      {logs.map((log, idx) => (
        <div key={idx} className="agent-log-item">
          <FaRobot color="var(--teal)" style={{ marginTop: '2px', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <span className="agent-log-action">{log.agent}: {log.action}</span>
              <span className="agent-log-time">{new Date(log.timestamp).toLocaleTimeString()}</span>
            </div>
            <div className="agent-log-detail">{log.details}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

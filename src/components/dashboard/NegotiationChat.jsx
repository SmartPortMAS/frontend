import { useState, useEffect } from 'react';
import { FaRobot, FaShip, FaWarehouse } from 'react-icons/fa';

export default function NegotiationChat() {
  const [messages, setMessages] = useState([
    { id: 1, sender: 'ShipAgent', text: 'S-Titan (원유 5만톤) 접안 요청합니다. ETA +2h', time: '10:00:01' },
    { id: 2, sender: 'TerminalAgent', text: 'B004 선석 배정 가능합니다. 단, 파도(2.5m)로 인해 감속 접안 필요.', time: '10:00:05' },
    { id: 3, sender: 'SafetyAgent', text: '동의합니다. 안전 등급 B로 조정하며 하역 속도는 80%로 제한합니다.', time: '10:00:08' },
    { id: 4, sender: 'ShipAgent', text: '수락합니다. 스케줄을 확정합니다.', time: '10:00:10' }
  ]);

  return (
    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="glass-card-header">
        <h3 className="glass-card-title">멀티 에이전트 협상 로그</h3>
      </div>
      <div className="chat-container" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {messages.map(m => (
          <div key={m.id} className={`chat-message ${m.sender === 'TerminalAgent' ? 'chat-right' : 'chat-left'}`} style={{
            display: 'flex', gap: '10px', alignItems: 'flex-start',
            flexDirection: m.sender === 'TerminalAgent' ? 'row-reverse' : 'row'
          }}>
            <div className="chat-avatar" style={{ background: 'rgba(255,255,255,0.1)', padding: '8px', borderRadius: '50%', color: m.sender === 'ShipAgent' ? '#38bdf8' : m.sender === 'TerminalAgent' ? '#10b981' : '#f59e0b' }}>
              {m.sender === 'ShipAgent' ? <FaShip /> : m.sender === 'TerminalAgent' ? <FaWarehouse /> : <FaRobot />}
            </div>
            <div className="chat-bubble" style={{ 
              background: m.sender === 'TerminalAgent' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(56, 189, 248, 0.2)', 
              padding: '10px 14px', 
              borderRadius: '12px',
              maxWidth: '80%'
            }}>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>{m.sender} • {m.time}</div>
              <div style={{ fontSize: '13px', color: '#f8fafc', lineHeight: '1.4' }}>{m.text}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

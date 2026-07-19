import { useState } from 'react';
import { Html } from '@react-three/drei';
import { FaTimes, FaShip, FaDatabase, FaWater, FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa';

export default function InfoPopup({ object, onClose }) {
  const [isHumanApproved, setIsHumanApproved] = useState(false);

  if (!object) return null;

  const type = object.id.startsWith('T') ? 'Tank' : object.id.startsWith('S') ? 'Ship' : 'Pipe';

  return (
    <Html position={[0, 15, 0]} center zIndexRange={[100, 0]}>
      <div className="glass-hud">
        <div className="hud-header">
          <div className="hud-title">
            {type === 'Ship' && <FaShip className="hud-icon" />}
            {type === 'Tank' && <FaDatabase className="hud-icon" />}
            {type === 'Pipe' && <FaWater className="hud-icon" />}
            <span>{object.id}</span>
          </div>
          <button className="hud-close" onClick={onClose}><FaTimes /></button>
        </div>
        
        <div className="hud-body">
          <div className="hud-status">
            <span className="status-dot" data-status={object.status}></span>
            <span className="status-text">{object.status.toUpperCase()}</span>
          </div>

          {type === 'Ship' && (
            <div className="hud-details">
              <div className="detail-row">
                <span>Berth</span>
                <strong>{object.berth}</strong>
              </div>
              <div className="detail-row">
                <span>Speed / Heading</span>
                <strong>{object.vessel_speed} kn / {object.vessel_heading}°</strong>
              </div>
              <div className="detail-row">
                <span>Cargo Load</span>
                <strong>{object.cargoAmount.toLocaleString()} / 50,000 t</strong>
              </div>
              <div className="progress-container">
                <div className="progress-bar" style={{ width: `${(object.cargoAmount / 50000) * 100}%` }}></div>
              </div>
              <div className="hud-actions" style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                <button className="action-btn" onClick={() => alert('스케줄 재조정 요청 전송')} style={{ flex: 1, padding: '8px', background: '#38bdf8', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer' }}>스케줄 재조정</button>
              </div>
            </div>
          )}

          {type === 'Tank' && (
            <div className="hud-details">
              <div className="detail-row">
                <span>Cargo Type</span>
                <strong>{object.cargoType}</strong>
              </div>
              <div className="detail-row">
                <span>Temperature</span>
                <strong>{object.temperature.toFixed(1)} °C</strong>
              </div>
              <div className="detail-row">
                <span>Pressure</span>
                <strong>{object.pressure.toFixed(2)} bar</strong>
              </div>
              <div className="detail-row">
                <span>Fill Level</span>
                <strong>{object.level.toFixed(1)} %</strong>
              </div>
              <div className="progress-container tank-progress">
                <div className="progress-bar" style={{ width: `${object.level}%`, background: object.level > 90 ? '#ef4444' : '#10b981' }}></div>
              </div>
              <div className="hud-actions" style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                <button className="action-btn" onClick={() => alert('긴급 차단(ESD) 작동')} style={{ flex: 1, padding: '8px', background: '#ff4b6e', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }}>긴급 차단 (ESD)</button>
                <button className="action-btn" onClick={() => alert('유속 감소 명령 전송')} style={{ flex: 1, padding: '8px', background: '#f59e0b', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer' }}>유속 감속</button>
              </div>
            </div>
          )}

          {/* AI Safety Clearance Block (Human-in-the-loop) */}
          <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: isHumanApproved ? '#10b981' : '#f59e0b', fontSize: '12px', fontWeight: 'bold', marginBottom: '8px' }}>
              {isHumanApproved ? <FaCheckCircle /> : <FaExclamationTriangle />} 
              {isHumanApproved ? '관제사 최종 승인 완료' : 'AI 권고: 관제사 승인 대기 중'}
            </div>
            <div style={{ background: 'rgba(0,0,0,0.4)', padding: '8px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '11px', color: '#94a3b8' }}>
              <div className="typing-text">&gt; GraphDB 인접 탱크 화물 분석... OK</div>
              <div className="typing-text" style={{ animationDelay: '1s' }}>&gt; 기상 조건(풍속 3m/s) 하역 가능성... OK</div>
              <div className="typing-text" style={{ animationDelay: '2s' }}>&gt; LLM Rule-Engine 권고 도출 완료.</div>
              {!isHumanApproved ? (
                <div style={{ marginTop: '10px', animation: 'fadeIn 0.5s ease 3s forwards', opacity: 0 }}>
                  <button 
                    onClick={() => setIsHumanApproved(true)}
                    style={{ width: '100%', padding: '8px', background: '#f59e0b', color: '#000', fontWeight: 'bold', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    [ VTS 관제사 최종 승인 (Override) ]
                  </button>
                </div>
              ) : (
                <div style={{ marginTop: '10px', color: '#10b981', fontWeight: 'bold' }}>
                  &gt; [SYSTEM] 관제사(Oper-01) 승인 완료. 하역 개시.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <style>{`
        .typing-text {
          overflow: hidden;
          white-space: nowrap;
          border-right: 2px solid #10b981;
          width: 0;
          animation: typing 1.5s steps(30, end) forwards, blink-caret 0.75s step-end infinite;
          opacity: 0;
          animation-delay: 0.1s;
        }
        @keyframes typing {
          0% { width: 0; opacity: 1; }
          100% { width: 100%; opacity: 1; border-right: none; }
        }
        @keyframes blink-caret {
          from, to { border-color: transparent; }
          50% { border-color: #10b981; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </Html>
  );
}

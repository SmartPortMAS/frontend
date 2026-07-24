import { useState } from 'react';
import { Html } from '@react-three/drei';
import {
  FaTimes, FaShip, FaDatabase, FaWater, FaAnchor,
  FaCheckCircle, FaExclamationTriangle,
} from 'react-icons/fa';
import {
  ONSAN_BERTHS,
  ONSAN_WEATHER_GROUP,
  onsanAdjacentBerthNames,
} from '../../utils/geoUtils';

const TYPE_LABEL = { Ship: '선박', Tank: '저장탱크', Pipe: '이송배관', Berth: '선석' };

function Row({ label, value }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{value ?? '-'}</strong>
    </div>
  );
}

export default function InfoPopup({ object, onClose }) {
  const [isHumanApproved, setIsHumanApproved] = useState(false);

  if (!object) return null;

  // 저장된 type 필드 우선. (구버전 id 접두어 추정은 'HMM ...' 선박을 오판하므로 폴백만)
  const type = object.type
    || (String(object.id).startsWith('T-') ? 'Tank' : String(object.id).startsWith('P-') ? 'Pipe' : 'Ship');

  const berthInfo = type === 'Berth' ? ONSAN_BERTHS[object.id] : null;
  const adjacents = berthInfo ? onsanAdjacentBerthNames(berthInfo.name) : [];

  return (
    <Html fullscreen zIndexRange={[100, 0]} style={{ pointerEvents: 'none' }}>
      {/* Omniverse/2D Map 버튼(top 50~88) 아래에 배치 — 버튼에 가려지지 않음 */}
      <div style={{ position: 'absolute', top: 100, right: 16, pointerEvents: 'auto', width: '300px' }}>
        <div className="glass-hud" style={{ width: '100%' }}>
          <div className="hud-header">
            <div className="hud-title">
              {type === 'Ship' && <FaShip className="hud-icon" />}
              {type === 'Tank' && <FaDatabase className="hud-icon" />}
              {type === 'Pipe' && <FaWater className="hud-icon" />}
              {type === 'Berth' && <FaAnchor className="hud-icon" />}
              <span>{type === 'Berth' ? (berthInfo?.name || object.id) : object.id}</span>
              <span style={{ fontSize: '11px', color: '#8ba3b8', marginLeft: '6px' }}>{TYPE_LABEL[type]}</span>
            </div>
            <button className="hud-close" onClick={onClose}><FaTimes /></button>
          </div>

          <div className="hud-body">
            {object.status && (
              <div className="hud-status">
                <span className="status-dot" data-status={object.status}></span>
                <span className="status-text">{String(object.status).toUpperCase()}</span>
              </div>
            )}

            {type === 'Ship' && (
              <div className="hud-details">
                <Row label="배정 선석" value={ONSAN_BERTHS[object.berth]?.name || object.berth} />
                <Row label="화물" value={object.cargoType} />
                <Row
                  label="적재량"
                  value={`${(object.cargoAmount ?? 0).toLocaleString()} / 50,000 t`}
                />
                <div className="progress-container">
                  <div className="progress-bar" style={{ width: `${((object.cargoAmount ?? 0) / 50000) * 100}%` }}></div>
                </div>
                {object.vessel_speed != null && (
                  <Row label="속력 / 침로" value={`${object.vessel_speed} kn / ${object.vessel_heading}°`} />
                )}
                <div className="hud-actions" style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                  <button className="action-btn" onClick={() => alert('스케줄 재조정 요청 전송')} style={{ flex: 1, padding: '8px', background: '#38bdf8', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer' }}>스케줄 재조정</button>
                </div>
              </div>
            )}

            {type === 'Tank' && (
              <div className="hud-details">
                <Row label="화물" value={object.cargoType} />
                <Row label="온도" value={`${object.temperature?.toFixed(1)} °C`} />
                <Row label="압력" value={`${object.pressure?.toFixed(2)} bar`} />
                <Row label="저장 수위" value={`${object.level?.toFixed(1)} %`} />
                <div className="progress-container tank-progress">
                  <div className="progress-bar" style={{ width: `${object.level}%`, background: object.level > 90 ? '#ef4444' : '#10b981' }}></div>
                </div>
                <div className="hud-actions" style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                  <button className="action-btn" onClick={() => alert('긴급 차단(ESD) 작동')} style={{ flex: 1, padding: '8px', background: '#ff4b6e', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }}>긴급 차단 (ESD)</button>
                  <button className="action-btn" onClick={() => alert('유속 감소 명령 전송')} style={{ flex: 1, padding: '8px', background: '#f59e0b', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer' }}>유속 감속</button>
                </div>
              </div>
            )}

            {type === 'Pipe' && (
              <div className="hud-details">
                <Row label="구간" value={object.feedTo ? `탱크팜 → ${object.feedTo}` : '탱크팜 → 안벽'} />
                <Row label="유량" value={`${(object.flowRate ?? 0).toLocaleString()} m³/h`} />
                <Row label="압력" value={`${object.pressure?.toFixed(1)} bar`} />
                <Row label="상태" value={(object.flowRate ?? 0) > 0 ? '이송 중' : '대기'} />
                <div className="hud-actions" style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                  <button className="action-btn" onClick={() => alert('배관 긴급 차단 명령 전송')} style={{ flex: 1, padding: '8px', background: '#ff4b6e', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }}>배관 차단</button>
                </div>
              </div>
            )}

            {type === 'Berth' && berthInfo && (
              <div className="hud-details">
                <Row label="운영사" value={berthInfo.operator} />
                <Row label="수역" value={berthInfo.waterway} />
                <Row label="접안능력" value={`${berthInfo.maxDwt?.toLocaleString()} DWT`} />
                {berthInfo.lengthM && <Row label="안벽 길이" value={`${berthInfo.lengthM} m`} />}
                <Row label="수심" value={`${berthInfo.depthM} m`} />
                <Row label="선석 수" value={`${berthInfo.berthCount}선석${berthInfo.singleton ? ' (단독 — 대체 불가)' : ''}`} />
                <Row label="취급화물" value={berthInfo.cargoTypes} />
                <Row label="기상 임계군" value={ONSAN_WEATHER_GROUP[object.id]} />
                <Row label="계류 선박" value={object.mooredShip || '없음'} />
                <div style={{ marginTop: '8px', fontSize: '11px', color: '#8ba3b8' }}>
                  ADJACENT_TO 인접(혼재 감시):{' '}
                  {adjacents.length > 0
                    ? adjacents.join(', ')
                    : '없음'}
                </div>
              </div>
            )}

            {/* AI Safety Clearance Block (Human-in-the-loop) — 선박/탱크만 */}
            {(type === 'Ship' || type === 'Tank') && (
              <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: isHumanApproved ? '#10b981' : '#f59e0b', fontSize: '12px', fontWeight: 'bold', marginBottom: '8px' }}>
                  {isHumanApproved ? <FaCheckCircle /> : <FaExclamationTriangle />}
                  {isHumanApproved ? '관제사 최종 승인 완료' : 'AI 권고: 관제사 승인 대기 중'}
                </div>
                <div style={{ background: 'rgba(0,0,0,0.4)', padding: '8px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '11px', color: '#94a3b8' }}>
                  <div className="typing-text">&gt; GraphDB 인접 선석 화물 분석... OK</div>
                  <div className="typing-text" style={{ animationDelay: '1s' }}>&gt; 선석별 기상 임계 판정... OK</div>
                  <div className="typing-text" style={{ animationDelay: '2s' }}>&gt; 결정론 게이트 R1~R15 통과. 권고 도출 완료.</div>
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
            )}
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
      </div>
    </Html>
  );
}

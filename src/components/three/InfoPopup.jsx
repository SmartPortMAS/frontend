import { Html } from '@react-three/drei';
import {
  FaTimes, FaShip, FaDatabase, FaWater, FaAnchor, FaFlask, FaPlay,
} from 'react-icons/fa';
import useSensorStore from '../../stores/useSensorStore';
import {
  ONSAN_BERTHS,
  ONSAN_WEATHER_GROUP,
  OMNIVERSE_BERTH_IDS,
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

/** 탱크·배관 계측값이 실측이 아님을 그 자리에서 밝힌다.
 *  센서 데이터 탭에는 이 고지가 있는데 3D 트윈에는 없어서, 같은 값이 한 화면에선
 *  데모, 다른 화면에선 계측값처럼 보였다. */
function MockNotice() {
  return (
    <div style={{
      marginTop: '10px', fontSize: '11px', color: '#f59e0b', lineHeight: 1.5,
      display: 'flex', gap: '6px', alignItems: 'flex-start',
    }}>
      <FaFlask style={{ marginTop: '2px', flexShrink: 0 }} />
      <span>데모 값 — 수위·온도·압력·유량 계측기는 미도입이라 수집 소스가 없습니다.</span>
    </div>
  );
}

export default function InfoPopup({ object, onClose }) {
  const requestOmniverse = useSensorStore((s) => s.requestOmniverse);
  if (!object) return null;

  // 저장된 type 필드 우선. (구버전 id 접두어 추정은 'HMM ...' 선박을 오판하므로 폴백만)
  const type = object.type
    || (String(object.id).startsWith('T-') ? 'Tank' : String(object.id).startsWith('P-') ? 'Pipe' : 'Ship');

  const berthInfo = type === 'Berth' ? ONSAN_BERTHS[object.id] : null;
  const adjacents = berthInfo ? onsanAdjacentBerthNames(berthInfo.name) : [];

  // 정밀 검토(Omniverse) 지목 — 선석에 붙은 배, 또는 선석 자체.
  // Omniverse 장면에는 온산 액체화물 부두 11곳만 있어 그 밖의 선석은 보여줄 자리가 없다.
  const omniBerthId = type === 'Ship' ? object.berth : type === 'Berth' ? object.id : null;
  const omniReady = Boolean(omniBerthId) && OMNIVERSE_BERTH_IDS.has(omniBerthId);
  const omniBerthName = type === 'Ship'
    ? (object.berth_name || ONSAN_BERTHS[object.berth]?.name)
    : berthInfo?.name;
  let omniNote = '이 선석의 기상 예보 72시간을 판정 규칙대로 돌려, 하역이 언제 막히는지 3D로 보여줍니다.';
  if (!omniReady) {
    omniNote = type === 'Ship' && !object.berth
      ? '선석에 붙은 배만 볼 수 있습니다 — 이 배는 항해 중이거나 정박지에서 대기 중입니다.'
      : '이 선석은 Omniverse 장면에 없습니다 — 장면은 온산 액체화물 부두 11곳만 재현합니다.';
  }

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
                <Row label="배정 선석" value={ONSAN_BERTHS[object.berth]?.name || object.berth || '미배정'} />
                <Row label="화물" value={object.cargoType || '미확인'} />
                {/* 적재량은 수집 소스가 없다(useLiveTwinShips: cargoAmount=null).
                    예전엔 "0 / 50,000 t" + 0% 진행바를 그렸는데, 50,000 은 근거 없는
                    하드코딩이었고 0 t 는 "빈 배"라는 틀린 정보였다. 모르면 비운다. */}
                <Row label="적재량" value={object.cargoAmount != null
                  ? `${object.cargoAmount.toLocaleString()} t`
                  : '미수집 (적재량 소스 없음)'} />
                {object.callsgn && <Row label="호출부호" value={object.callsgn} />}
                {object.mmsi && <Row label="MMSI" value={object.mmsi} />}
                {object.vessel_speed != null && (
                  <Row label="속력 / 침로" value={`${object.vessel_speed} kn / ${object.vessel_heading ?? '-'}°`} />
                )}
                {object.is_real && (
                  <div style={{ marginTop: '8px', fontSize: '11px', color: '#10b981' }}>
                    항만공사 선박위치 수신 — 위치·속력·항해상태는 실측입니다
                  </div>
                )}
              </div>
            )}

            {/* 탱크·배관은 계측기가 없어 데모 값이다(하드웨어 실물 8/3 보류).
                예전엔 여기 "긴급 차단(ESD)"·"유속 감속"·"배관 차단" 버튼이 있었는데
                전부 alert() 만 띄우고 아무것도 하지 않았다 — 안전 조작 버튼이
                동작하는 척하는 건 관제 화면에서 가장 위험한 거짓말이라 걷어냈다.
                실제 현장 제어(게이트 승인/차단·인터락)는 센서 데이터 탭에 있다. */}
            {type === 'Tank' && (
              <div className="hud-details">
                <Row label="화물" value={object.cargoType} />
                <Row label="온도" value={`${object.temperature?.toFixed(1)} °C`} />
                <Row label="압력" value={`${object.pressure?.toFixed(2)} bar`} />
                <Row label="저장 수위" value={`${object.level?.toFixed(1)} %`} />
                <div className="progress-container tank-progress">
                  <div className="progress-bar" style={{ width: `${object.level}%`, background: object.level > 90 ? '#ef4444' : '#10b981' }}></div>
                </div>
                <MockNotice />
              </div>
            )}

            {type === 'Pipe' && (
              <div className="hud-details">
                <Row label="구간" value={object.feedTo ? `탱크팜 → ${object.feedTo}` : '탱크팜 → 안벽'} />
                <Row label="유량" value={`${(object.flowRate ?? 0).toLocaleString()} t/h`} />
                <Row label="압력" value={`${object.pressure?.toFixed(1)} bar`} />
                <Row label="상태" value={(object.flowRate ?? 0) > 0 ? '이송 중' : '대기'} />
                <MockNotice />
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

            {/* 여기 있던 "AI 안전 승인" 블록을 걷어냈다.

                판정 3줄("GraphDB 인접 선석 화물 분석... OK" 등)은 CSS 타이핑
                애니메이션으로 찍는 고정 문자열이었고, 실제 판정을 부르지 않았다.
                승인 버튼도 로컬 state 만 바꿔 "승인 완료"를 출력했을 뿐 어디에도
                기록되지 않았다 — 판정하지 않고 판정한 척, 승인받지 않고 승인된 척
                하는 화면이었다.

                실제 판정은 두 곳에서 돈다:
                  · 선박 클릭 → 대시보드 지도/목록의 선박 상세 (useVesselSafety)
                  · 우하단 협상 콘솔 "종합 판정" (오케스트레이터 4에이전트) */}
            {(type === 'Ship' || type === 'Berth') && (
              <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <button
                  type="button"
                  disabled={!omniReady}
                  onClick={() => requestOmniverse({
                    berth: omniBerthName,
                    call_sign: type === 'Ship' ? (object.callsgn || null) : null,
                    // 선석 클릭은 선석만 지목한다 — mooredShip 은 '이름 (화물)' 표시용 문자열이라
                    // 호출부호가 없어 흘수를 붙일 수 없다. 배를 보려면 배를 누르면 된다.
                    vessel_name: type === 'Ship' ? object.id : null,
                  })}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    padding: '8px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 800,
                    fontFamily: 'inherit',
                    cursor: omniReady ? 'pointer' : 'not-allowed',
                    background: omniReady ? 'rgba(16, 185, 129, 0.18)' : 'rgba(148, 163, 184, 0.1)',
                    color: omniReady ? '#10b981' : '#64748b',
                    border: `1px solid ${omniReady ? 'rgba(16, 185, 129, 0.6)' : 'rgba(148, 163, 184, 0.3)'}`,
                  }}
                >
                  <FaPlay /> Omniverse 정밀 검토 — 앞으로 72시간
                </button>
                <div style={{ marginTop: '6px', fontSize: '11px', color: '#8ba3b8', lineHeight: 1.5 }}>{omniNote}</div>
              </div>
            )}

            {type === 'Ship' && object.is_real && (
              <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: '11px', color: '#8ba3b8', lineHeight: 1.6 }}>
                인접 선석 화물 판정(혼재 · 산적 호환성)은 <strong style={{ color: '#e8f0f2' }}>대시보드 → 선박 상세</strong> 또는
                우하단 <strong style={{ color: '#e8f0f2' }}>에이전트 판단 과정</strong>의 종합 판정에서 봅니다.
              </div>
            )}
          </div>
        </div>
      </div>
    </Html>
  );
}

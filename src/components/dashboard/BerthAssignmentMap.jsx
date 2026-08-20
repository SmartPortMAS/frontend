import { useEffect, useRef, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, Popup, Rectangle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { fetchBerthAssignments } from '../../api/backendAdapter';
import { COLORS, ULSAN_BBOX_BOUNDS, MAP_CENTER, MAP_DEFAULT_ZOOM } from '../../utils/constants';

// 08_스케줄링_전면재설계_자동배정_설계문서.md §7.2 — 선석 배정현황 전용 지도.
//
// PortMap.jsx(온산 14개, VTS 관측 점유)와는 다른 질문에 답한다: "우리 시스템이
// 이 선석에 무엇을 배정했는가". 그래서 PortMap.jsx를 확장하지 않고 새
// 페이지·새 컴포넌트로 분리했다(§7.1) — 데이터 출처가 다르면 화면도 분리해야
// "이게 실제 상황인지 우리 시스템 결정인지"가 헷갈리지 않는다.
//
// 표시 범위는 처음부터 울산항 전체다(69개 선석, 좌표 있는 것만) — PortMap.jsx처럼
// 온산으로 시작해 나중에 넓히는 게 아니라 이 API 자체가 전체를 반환한다.
//
// (2026-08-19) 이 화면에서는 승인 대기/확정을 구분하지 않는다 — REQUESTED든
// APPROVED든 우리 시스템이 이미 배정한 슬롯이면 그냥 "점유"다. 승인/반려
// 액션은 여전히 "에이전트 협상 로그"(AgentConsole)에서만 하고, 여기는 순수
// 점유 여부 표시 화면이다.

// 배정이 하나라도 있으면(REQUESTED~BERTHED 무엇이든) 점유로 본다.
function isOccupied(slots) {
  return slots.some((s) => s.status);
}

// 지도 마커에 쓰는 투명 아이콘 — 화면엔 안 보이고 클릭 대상 역할만 한다.
// 실제로 보이는 건 이름표(Tooltip, .berth-label CSS)뿐이다.
//
// 크기를 [1,1]로 뒀더니 클릭 히트박스가 사실상 없어서 팝업이 안 열렸다(실사용
// 중 발견, 2026-08-19) — 이름표(Tooltip)는 지도 다른 상호작용을 막지 않으려고
// pointer-events:none이라 클릭이 그대로 통과해버린다. 이름표가 보통 차지하는
// 크기만큼 히트박스를 넉넉히 잡아서 이름표를 눌러도 실제로는 이 마커가 클릭을
// 받게 한다(중심 앵커라 이름표 direction="center"와 겹친다).
const INVISIBLE_ICON = L.divIcon({
  html: '', className: 'invisible-marker', iconSize: [90, 24], iconAnchor: [45, 12],
});

function formatKST(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ko-KR', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hour12: false, timeZone: 'Asia/Seoul',
  });
}

// 배정 근거 상세 — 선석 스펙과 선박이 어떻게 매칭됐는지만 다룬다(수심·흘수
// 여유·전용/대체 경로·기상). 화학물질 위험성·혼재 같은 안전판정 내용은
// 일부러 안 담는다 — 그건 안전관제 에이전트의 몫이라 다른 화면(선박 상세)에
// 이미 있다(2026-08-19 지적 — "화학물질 내용같은건 안전관제잖아").
//
// narrative는 백엔드가 summary와 같은 LLM 호출에서 함께 받는 한 문장 요약이다
// (OrchestratorResult.berth_match_summary) — "근거를 LLM으로 좀 깔끔하게
// 포장해줬으면" 요청에 따라 추가했다. 구조화 값(매칭/기상/경로)은 그 문장이
// 놓칠 수 있는 정확한 숫자·전체 탈락 목록을 보여주는 보조 역할로 아래에 남긴다.
// narrative가 없는(2026-08-19 이 기능 이전에 만들어진) 배정은 구조화 값만 보인다.
function DecisionDetail({ detail }) {
  if (!detail) return null;
  const { narrative, trace, berth, weather, rejected_candidates: rejected } = detail;
  const margin = berth?.draught_margin_m;
  const depth = berth?.depth_m;
  // 흘수 = 수심 - 여유. 근거 값 그대로 역산이라 어림값(≈)으로 표시한다.
  const draught = depth != null && margin != null ? (depth - margin).toFixed(1) : null;
  // "전용 선석 'X' 사용 가능" 한 줄짜리 경로는 지금 보고 있는 이 선석 얘기를
  // 그대로 반복할 뿐이라 정보가 없다(2026-08-19 지적) — 대체/정박지 탐색처럼
  // 실제로 몇 단계를 거쳤을 때만(2줄 이상) 보여준다.
  const showTrace = trace?.length > 1;

  const rows = [];
  if (berth && (draught != null || margin != null)) {
    rows.push(['매칭', depth != null && draught != null
      ? `수심 ${depth}m ≥ 흘수 ≈${draught}m (여유 ${margin.toFixed(1)}m) · ${berth.rank}순위${berth.berth_group ? ` · ${berth.berth_group}` : ''}`
      : `흘수 여유 ${margin.toFixed(1)}m · ${berth.rank}순위`]);
  }
  if (weather) {
    rows.push(['기상', `${weather.status}${weather.reasons?.length > 0 ? ` — ${weather.reasons.join('; ')}` : ''}`]);
  }
  if (showTrace) rows.push(['경로', trace.join(' → ')]);
  if (rejected?.length > 0) {
    rows.push(['탈락', rejected.map((r) => `${r.rank}위 ${r.berth_id}(${r.reason})`).join(', ')]);
  }
  if (!narrative && rows.length === 0) return null;

  return (
    <div>
      {narrative && (
        <p style={{
          margin: '0 0 8px', fontSize: '12px', color: COLORS.textPrimary, lineHeight: 1.6,
        }}>
          {narrative}
        </p>
      )}
      {rows.length > 0 && (
        <div style={{ fontSize: '11.5px', color: COLORS.textSecondary, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {rows.map(([label, value]) => (
            <div key={label} style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
              <span style={{
                flexShrink: 0, width: '34px', color: COLORS.teal, fontWeight: 800, fontSize: '10px',
                textTransform: 'uppercase', letterSpacing: '0.02em',
              }}>{label}</span>
              <span style={{ flex: 1, lineHeight: 1.5 }}>{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 슬롯 하나의 배정근거를 팝업 위에 덮어 보여주는 오버레이(드롭다운이 아니라
// 진짜 팝업으로 띄워달라는 요청, 2026-08-19) — AgentConsole의 근거 원문
// 오버레이(QaPanel::CitationList)와 같은 패턴이다.
//
// slot.assignment_reason(LLM이 쓴 자유문 "종합 의견")은 일부러 안 보여준다
// (2026-08-19 재수정) — "배정근거를 말해야지 종합판단이 아니다"라는 지적대로,
// 그 문장은 orchestrator/service.py::_llm_summary()가 안전판정까지 포함해서
// 쓰는 관제사용 종합 의견이라 화학물질 얘기가 다시 섞여 들어온다. DecisionDetail
// (구조화 값)만 보여줘야 "선석 스펙 vs 선박 매칭"이라는 이 화면의 질문에 맞다.
// 종합 의견 자체는 "에이전트 협상 로그"(AgentConsole)의 몫으로 남겨둔다.
function ReasonOverlay({ slot, onClose }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 20, background: COLORS.panel,
      display: 'flex', flexDirection: 'column', borderRadius: '8px',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 10px', borderBottom: `1px solid ${COLORS.border}`,
      }}>
        <strong style={{ fontSize: '12.5px', color: COLORS.textPrimary }}>
          슬롯 {slot.slot_no} 배정근거
        </strong>
        <button type="button" onClick={onClose} style={{
          background: 'none', border: 'none', color: COLORS.textDim, cursor: 'pointer', fontSize: '15px',
        }}>✕</button>
      </div>
      <div style={{ padding: '10px', overflowY: 'auto' }}>
        <DecisionDetail detail={slot.decision_detail} />
        {slot.approved_by && (
          <p style={{ margin: '6px 0 0', color: COLORS.textDim, fontSize: '11.5px' }}>승인자: {slot.approved_by}</p>
        )}
      </div>
    </div>
  );
}

// 이 화면은 점유 여부만 보여준다 — REQUESTED/APPROVED 구분 없이 배정이 있으면
// 전부 "점유 중"이다. 승인/반려 액션은 우하단 "에이전트 협상 로그"(AgentConsole)
// 하나뿐이다(2026-08-19 — 이 컴포넌트에 있던 승인 버튼은 slot.assignment_id가
// 응답에 없어 "undefined"로 호출돼 늘 실패했었다. 같은 액션을 두 화면에 따로
// 두면 관제사가 헷갈리므로 액션 자체를 한 곳으로 모았다).
function SlotRow({ slot, onShowReason }) {
  if (!slot.status) {
    return (
      <div style={{ padding: '6px 0', fontSize: '12px', color: COLORS.textDim }}>
        슬롯 {slot.slot_no} — 여유
      </div>
    );
  }

  // ReasonOverlay는 decision_detail(구조화 값)만 보여준다 — assignment_reason은
  // 더 이상 안 쓰므로 버튼 노출 여부도 decision_detail 유무로만 판단한다.
  const hasReason = Boolean(slot.decision_detail);

  return (
    <div style={{
      padding: '8px 0', borderTop: `1px solid ${COLORS.border}`, fontSize: '12px',
      color: COLORS.textPrimary,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>슬롯 {slot.slot_no}</strong>
        <span style={{
          fontSize: '11px', fontWeight: 700, padding: '1px 6px', borderRadius: '4px',
          color: '#fff', background: COLORS.teal,
        }}>
          점유 중
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px', marginTop: '4px' }}>
        <p style={{ margin: 0 }}>
          {slot.vessel_name || '(선명 미상)'} · {slot.call_sign}
          {slot.cargo_name && ` · ${slot.cargo_name}`}
        </p>
        {hasReason && (
          <button
            type="button"
            onClick={() => onShowReason(slot)}
            style={{
              flexShrink: 0, background: 'transparent', border: `1px solid ${COLORS.border}`,
              color: COLORS.teal, borderRadius: '5px', padding: '2px 7px',
              fontSize: '10.5px', fontWeight: 700, cursor: 'pointer',
            }}
          >
            배정근거
          </button>
        )}
      </div>
      <p style={{ margin: '2px 0 0', color: COLORS.textDim }}>
        {slot.actual_arrival_utc ? (
          <>
            입항 {formatKST(slot.actual_arrival_utc)} ~ {slot.actual_departure_utc
              ? `출항 ${formatKST(slot.actual_departure_utc)}`
              : slot.departure_scheduled_utc
                ? `출항예정 ${formatKST(slot.departure_scheduled_utc)}`
                : '(재항 중)'}
          </>
        ) : (
          <>{formatKST(slot.window_start)} ~ {formatKST(slot.window_end)} (예정)</>
        )}
      </p>
    </div>
  );
}

// 선석 기본정보 — upa_berth_facility(UPA 원본) 그대로. 배정 여부와 무관하게
// 클릭하면 항상 보인다("이 선석이 뭐 하는 곳인가"는 배정 상태와 별개 질문).
//
// 예전엔 항목마다 줄을 하나씩 써서 8줄이었다 — 슬롯 목록까지 합치면 팝업이
// 너무 길어졌다(실사용 중 지적, 2026-08-19). 성격이 비슷한 값끼리 한 줄에
// 묶어 최대 3줄로 줄인다.
function BerthInfo({ berth }) {
  const identity = [berth.port_name, berth.wharf_se_name, berth.operator].filter(Boolean).join(' · ');
  const specs = [
    berth.length_m != null ? `안벽 ${berth.length_m}m` : null,
    berth.depth_m != null ? `수심 ${berth.depth_m}m` : null,
    berth.max_dwt != null ? `DWT ${berth.max_dwt.toLocaleString()}t` : null,
    `슬롯 ${berth.max_concurrent_vessels}개`,
  ].filter(Boolean).join(' · ');

  if (!identity && !specs && !berth.handling_cargo_name) return null;

  return (
    <div style={{ fontSize: '11.5px', color: COLORS.textSecondary, marginTop: '6px', lineHeight: 1.6 }}>
      {identity && <div>{identity}</div>}
      {specs && <div>{specs}</div>}
      {berth.handling_cargo_name && <div>취급화물: {berth.handling_cargo_name}</div>}
    </div>
  );
}

// 선석 하나의 팝업 내용 — 슬롯 목록을 보여주다가, 어느 슬롯이든 "배정근거"를
// 누르면 그 슬롯 하나만 ReasonOverlay로 전체를 덮는다. position:relative가
// 있어야 ReasonOverlay의 inset:0이 이 팝업 안쪽만 덮는다(페이지 전체 X).
function BerthPopupContent({ berth, filled }) {
  const [activeSlot, setActiveSlot] = useState(null);

  return (
    <div style={{ color: COLORS.textPrimary, position: 'relative' }}>
      <strong>{berth.wharf_name}</strong>
      <span style={{ color: COLORS.textDim, fontSize: '11px' }}> ({filled}/{berth.slots.length} 슬롯 사용)</span>
      <BerthInfo berth={berth} />
      {berth.slots.map((slot) => (
        <SlotRow key={slot.slot_no} slot={slot} onShowReason={setActiveSlot} />
      ))}
      {activeSlot && <ReasonOverlay slot={activeSlot} onClose={() => setActiveSlot(null)} />}
    </div>
  );
}

const POLL_MS = 30_000;

export default function BerthAssignmentMap() {
  const [berths, setBerths] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await fetchBerthAssignments();
      setBerths(data);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const withCoords = berths.filter((b) => b.latitude != null && b.longitude != null);
  const occupiedBerthCount = withCoords.filter((b) => isOccupied(b.slots)).length;
  const occupiedSlotCount = berths.reduce(
    (sum, b) => sum + b.slots.filter((s) => s.status).length, 0
  );

  // 선석 좌표 전체가 들어오는 범위로 지도를 맞춘다(좌표 고정 대신).
  const mapRef = useRef(null);
  const fitToBerths = () => {
    if (!mapRef.current || withCoords.length === 0) return;
    mapRef.current.fitBounds(
      withCoords.map((b) => [b.latitude, b.longitude]),
      { padding: [48, 48], maxZoom: 14 },
    );
  };
  // 선석 목록은 API 응답 뒤에 채워지므로, 도착 시점에 한 번 더 맞춘다.
  useEffect(fitToBerths, [withCoords.length]);

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%', borderRadius: '16px', overflow: 'hidden' }}>
      <MapContainer
        ref={mapRef}
        center={MAP_CENTER}
        zoom={MAP_DEFAULT_ZOOM}
        style={{ height: '100%', width: '100%', background: COLORS.bg }}
        attributionControl={false}
        whenReady={() => {
          // 좌표가 도착한 뒤 실제 선석 범위에 맞춘다.
          //
          // 울산 전체 뷰(MAP_DEFAULT_ZOOM)로 두면 온산·본항 선석이 화면 한구석에
          // 뭉쳐 이름표가 서로를 덮는다 — 어느 선석이 점유인지 읽을 수 없다.
          // 좌표를 손으로 박지 않고 데이터에 맞추면 선석이 늘거나 옮겨져도 따라간다.
          requestAnimationFrame(() => fitToBerths());
        }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          attribution="&copy; OpenStreetMap &copy; CARTO"
        />
        <Rectangle
          bounds={ULSAN_BBOX_BOUNDS}
          pathOptions={{ color: COLORS.info, weight: 1.5, dashArray: '8 6', fillOpacity: 0.02 }}
        />

        {withCoords.map((b) => {
          const occupied = isOccupied(b.slots);
          const filled = b.slots.filter((s) => s.status).length;
          return (
            <Marker
              // occupied를 key에 포함시켜 점유 상태가 바뀌면 통째로 다시 그린다 —
              // react-leaflet Tooltip은 className 같은 일부 prop을 마운트 후
              // 갱신에서 안정적으로 반영하지 않는다.
              key={`${b.wharf_name}-${occupied}`}
              position={[b.latitude, b.longitude]}
              icon={INVISIBLE_ICON}
            >
              <Tooltip
                permanent
                direction="center"
                className={occupied ? 'berth-label occupied' : 'berth-label'}
              >
                {b.wharf_name.replace(/부두$/, '')}
              </Tooltip>
              {/* minWidth/maxWidth를 넓혔다(2026-08-20, "배정근거 팝업창 좀 작은거
                  같아" 지적) — ReasonOverlay(배정근거: narrative + 매칭/기상/경로/
                  탈락 행)가 이 팝업 안에 inset:0으로 덮이는 구조라, 원래 300px
                  폭에서는 문장이 계속 줄바꿈되며 실제보다 작고 답답해 보였다. */}
              <Popup minWidth={280} maxWidth={380}>
                <BerthPopupContent berth={b} filled={filled} />
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      <div style={{
        position: 'absolute', bottom: 14, left: 14, zIndex: 1000,
        background: COLORS.glass, border: `1px solid ${COLORS.glassBorder}`,
        backdropFilter: 'blur(8px)', borderRadius: '10px',
        padding: '10px 14px', color: COLORS.textPrimary, fontSize: '12px',
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>
          선석 {withCoords.length}개 · 점유 {occupiedBerthCount}개({occupiedSlotCount}슬롯)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 14, height: 10, borderRadius: '3px', background: COLORS.teal, display: 'inline-block' }} />
          점유 중 — 클릭하면 배정 상세
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
          <span style={{ width: 14, height: 10, borderRadius: '3px', border: `1px solid ${COLORS.textDim}`, display: 'inline-block' }} />
          배정 없음 — 클릭하면 선석 기본정보
        </div>
        {error && <div style={{ marginTop: '6px', color: COLORS.red }}>불러오기 실패: {error}</div>}
        {loading && <div style={{ marginTop: '6px', color: COLORS.textDim }}>불러오는 중…</div>}
      </div>
    </div>
  );
}

import { useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, CircleMarker, Rectangle, Tooltip, Polyline, Polygon } from 'react-leaflet';
import useVesselSafety from '../../hooks/useVesselSafety';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import useSensorStore from '../../stores/useSensorStore';
import useDashboardData from '../../hooks/useDashboardData';
import { ONSAN_BERTHS, ONSAN_ADJACENCY, ONSAN_WEATHER_GROUP, onsanDisplayPos, findBerthIdByName } from '../../utils/geoUtils';
import {
  COLORS,
  ULSAN_BBOX_BOUNDS,
  MAP_CENTER,
  MAP_DEFAULT_ZOOM,
  NAV_STATUS,
  WEATHER_STATUS_COLORS,
} from '../../utils/constants';

const SHIP_SVG_PATH =
  'M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42c-.26.08-.48.26-.6.5s-.15.52-.06.78L3.95 19zM6 6h12v3.73l-6-1.94-6 1.94V6z';

// 위험물선은 빨간색 + 펄스 링으로 강조, 일반선은 항해 상태 색상
const createVesselIcon = (vessel) => {
  const status = NAV_STATUS[vessel.nav_status_category] || NAV_STATUS.UNKNOWN;
  const color = vessel.is_liquid_cargo_vessel ? COLORS.red : status.color;
  const size = vessel.is_liquid_cargo_vessel ? 34 : 26;

  const html = `
    <div class="vessel-marker ${vessel.is_liquid_cargo_vessel ? 'vessel-marker--danger' : ''}"
         style="width:${size}px;height:${size}px;">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
           width="${size}" height="${size}" fill="${color}">
        <path d="${SHIP_SVG_PATH}"/>
      </svg>
    </div>`;

  return L.divIcon({
    html,
    className: 'vessel-divicon', // leaflet 기본 흰 배경 제거용
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
};

const formatKST = (utcString) => {
  if (!utcString) return '-';
  return new Date(utcString).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Seoul',
  });
};

function VesselPopup({ vessel }) {
  const status = NAV_STATUS[vessel.nav_status_category] || NAV_STATUS.UNKNOWN;
  return (
    <div style={{ color: COLORS.textPrimary, minWidth: '190px', fontSize: '13px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
        <strong style={{ fontSize: '14px' }}>{vessel.vessel_name}</strong>
        {vessel.is_liquid_cargo_vessel && (
          <span style={{
            background: COLORS.red, color: '#fff', borderRadius: '4px',
            padding: '1px 6px', fontSize: '11px', fontWeight: 'bold',
          }}>위험물</span>
        )}
      </div>
      <p style={{ margin: '2px 0' }}><strong>호출부호</strong> {vessel.callsgn} · <strong>MMSI</strong> {vessel.mmsi}</p>
      <p style={{ margin: '2px 0' }}>
        <strong>상태</strong>{' '}
        <span style={{ color: status.color, fontWeight: 'bold' }}>{status.label}</span>
        {' '}· <strong>속력</strong> {vessel.sog} kn
      </p>
      <p style={{ margin: '2px 0' }}>
        <strong>{vessel.position_source === 'REAL_AIS' ? 'AIS 수신' : '입항'}</strong>{' '}
        {formatKST(vessel.arrival_at_utc)} (KST)
      </p>
      {vessel.cargo && (
        <p style={{ margin: '2px 0' }}>
          <strong>화물</strong> {vessel.cargo.name} ({vessel.cargo.un_no})
          {vessel.cargo_source === 'ASSUMED' && (
            <span style={{
              marginLeft: 5, padding: '0 5px', borderRadius: 3, fontSize: 10,
              background: COLORS.cardHover, color: COLORS.textDim, border: `1px solid ${COLORS.border}`,
            }}>가정</span>
          )}
        </p>
      )}
      {vessel.position_source === 'REAL_AIS' && (
        <p style={{ margin: '4px 0 0', fontSize: '11px', color: COLORS.textDim }}>
          {vessel.cargo_source === 'REAL'
            ? '선박·위치·화물 모두 실측 (AIS + 재항 신고 위험물)'
            : '선박·위치는 실측 AIS · 화물은 시나리오 가정 (화물목록 API 미확보)'}
        </p>
      )}
      <p style={{ margin: '4px 0 0', color: COLORS.textDim, fontSize: '11px' }}>{vessel.port_call_id}</p>
    </div>
  );
}

// 지도에 겹치는 두 레이어를 범례에서 구분한다 — 둘 다 실 AIS 지만 아는 정보가 다르다.
//   배 아이콘 : 위치 + 재항 화물까지 확인된 배 (클릭 -> 상세·안전판정)
//   점       : 위치만 확인된 배
// 화면에 실제로 그려지는 것만 적는다. 범례에 있는데 화면에 없거나 그 반대면
// 사용자가 지도를 못 믿게 된다.
//
// 점(AIS 레이어)은 체크박스를 켰을 때만 그려지므로 범례도 그때만 보여준다 —
// 꺼 놓고 보면 "● 항해 중" 같은 항목이 화면 어디에도 없다.
const LEGEND_BASE = [
  { color: COLORS.red, label: '🚢 배 — 화물 확인 (클릭 시 안전 판정)' },
  { color: COLORS.info, label: '◯ 온산 선석 (클릭 시 기상 판정)' },
  { color: COLORS.yellow, label: '― 인접 선석 혼재감시 쌍' },
];
const LEGEND_AIS = [
  { color: COLORS.red, label: '● 액체화물선 (PORT-MIS 선종)' },
  { color: COLORS.blue, label: '● 항해 중 (선종 미확인)' },
  { color: COLORS.textDim, label: '● 정박·계류 중 (선종 미확인)' },
];

// 온산 2클러스터(처용리/산암리)가 화면에 차게 보이는 뷰
const ONSAN_CENTER = [35.435, 129.365];
const ONSAN_ZOOM = 13;

export default function PortMap() {
  const setSelectedObject = useSensorStore((s) => s.setSelectedObject);
  const setSelectedBerthGroup = useSensorStore((s) => s.setSelectedBerthGroup);
  const setSelectedVessel = useSensorStore((s) => s.setSelectedVessel);
  const berthWeather = useSensorStore((s) => s.berthWeather);
  const { data } = useDashboardData();
  const [showAis, setShowAis] = useState(false);
  // 아이콘(클릭 시 상세패널) 레이어 — 실AIS + berth-cargo 실화물 조인 선박을 우선 쓰고,
  // DB에 재항 위험물 신고가 하나도 없을 때만(로컬 mock-server 등) 데모 시나리오로 대체한다.
  // AgentConsole과 동일한 원칙. arrival_at_utc는 팝업이 그 필드로 시각을 표시해서 맞춰준다.
  const realCargoVessels = useMemo(
    () => (data?.real_traffic ?? [])
      .filter((v) => v.cargo)
      .map((v) => ({
        ...v, position_source: 'REAL_AIS', cargo_source: 'REAL', arrival_at_utc: v.received_at_utc,
      })),
    [data]
  );
  // 폴백 없음. 예전엔 화물 매칭이 0건이면 mock 데모 선박 6척으로 대체했는데,
  // 수집이 끊기거나 매칭이 실패한 상황에서 가짜 배가 진짜처럼 지도에 떴다.
  // 실데이터가 없으면 아무것도 그리지 않는 편이 정직하다.
  const vessels = realCargoVessels;
  // 실백엔드(upa_vessel_position) AIS 레이어 — 위 아이콘으로 이미 표시된 선박은
  // 제외해 같은 배가 아이콘·점으로 두 번 찍히지 않게 한다.
  const realTraffic = useMemo(() => {
    const shown = new Set(vessels.map((v) => v.callsgn).filter(Boolean));
    // 액체화물선만 보는 필터는 뒀다가 뺐다 — 화물 배정을 액체화물선 전수로
    // 넓히면서(2026-08-15) 관제 대상이 배 아이콘으로 충분히 드러나 필요가 없어졌다.
    //
    // liquid_callsgns 로 선종 액체화물선을 덧칠하던 보정도 뺐다. 같은 판정(PORT-MIS
    // portmis_vessel.is_liquid_cargo_vessel)을 backendAdapter.mapVessel 이 이미 하고
    // 있어서, 여기서 한 번 더 하면 같은 기준이 두 군데 살아 있게 된다.
    return (data?.real_traffic ?? []).filter((v) => !shown.has(v.callsgn));
  }, [data, vessels]);
  const realLiquidCount = useMemo(
    () => realTraffic.filter((v) => v.is_liquid_cargo_vessel).length,
    [realTraffic]
  );
  // 지도는 성능 때문에 상한(MAP_VESSEL_LIMIT)까지만 그린다. 그 상한에 걸렸을 때
  // 범례에 "표시/전체"를 같이 적어, 숫자가 멈춘 이유를 화면에서 알 수 있게 한다.
  const aisTotal = data?.real_traffic_total ?? realTraffic.length;
  const mapRef = useRef(null);

  const liquidCount = useMemo(
    () => vessels.filter((v) => v.is_liquid_cargo_vessel).length,
    [vessels]
  );

  // 실선석 점유 현황 (백엔드 /dashboard/berths — upa_port_call 실측)
  // 백엔드는 'OTK1부두', 화면은 'OTK 1부두'처럼 띄어쓰기가 달라 공백 제거 후 대조한다.
  const occupancyByBerth = useMemo(() => {
    const norm = (s) => String(s || '').replace(/\s+/g, '');
    const m = new Map();
    (data?.berth_occupancy ?? []).forEach((b) => m.set(norm(b.wharf_name), b));
    return m;
  }, [data]);
  // 이 지도는 온산 선석만 그린다. 점유 수도 온산 기준으로 세야 KPI("온산 선석 점유")와
  // 같은 숫자가 된다 — 예전엔 여기서 울산 전 항만 69개 선석을 세고, 판정 기준도
  // occupancy_status 가 아니라 current_vessel_names 유무로 달라서 한 화면에 서로
  // 다른 점유 수가 떴다.
  const onsanBerths = useMemo(
    () => (data?.berth_occupancy ?? []).filter((b) => b.port_name === '온산항'),
    [data]
  );
  const occupiedCount = useMemo(
    () => onsanBerths.filter((b) => b.occupancy_status === '점유').length,
    [onsanBerths]
  );
  const anchorWaiting = useMemo(
    () => (data?.anchorage_status ?? []).reduce((s, a) => s + (a.current_occupants || 0), 0),
    [data]
  );
  const berthOcc = (name) => occupancyByBerth.get(String(name || '').replace(/\s+/g, ''));

  // 증기운 확산 예상 구역 (8월 시나리오 S3 — 가우시안 원뿔 근사)
  // 선택 선박에 혼재금지·IMDG 격리 충돌이 잡히면 접안 선석 풍하측에 표시
  const selectedVessel = useSensorStore((s) => s.selectedVessel);
  const { assessment: safety } = useVesselSafety(selectedVessel);
  const vaporCone = useMemo(() => {
    const v = selectedVessel;
    if (!v?.is_liquid_cargo_vessel || !v.berth) return null;
    // 인접 선석과 혼재/격리 충돌이 실제로 잡힌 선박만 증기운을 그린다
    // (백엔드 안전 에이전트가 낸 MSDS/IMDG 게이트 히트 기준)
    if (!safety?.gates_hit?.some((g) => g.rule.startsWith('MSDS') || g.rule.startsWith('IMDG'))) return null;
    const berthId = findBerthIdByName(v.berth);
    if (!berthId) return null;
    const [lat, lon] = onsanDisplayPos(ONSAN_BERTHS[berthId]);
    const w = data?.weather;
    const windDir = w?.wind_dir_deg ?? 0;
    const windMs = w?.wind_speed_ms ?? 5;
    const dir = ((windDir + 180) % 360) * (Math.PI / 180); // 풍하측 방위
    const L = 250 + 55 * windMs;                            // 확산 길이 [m] 근사
    const half = (22 * Math.PI) / 180;                      // 반개방각
    const pt = (dist, ang) => [
      lat + (dist * Math.cos(ang)) / 111320,
      lon + (dist * Math.sin(ang)) / (111320 * Math.cos((lat * Math.PI) / 180)),
    ];
    return {
      positions: [[lat, lon], pt(L, dir - half), pt(L * 1.1, dir), pt(L, dir + half)],
      cargo: v.cargo?.name, windMs, windDir, lengthM: Math.round(L * 1.1),
    };
  }, [selectedVessel, data, safety]);

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%', borderRadius: '16px', overflow: 'hidden' }}>
      <style>{`
        .vessel-divicon { background: none; border: none; }
        .vessel-marker { position: relative; display: flex; align-items: center; justify-content: center;
          filter: drop-shadow(0 0 4px rgba(0,0,0,0.6)); }
        .vessel-marker--danger::before {
          content: ''; position: absolute; inset: -5px; border-radius: 50%;
          border: 2px solid ${COLORS.red}; animation: vessel-pulse 1.6s ease-out infinite;
        }
        @keyframes vessel-pulse {
          0% { transform: scale(0.7); opacity: 0.9; }
          100% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>

      <MapContainer
        ref={mapRef}
        center={ONSAN_CENTER}
        zoom={ONSAN_ZOOM}
        style={{ height: '100%', width: '100%', background: COLORS.bg }}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

        {/* 울산항 관제 구역 bbox */}
        <Rectangle
          bounds={ULSAN_BBOX_BOUNDS}
          pathOptions={{
            color: COLORS.info,
            weight: 1.5,
            dashArray: '8 6',
            fillColor: COLORS.info,
            fillOpacity: 0.03,
          }}
        >
          <Tooltip sticky>울산항 관제 구역 (lat 35.18~35.82 / lon 129.22~129.76)</Tooltip>
        </Rectangle>

        {/* ADJACENT_TO 인접(혼재/근접 위험 감시) 연결선 */}
        {ONSAN_ADJACENCY.map(({ a, b, distanceM }) => {
          const ba = ONSAN_BERTHS[a];
          const bb = ONSAN_BERTHS[b];
          if (!ba || !bb) return null;
          return (
            <Polyline
              key={`${a}-${b}`}
              positions={[onsanDisplayPos(ba), onsanDisplayPos(bb)]}
              pathOptions={{ color: COLORS.yellow, weight: 2, dashArray: '4 6', opacity: 0.7 }}
            >
              <Tooltip sticky>
                ADJACENT_TO · {ba.name} ↔ {bb.name} ({distanceM}m) — 혼재/근접 위험 감시
              </Tooltip>
            </Polyline>
          );
        })}

        {/* 온산 액체화물 선석 (온산 MVP 스코프, 실측 좌표)
            — 최근 기상 판정이 이 선석의 임계군이면 판정 색으로 역연동 강조 */}
        {Object.entries(ONSAN_BERTHS).map(([id, b]) => {
          const verdict =
            berthWeather && ONSAN_WEATHER_GROUP[id] === berthWeather.berth_group
              ? berthWeather.status
              : null;
          const vColor = verdict ? WEATHER_STATUS_COLORS[verdict] || COLORS.info : COLORS.info;
          const escalated = verdict && verdict !== '정상';
          return (
          <Circle
            key={id}
            center={onsanDisplayPos(b)}
            // 선석 원이 배 아이콘(34px)보다 작아 화면에서 묻혔다. 선석은 판정
            // 단위이자 클릭 대상이라 배보다 눈에 먼저 들어와야 한다.
            radius={b.waterway === '부이(해상)' ? 320 : 200}
            pathOptions={{
              color: vColor,
              fillColor: vColor,
              fillOpacity: escalated ? 0.5 : 0.25,
              weight: escalated ? 4 : 3,
            }}
            eventHandlers={{ click: () => setSelectedBerthGroup(ONSAN_WEATHER_GROUP[id] || null) }}
          >
            <Tooltip>
              {b.name}
              {verdict ? ` — 판정: ${verdict}` : ' — 클릭하면 선석별 하역 판정과 연동'}
            </Tooltip>
            <Popup>
              <div style={{ color: '#0d1b2a', fontSize: '13px', minWidth: '160px' }}>
                <strong>{b.name}</strong> <span style={{ color: '#4a6a82' }}>({id})</span>
                <p style={{ margin: '4px 0 0' }}>운영사 {b.operator}</p>
                <p style={{ margin: '2px 0 0' }}>수역 {b.waterway} · 접안 {b.maxDwt.toLocaleString()} DWT</p>
                <p style={{ margin: '2px 0 0', color: '#00755e', fontSize: '11px' }}>
                  기상 임계군: {ONSAN_WEATHER_GROUP[id] || '-'}
                </p>
                {(() => {
                  const occ = berthOcc(b.name);
                  if (!occ) return null;
                  const ships = occ.current_vessel_names || [];
                  return (
                    <p style={{
                      margin: '4px 0 0', paddingTop: '4px', borderTop: '1px solid #e2e8f0',
                      fontSize: '11px', color: ships.length ? '#b45309' : '#4a6a82',
                    }}>
                      실시간 점유: <strong>{ships.length ? '점유 중' : '여유'}</strong>
                      {ships.length > 0 && ` — ${ships.slice(0, 3).join(', ')}`}
                      <br />
                      <span style={{ color: '#7a8b99' }}>출처: 입출항 기록 실측</span>
                    </p>
                  );
                })()}
                {b.rep && <p style={{ margin: '2px 0 0', color: COLORS.textDim, fontSize: '11px' }}>※ 터미널 대표 좌표 (표시용 이격)</p>}
              </div>
            </Popup>
          </Circle>
          );
        })}

        {/* 증기운 확산 예상 구역 (R13 히트 선박 선택 시, 풍하측 원뿔 근사) */}
        {vaporCone && (
          <Polygon
            positions={vaporCone.positions}
            pathOptions={{ color: '#D2601A', weight: 2, dashArray: '6 5', fillColor: '#D2601A', fillOpacity: 0.22 }}
          >
            <Tooltip sticky>
              {vaporCone.cargo} 증기 확산 예상 구역 — 풍향 {vaporCone.windDir}° · 풍속 {vaporCone.windMs}m/s 기준 약 {vaporCone.lengthM}m (가우시안 원뿔 근사 · 실측 아님)
            </Tooltip>
          </Polygon>
        )}

        {/* 실 AIS 선박 (upa_vessel_position, 백엔드 연동) — 토글 시 점 마커로 표시 */}
        {showAis && realTraffic.map((v) => (
          <CircleMarker
            key={v.port_call_id}
            center={[v.latitude, v.longitude]}
            radius={v.is_liquid_cargo_vessel ? 5 : 3.5}
            pathOptions={{
              color: v.is_liquid_cargo_vessel
                ? COLORS.red
                : (v.nav_status_category === 'UNDER_WAY' ? COLORS.blue : COLORS.textDim),
              fillOpacity: v.is_liquid_cargo_vessel ? 0.95 : 0.85,
              weight: v.is_liquid_cargo_vessel ? 2 : 1,
            }}
          >
            <Tooltip>
              {v.vessel_name || v.callsgn} · {v.sog ?? '-'} kn ·{' '}
              {(NAV_STATUS[v.nav_status_category] || NAV_STATUS.UNKNOWN).label}
              {v.is_liquid_cargo_vessel && (
                <><br /><strong style={{ color: '#b91c1c' }}>액체화물선 (PORT-MIS 선종 확인)</strong></>
              )}
              <br />수신 {formatKST(v.received_at_utc)} (KST)
            </Tooltip>
          </CircleMarker>
        ))}

        {/* 선박 마커 */}
        {vessels.map((vessel) => {
          if (vessel.latitude == null || vessel.longitude == null) return null;
          return (
            <Marker
              key={vessel.port_call_id}
              position={[vessel.latitude, vessel.longitude]}
              icon={createVesselIcon(vessel)}
              eventHandlers={{
                click: () => {
                  setSelectedObject(vessel);
                  setSelectedVessel(vessel); // 선박 상세 패널 열기
                },
              }}
            >
              <Popup>
                <VesselPopup vessel={vessel} />
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* 지도 옵션 박스 — 페이지 상단의 [Omniverse/3D View] 버튼(≈top 50~88px)에
          가려지지 않도록 그 아래(top 70 = 페이지 기준 약 100px)에 세로 박스로 배치 */}
      <div style={{
        position: 'absolute', top: 70, right: 14, zIndex: 1000,
        background: COLORS.glass, border: `1px solid ${COLORS.glassBorder}`,
        backdropFilter: 'blur(8px)', borderRadius: '10px',
        padding: '10px 12px',
        // 고정 폭(168px)이라 선박 수가 세 자리가 되자 라벨이 잘렸다.
        // 내용에 맞춰 늘리되 지도를 가리지 않게 상한만 둔다.
        width: 'max-content', minWidth: '168px', maxWidth: '260px',
        display: 'flex', flexDirection: 'column', gap: '6px',
      }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: COLORS.textDim, letterSpacing: '1px' }}>
          지도 옵션
        </div>
        {[
          { label: '온산 확대', center: ONSAN_CENTER, zoom: ONSAN_ZOOM },
          { label: '울산항 전체', center: MAP_CENTER, zoom: MAP_DEFAULT_ZOOM },
        ].map((v) => (
          <button
            key={v.label}
            onClick={() => mapRef.current?.flyTo(v.center, v.zoom, { duration: 0.8 })}
            style={{
              background: 'rgba(255,255,255,0.06)', border: `1px solid ${COLORS.glassBorder}`,
              color: COLORS.textPrimary, borderRadius: '7px', padding: '7px 10px',
              fontSize: '12px', fontWeight: 600, cursor: 'pointer', textAlign: 'left',
            }}
          >
            {v.label}
          </button>
        ))}
        {realTraffic.length > 0 && (
          <label style={{
            display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer',
            background: showAis ? 'rgba(56,189,248,0.18)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${showAis ? COLORS.blue : COLORS.glassBorder}`,
            borderRadius: '7px', padding: '7px 10px',
            fontSize: '12px', fontWeight: 600, color: COLORS.textPrimary,
            // "· 액체 33"이 줄바꿈돼 잘려 보이던 문제 — 라벨을 한 줄로 고정한다
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            <input
              type="checkbox"
              checked={showAis}
              onChange={() => setShowAis((s) => !s)}
              style={{ accentColor: COLORS.blue, cursor: 'pointer', flexShrink: 0 }}
            />
            {/* 라벨은 짧게 — 배 수가 세 자리가 되어도 한 줄에 들어와야 한다.
                상한(200척)에 걸렸을 때만 "표시/전체"를 함께 보여준다. */}
            <span style={{ whiteSpace: 'nowrap' }}>
              실선박 AIS {realTraffic.length}
              {aisTotal > realTraffic.length && (
                <span style={{ color: COLORS.textDim }}>/{aisTotal}</span>
              )}
              {realLiquidCount > 0 && (
                <span style={{ color: COLORS.red }}> · 액체 {realLiquidCount}</span>
              )}
            </span>
          </label>
        )}
      </div>

      {/* 범례 + 현황 요약 */}
      <div style={{
        position: 'absolute', bottom: 14, left: 14, zIndex: 1000,
        background: COLORS.glass, border: `1px solid ${COLORS.glassBorder}`,
        backdropFilter: 'blur(8px)', borderRadius: '10px',
        padding: '10px 14px', color: COLORS.textPrimary, fontSize: '12px',
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>
          관제 중 {vessels.length}척 · 위험물선 <span style={{ color: COLORS.red }}>{liquidCount}척</span>
        </div>
        {occupiedCount > 0 && (
          <div style={{ marginBottom: '6px', fontSize: '11px', color: COLORS.textSecondary }}>
            온산 선석 점유 <strong style={{ color: COLORS.yellow }}>{occupiedCount}</strong>
            /{onsanBerths.length}
            {anchorWaiting > 0 && <> · 정박지 대기 <strong>{anchorWaiting}</strong>척</>}
            <span style={{ color: COLORS.textDim }}> (실측)</span>
          </div>
        )}
        {[...LEGEND_BASE, ...(showAis ? LEGEND_AIS : [])].map((item) => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
            <span style={{
              width: '10px', height: '10px', borderRadius: '50%',
              background: item.color, display: 'inline-block',
            }} />
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}

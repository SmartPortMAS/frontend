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

// 기호는 배 모양 하나로 통일한다 — "배 아이콘과 점, 두 종류"가 헷갈린다는
// 피드백(2026-08-17). 대신 '아는 정보의 양'을 크기와 링으로 구분한다:
//   큰 배 + 붉은 펄스 링 = 재항 화물까지 확인된 배 (클릭 → 안전 심사·선석 후보)
//   작은 배             = 위치만 수신된 배 (색 = 상태, 빨강이면 선종상 액체화물선)
// 실제 VTS/ECDIS 도 확인 수준이 다른 표적을 다른 기호가 아니라 같은 기호의
// 속성(크기·색) 차이로 구분한다.
const createVesselIcon = (vessel) => {
  const confirmed = Boolean(vessel.cargo); // 화물까지 확인된 배
  // 화물 미확인 액체화물선은 속이 빈 배로 그린다 — "꽉 찬 빨강(확인)" 과
  // "빈 빨강(선종 추정)" 은 링 유무보다 한눈에 갈린다(2026-08-21 피드백).
  const hollow = !confirmed && vessel.is_liquid_cargo_vessel;
  const status = NAV_STATUS[vessel.nav_status_category] || NAV_STATUS.UNKNOWN;
  const color = vessel.is_liquid_cargo_vessel ? COLORS.red : status.color;
  const size = confirmed ? 34 : 20;

  const html = `
    <div class="vessel-marker ${confirmed ? 'vessel-marker--danger' : 'vessel-marker--lite'}"
         style="width:${size}px;height:${size}px;">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
           width="${size}" height="${size}"
           fill="${hollow ? 'white' : color}" stroke="${color}" stroke-width="${hollow ? 1.7 : 0}">
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
            : '선박 위치는 실측 · 화물은 시나리오 가정 (화물 신고 자료 미확보)'}
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
// 범례는 "색 — 뜻" 만 적는다. 예전 문구는 '큰 배+링', '작은 배'처럼 기호의
// 생김새를 설명했는데, 색 점이 이미 옆에 찍혀 있으니 생김새 묘사는 소음이었다
// (2026-08-17 피드백). 크기 차이는 화면에서 저절로 보인다 — 화물까지 확인된
// 배가 크게, 위치만 수신된 배가 작게 그려진다는 규칙은 빨강 항목 하나에만 적는다.
// 범례는 한 단어씩만 — 문장 설명은 뺐다(2026-08-21 피드백: "구분만 확실하면
// 된다"). 색·모양의 뜻은 hover 툴팁(title)이 보조한다.
const LEGEND_BASE = [
  { color: COLORS.red, label: '화물 확인', hint: '꽉 찬 빨강 + 링 — 재항 위험물 신고까지 확인된 배. 클릭하면 판정.' },
  { color: COLORS.red, label: '액체화물선', hollow: true, hint: '빈 빨강 — PORT-MIS 선종상 액체화물선(화물 미신고). 클릭하면 선종 기반 추정 판정.' },
  { color: COLORS.info, label: '온산 선석', hint: '파랑 원 — 클릭하면 선석별 기상 판정' },
];
const LEGEND_AIS = [
  { color: NAV_STATUS.UNDER_WAY.color, label: '항해' },
  { color: NAV_STATUS.MOORED.color, label: '접안' },
  { color: NAV_STATUS.AT_ANCHOR.color, label: '대기' },
  { color: NAV_STATUS.UNKNOWN.color, label: '소형선' },
];

// 온산 2클러스터(처용리/산암리) 뷰.
//
// 예전엔 center/zoom 을 손으로 박아 뒀는데, 줌을 한 단계 올리자(부두 이름표가
// 서로 겹쳐서) 북쪽 OTK·S-Oil 무리가 화면 위로 잘려 나갔다. 눈으로 맞춘 중심은
// 줌이 바뀔 때마다 다시 틀어진다.
//
// 그래서 좌표를 고정하지 않고, 실제 선석 14개가 다 들어오는 범위에 맞춘다.
// 선석이 추가·이동돼도 화면이 알아서 따라온다.
//
// 단, 기본 뷰는 '부두'에만 맞춘다. 석유공사 원유부이는 같은 온산 시설이지만
// 해상 계류점이라 부두에서 4 km 넘게 떨어져 있다. 부이까지 한 화면에 넣으면
// 정작 부두 무리가 다시 뭉쳐 이름표가 겹친다. 부이는 아래 '온산 전체' 버튼으로 본다.
const ONSAN_WHARF_BOUNDS = Object.values(ONSAN_BERTHS)
  .filter((b) => b.waterway !== '부이(해상)')
  .map((b) => onsanDisplayPos(b));
const ONSAN_ALL_BOUNDS = Object.values(ONSAN_BERTHS).map((b) => onsanDisplayPos(b));
const ONSAN_FIT = { padding: [48, 48], maxZoom: 15 };
const ONSAN_CENTER = [35.435, 129.365];   // 첫 렌더용 근사값 (곧 fitBounds 가 덮어쓴다)
const ONSAN_ZOOM = 14;

export default function PortMap() {
  const setSelectedObject = useSensorStore((s) => s.setSelectedObject);
  const setSelectedBerthGroup = useSensorStore((s) => s.setSelectedBerthGroup);
  const setSelectedVessel = useSensorStore((s) => s.setSelectedVessel);
  const berthWeather = useSensorStore((s) => s.berthWeather);
  const { data } = useDashboardData();
  // 켜자마자 지도가 KPI("관제 선박 N척")와 맞아 보이도록 기본 켬.
  // 꺼 두면 화물 확인된 배 몇 척만 떠서 지도가 비어 보인다.
  const [showAis, setShowAis] = useState(true);
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
        .vessel-marker--lite { opacity: 0.82; filter: drop-shadow(0 0 2px rgba(0,0,0,0.45)); }
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
        whenReady={() => {
          // 컨테이너 크기가 정해진 뒤에 맞춰야 한다 — 렌더 직후엔 높이가 0 이라
          // fitBounds 가 엉뚱한 줌으로 잡힌다.
          requestAnimationFrame(() => mapRef.current?.fitBounds(ONSAN_WHARF_BOUNDS, ONSAN_FIT));
        }}
      >
        {/* PORT-MIS 톤(라이트)에 맞춘 베이스맵. 예전 dark_all 은 화면 전체가 밝아진 뒤에도
            지도만 검게 남아 따로 놀았다.
            2026-09-18 — CARTO voyager 는 이제 API 키 없이는 "API KEY REQUIRED" 회색 타일만
            돌려준다(실측: 타일 응답 200이지만 내용이 안내문). OpenStreetMap 표준 타일은
            키가 없고 해안선·부두 윤곽이 있어 관제 지도로 충분하다. */}
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />

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
            radius={b.waterway === '부이(해상)' ? 340 : 230}
            pathOptions={{
              color: vColor,
              fillColor: vColor,
              fillOpacity: escalated ? 0.5 : 0.25,
              weight: escalated ? 4 : 3,
            }}
            eventHandlers={{ click: () => setSelectedBerthGroup(ONSAN_WEATHER_GROUP[id] || null) }}
          >
            {/* 부두 이름을 항상 띄운다. 원만 있으면 배 아이콘에 묻혀 "여기가 부두"라는
                것도, 클릭 대상이라는 것도 화면에서 알 수 없었다.

                한 레이어에 Tooltip 을 두 개 달면 안 된다 — Leaflet 의 bindTooltip 은
                덮어쓰기라, 앞의 permanent 옵션에 뒤의 긴 문구가 붙어 "○○부두 —
                클릭하면 선석별 하역 판정과 연동"이 지도에 상시 박혔다. 온산 선석은
                서로 수백 m 안에 몰려 있어 그 라벨들이 겹쳐 지도를 덮었다.
                라벨은 이름(+판정)만, 안내는 클릭 팝업에 둔다. */}
            <Tooltip permanent direction="center" className="berth-label">
              {b.name.replace(/부두$/, '')}
              {verdict ? ` · ${verdict}` : ''}
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

        {/* 위치만 수신된 배 — 같은 배 기호를 작게 그린다.
            예전엔 점(CircleMarker)이었는데 "배는 아이콘인데 점은 뭐지?"라는 혼란이
            있었다. 기호를 배 하나로 통일하고 아는 정보의 양은 크기·링으로 구분한다.
            작은 배도 클릭하면 상세 패널이 열린다 — 화물·흘수가 없으면 패널이
            "조회 불가"와 그 사유를 그대로 말한다(없는 정보를 숨기지 않는다). */}
        {showAis && realTraffic.map((v) => (
          <Marker
            key={v.port_call_id}
            position={[v.latitude, v.longitude]}
            icon={createVesselIcon(v)}
            eventHandlers={{ click: () => setSelectedVessel(v) }}
          >
            <Tooltip>
              {v.vessel_name || v.callsgn} · {v.sog ?? '-'} kn ·{' '}
              {(NAV_STATUS[v.nav_status_category] || NAV_STATUS.UNKNOWN).label}
              {v.is_liquid_cargo_vessel && (
                <><br /><strong style={{ color: '#b91c1c' }}>액체화물선 (PORT-MIS 선종 확인)</strong></>
              )}
              <br />수신 {formatKST(v.received_at_utc)} (KST)
            </Tooltip>
          </Marker>
        ))}

        {/* 선박 마커 */}
        {vessels.map((vessel) => {
          if (vessel.latitude == null || vessel.longitude == null) return null;
          return (
            <Marker
              key={vessel.port_call_id}
              position={[vessel.latitude, vessel.longitude]}
              icon={createVesselIcon(vessel)}
              zIndexOffset={1000}
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
        position: 'absolute', top: 14, right: 14, zIndex: 1000,
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
          { label: '온산 부두', bounds: ONSAN_WHARF_BOUNDS },
          // '온산 전체(원유부이 포함)' 버튼은 뺐다(2026-08-21) — 온산 부두 뷰와
          // 차이가 석유공사부이 하나뿐이라 선택지 값을 못 했다. 부이는 '울산항
          // 전체'에서 보인다.
          { label: '울산항 전체', center: MAP_CENTER, zoom: MAP_DEFAULT_ZOOM },
        ].map((v) => (
          <button
            key={v.label}
            onClick={() => (v.bounds
              ? mapRef.current?.flyToBounds(v.bounds, { ...ONSAN_FIT, duration: 0.8 })
              : mapRef.current?.flyTo(v.center, v.zoom, { duration: 0.8 }))}
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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', maxWidth: '250px' }}>
          {[...LEGEND_BASE, ...(showAis ? LEGEND_AIS : [])].map((item) => (
            <span key={item.label} title={item.hint || item.label}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
              <span style={{
                width: '10px', height: '10px', borderRadius: '50%', display: 'inline-block',
                background: item.hollow ? 'white' : item.color,
                border: `2px solid ${item.color}`,
              }} />
              {item.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

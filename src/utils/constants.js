// 관제사 표기 — 확인(ACK)·승인·반려 기록에 같은 이름이 남아야 한다.
// 예전엔 화면마다 '함현우 (관제)' / '관제사(함현우)' / '관제사(Oper-01)' 세 가지가
// 섞여 있어, 같은 사람이 한 조치가 다른 사람 것처럼 보였다.
export const OPERATOR_NAME = '관제사 함현우';

// ─────────────────────────────────────────────────────────────────────────────
// 화면 색 — PORT-MIS(울산항만공사 GIS 항만 모니터링) 톤에 맞춘 라이트 팔레트
//
// [왜 바꿨나]
// 이 시스템은 PORT-MIS 안의 한 축(액체화물 안전관제)으로 들어가는 것을 상정한다.
// 그런데 화면이 짙은 남색 계열이라 PORT-MIS 옆에 두면 다른 제품처럼 보였다.
// 관제 화면은 낮에 오래 보는 화면이기도 해서, 밝은 바탕이 실무에도 맞다.
//
// [어디는 어둡게 두는가]
// 디지털 트윈의 HUD(레이더·CCTV·선박목록·선석바)는 3D 씬 위에 뜨는 오버레이라
// 밝게 하면 배경과 붙어 안 읽힌다. PORT-MIS 도 밝은 지도 위에 어두운 툴바를
// 쓴다 — 같은 이유다. 그쪽은 DARK_HUD 를 쓴다.
//
// [의미 색]
// 라이트 배경에서는 형광 계열(#00d4aa·#ffd166)이 흰 바탕에 묻혀 판정 색으로
// 못 쓴다. 명도를 낮춰 흰 배경에서 대비가 서는 값으로 바꿨다.
// ─────────────────────────────────────────────────────────────────────────────
// [2026-10-09] KRDS 색 단계 — 등급 색은 semantic(success·warning·danger), 판정불가 보라는 유지
export const COLORS = {
  primary: '#256EF4',     // KRDS primary-50 — 주 버튼 · 포커스
  primaryBg: '#ECF2FE',   // KRDS primary-10 — 선택 바탕
  bg: '#F4F5F6',          // 페이지 바탕 (KRDS gray-10)
  panel: '#FFFFFF',       // 헤더·사이드바
  card: '#FFFFFF',        // 카드
  cardHover: '#F4F5F6',
  border: '#CDD1D5',      // KRDS gray-30 — 1px 기본 보더
  borderHover: '#8A949E', // KRDS gray-50
  navy: '#063A74',        // KRDS primary-70 (활성 탭·툴바)
  teal: '#1F7A47',        // 정상·적합 (KRDS success)
  tealDark: '#16603A',
  red: '#D6322F',         // 부적합·위험 (KRDS danger)
  yellow: '#C26900',      // 주의 (KRDS warning)
  amber: '#256EF4',       // 강조 버튼 채움 (KRDS primary-50)
  info: '#0B78CB',        // 정보 (KRDS info)
  blue: '#0B50D0',        // 링크 (KRDS primary-60)
  purple: '#5B3E9B',
  white: '#FFFFFF',
  textPrimary: '#131416',
  textSecondary: '#464C53',
  textDim: '#6D7882',
  glass: 'rgba(255, 255, 255, 0.92)',
  glassBorder: '#CDD1D5',
};

// 3D 트윈 HUD 전용 — 씬 위에 뜨는 오버레이는 계속 어둡게 간다.
export const DARK_HUD = {
  panel: 'rgba(10, 22, 32, 0.86)',
  border: 'rgba(120, 190, 215, 0.32)',
  textPrimary: '#E8F0F2',
  textSecondary: '#A9BCC6',
  textDim: '#7B8E99',
  accent: '#39C0A8',
};

// ─────────────────────────────────────────────
// 울산항 관제 구역 bbox (2026-07 실측 재조정값, data-pipeline 과 동일)
// ─────────────────────────────────────────────
export const ULSAN_BBOX = {
  minLat: 35.18,
  maxLat: 35.82,
  minLon: 129.22,
  maxLon: 129.76,
};
// react-leaflet Rectangle bounds 형식: [[남서], [북동]]
export const ULSAN_BBOX_BOUNDS = [
  [ULSAN_BBOX.minLat, ULSAN_BBOX.minLon],
  [ULSAN_BBOX.maxLat, ULSAN_BBOX.maxLon],
];
export const MAP_CENTER = [35.47, 129.40];
export const MAP_DEFAULT_ZOOM = 11;

// 선석별 하역 판정 4단계 → 색상 (지도/3D 역연동 하이라이트용)
// 라이트 배경에서 4단계가 서로 구분되도록 명도를 계단식으로 벌렸다.
export const WEATHER_STATUS_COLORS = {
  '정상': '#1F7A47',
  '하역중단': '#C26900',
  '이안': '#D2601A',
  '호스분리': '#D6322F',
  '판단불가': '#6D7882',
};

// AIS 항해 상태 → 한글 라벨/색상
//
// UNKNOWN 은 "AIS 항해상태 필드가 없는 배"다. 대부분 Class B 를 쓰는 항내 소형
// 작업선(예선·급유선·통선·시운전선)이라, '묘박'이나 '정박지 대기'로 세면 선석을
// 기다리는 본선 수가 부풀려진다(backendAdapter.navCategory 주석 참고).
export const NAV_STATUS = {
  UNDER_WAY: { label: '항해 중', color: '#0B50D0' },
  AT_ANCHOR: { label: '정박지 대기', color: '#C26900' },
  MOORED: { label: '접안 중', color: '#1F7A47' },
  UNKNOWN: { label: '항내 소형선', color: '#6D7882' },
};

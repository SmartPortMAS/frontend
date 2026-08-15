// 관제사 표기 — 확인(ACK)·승인·반려 기록에 같은 이름이 남아야 한다.
// 예전엔 화면마다 '함현우 (관제)' / '관제사(함현우)' / '관제사(Oper-01)' 세 가지가
// 섞여 있어, 같은 사람이 한 조치가 다른 사람 것처럼 보였다.
export const OPERATOR_NAME = '관제사 함현우';

export const COLORS = {
  bg: '#0a0f1c',
  panel: '#0d1b2a',
  card: '#1b2838',
  cardHover: '#243447',
  border: 'rgba(78, 205, 196, 0.15)',
  borderHover: 'rgba(0, 212, 170, 0.4)',
  teal: '#00d4aa',
  tealDark: '#00a888',
  red: '#ff4b6e',
  yellow: '#ffd166',
  info: '#4ecdc4',
  blue: '#3a86ff',
  purple: '#8338ec',
  white: '#e8f0f2',
  textPrimary: '#e8f0f2',
  textSecondary: '#8ba3b8',
  textDim: '#4a6a82',
  glass: 'rgba(13, 27, 42, 0.75)',
  glassBorder: 'rgba(78, 205, 196, 0.12)',
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
export const WEATHER_STATUS_COLORS = {
  '정상': '#00d4aa',
  '하역중단': '#ffd166',
  '이안': '#ff8c42',
  '호스분리': '#ff4b6e',
  '판단불가': '#4a6a82',
};

// AIS 항해 상태 → 한글 라벨/색상
export const NAV_STATUS = {
  UNDER_WAY: { label: '항해 중', color: '#3a86ff' },
  AT_ANCHOR: { label: '묘박 중', color: '#ffd166' },
  MOORED: { label: '접안 중', color: '#00d4aa' },
  UNKNOWN: { label: '상태 미상', color: '#8ba3b8' },
};

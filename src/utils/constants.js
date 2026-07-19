// ─────────────────────────────────────────────
// API & WebSocket Configuration
// ─────────────────────────────────────────────
const isDev = typeof window !== 'undefined' && window.location.hostname === 'localhost';
export const API_BASE = isDev ? 'http://localhost:8000/api' : '/api';
export const WS_URL = isDev ? 'ws://localhost:8000/ws/sensors' : `ws://${window.location.host}/ws/sensors`;

// ─────────────────────────────────────────────
// Color Palette
// ─────────────────────────────────────────────
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
// 3D Scene – Berth Positions
// ─────────────────────────────────────────────
export const BERTH_POSITIONS = [
  { id: 'B001', name: '1번 선석', position: [-30, 0, -10], rotation: 0 },
  { id: 'B002', name: '2번 선석', position: [-20, 0, -10], rotation: 0 },
  { id: 'B003', name: '3번 선석', position: [-10, 0, -10], rotation: 0 },
  { id: 'B004', name: '4번 선석', position: [0, 0, -10], rotation: 0 },
  { id: 'B005', name: '5번 선석', position: [10, 0, -10], rotation: 0 },
  { id: 'B006', name: '6번 선석', position: [20, 0, -10], rotation: 0 },
  { id: 'B007', name: '7번 선석', position: [30, 0, -10], rotation: 0 },
  { id: 'B008', name: '8번 선석', position: [40, 0, -10], rotation: 0 },
];

// ─────────────────────────────────────────────
// 3D Scene – Tank Positions
// ─────────────────────────────────────────────
export const TANK_POSITIONS = [
  { id: 'T001', name: '저장탱크 001', position: [-25, 0, 15], cargo: '벤젠', capacity: 5000 },
  { id: 'T002', name: '저장탱크 002', position: [-15, 0, 15], cargo: '톨루엔', capacity: 8000 },
  { id: 'T003', name: '저장탱크 003', position: [-5, 0, 15], cargo: '자일렌', capacity: 6000 },
  { id: 'T004', name: '저장탱크 004', position: [5, 0, 15], cargo: '황산', capacity: 10000 },
  { id: 'T005', name: '저장탱크 005', position: [15, 0, 15], cargo: '메탄올', capacity: 7000 },
  { id: 'T006', name: '저장탱크 006', position: [25, 0, 15], cargo: '에탄올', capacity: 4000 },
  { id: 'T007', name: '저장탱크 007', position: [-20, 0, 25], cargo: '초산', capacity: 5500 },
  { id: 'T008', name: '저장탱크 008', position: [-10, 0, 25], cargo: '가성소다', capacity: 9000 },
  { id: 'T009', name: '저장탱크 009', position: [0, 0, 25], cargo: '부탄올', capacity: 6500 },
  { id: 'T010', name: '저장탱크 010', position: [10, 0, 25], cargo: '스타이렌', capacity: 7500 },
];

// ─────────────────────────────────────────────
// Cargo Color Map (for 3D liquid)
// ─────────────────────────────────────────────
export const CARGO_COLORS = {
  '벤젠': '#ff6b6b',
  '톨루엔': '#ffa94d',
  '자일렌': '#ffd43b',
  '황산': '#69db7c',
  '메탄올': '#74c0fc',
  '에탄올': '#b197fc',
  '초산': '#f783ac',
  '가성소다': '#63e6be',
  '부탄올': '#a9e34b',
  '스타이렌': '#e599f7',
  default: '#4ecdc4',
};

// ─────────────────────────────────────────────
// Pipeline paths (from tank to berth)
// ─────────────────────────────────────────────
export const PIPELINE_PATHS = [
  { id: 'P001', from: 'T001', to: 'B001', color: '#00d4aa' },
  { id: 'P002', from: 'T002', to: 'B002', color: '#4ecdc4' },
  { id: 'P003', from: 'T003', to: 'B003', color: '#3a86ff' },
  { id: 'P004', from: 'T004', to: 'B004', color: '#ffd166' },
  { id: 'P005', from: 'T005', to: 'B005', color: '#ff4b6e' },
];

// ─────────────────────────────────────────────
// Navigation Items
// ─────────────────────────────────────────────
export const NAV_ITEMS = [
  { path: '/', label: '디지털 트윈', icon: '🏗️' },
  { path: '/dashboard', label: '대시보드', icon: '📊' },
  { path: '/safety', label: '안전 관제', icon: '🛡️' },
  { path: '/sensors', label: 'IoT 센서', icon: '📡' },
];

// ─────────────────────────────────────────────
// Safety Grade Colors
// ─────────────────────────────────────────────
export const SAFETY_GRADE_COLORS = {
  A: '#00d4aa',
  B: '#4ecdc4',
  C: '#ffd166',
  D: '#ff8c42',
  F: '#ff4b6e',
};

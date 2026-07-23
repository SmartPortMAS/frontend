import { create } from 'zustand';

// Dummy initial data to make UI look good immediately
const initialTanks = [
  { id: 'T-101', type: 'Tank', status: 'active', level: 85, temperature: 22.5, pressure: 1.2, cargoType: 'Crude Oil' },
  { id: 'T-102', type: 'Tank', status: 'active', level: 45, temperature: 21.0, pressure: 1.0, cargoType: 'Gasoline' },
  { id: 'T-103', type: 'Tank', status: 'idle', level: 10, temperature: 18.5, pressure: 0.9, cargoType: 'Chemicals' },
  { id: 'T-104', type: 'Tank', status: 'maintenance', level: 0, temperature: 15.0, pressure: 0.0, cargoType: 'Empty' },
  { id: 'T-105', type: 'Tank', status: 'active', level: 92, temperature: 25.1, pressure: 1.5, cargoType: 'Crude Oil' },
  { id: 'T-106', type: 'Tank', status: 'active', level: 60, temperature: 20.0, pressure: 1.1, cargoType: 'Gasoline' },
];

// berth 는 geoUtils BERTHS 의 키와 일치해야 3D 장면에서 해당 선석에 계류된다.
// status: 'operating'(하역 중) | 'mooring'(계류) | 'arriving'(입항) | 'departing'(출항)
// berth 는 geoUtils ONSAN_BERTHS_3D 의 키(온산 berth_id) — 대시보드 mock 배정과 일치
const initialShips = [
  { id: 'HMM GOODWILL', type: 'Ship', status: 'operating', berth: 'CY-OTK1', cargoAmount: 32000, cargoType: '에탄올' },
  { id: 'WOOYANG CHEMI', type: 'Ship', status: 'operating', berth: 'SA-JI1', cargoAmount: 18000, cargoType: '자일렌' },
  { id: 'PACIFIC GLORY', type: 'Ship', status: 'mooring', berth: 'SA-SO1', cargoAmount: 24000, cargoType: '등유' },
  { id: 'GAS UTOPIA', type: 'Ship', status: 'arriving', berth: 'CY-OTK2', cargoAmount: 15000, cargoType: '부타디엔' },
  { id: 'ULSAN PIONEER', type: 'Ship', status: 'departing', berth: 'SA-SO2', cargoAmount: 0, cargoType: '가솔린' },
  { id: 'SUN VENUS', type: 'Ship', status: 'anchored', berth: null, anchorage: 'E2', cargoAmount: 21000, cargoType: '톨루엔' },
];

const initialPipes = [
  { id: 'P-01', type: 'Pipe', flowRate: 1500, pressure: 4.5, status: 'active' },
  { id: 'P-02', type: 'Pipe', flowRate: 0, pressure: 1.0, status: 'idle' },
  { id: 'P-03', type: 'Pipe', flowRate: 800, pressure: 3.2, status: 'active' },
];

const initialSystemStatus = {
  activeShips: 6,
  safetyScore: 98,
  safetyGrade: 'A',
};

const initialLogs = [
  { agent: '하역 스케줄링 AI', action: '일정 최적화 완료', details: 'S-BlueWhale 접안 시간 15분 단축 (예상)', timestamp: Date.now() - 50000 },
  { agent: '안전 감시 AI', action: '가스 농도 정상 확인', details: 'B-1 선석 주변 가스 농도 0.0ppm 유지', timestamp: Date.now() - 120000 },
  { agent: '유체 제어 AI', action: '밸브 자동 조절', details: 'T-101 탱크 유입 속도 5% 감소 (과압 방지)', timestamp: Date.now() - 300000 },
];

const useSensorStore = create((set, get) => ({
  tanks: initialTanks,
  ships: initialShips,
  pipes: initialPipes,
  systemStatus: initialSystemStatus,
  aiLogs: initialLogs,
  connected: false,
  selectedObject: null,
  alerts: [],
  predictionOffset: 0, // Time offset in hours for prediction

  setPredictionOffset: (valOrFn) => set((state) => ({
    predictionOffset: typeof valOrFn === 'function' ? valOrFn(state.predictionOffset) : valOrFn
  })),

  setConnected: (val) => set({ connected: val }),

  setSelectedObject: (obj) => set({ selectedObject: obj }),

  // 온산 MVP 에이전트 패널 상태 (/api/v1/*)
  berthGroups: [],
  berthWeather: null,
  gateAssessment: null,
  orchestration: null,
  selectedBerthGroup: null, // 지도에서 선석 클릭 시 기상 판정 패널과 연동
  setSelectedBerthGroup: (v) => set({ selectedBerthGroup: v }),

  // 선박 상세 패널 (지도 마커/입항 목록 클릭 → 선박 여정 뷰)
  selectedVessel: null,
  setSelectedVessel: (v) => set({ selectedVessel: v }),

  // 경고 확인(acknowledge) 이력 — { alertId: { by, at } }
  alertAcks: {},
  ackAlert: (id) => set((s) => ({
    alertAcks: { ...s.alertAcks, [id]: { by: '함현우 (관제)', at: new Date().toISOString() } },
  })),
  setBerthGroups: (v) => set({ berthGroups: v }),
  setBerthWeather: (v) => set({ berthWeather: v }),
  setGateAssessment: (v) => set({ gateAssessment: v }),
  setOrchestration: (v) => set({ orchestration: v }),
  
  addAlert: (alert) => set((state) => ({
    alerts: [{ id: Date.now(), timestamp: Date.now(), ...alert }, ...state.alerts].slice(0, 20)
  })),

  getActiveAlerts: () => get().alerts,

  // WebSocket data updater
  updateSensorData: (data) => set((state) => {
    if (!data || !data.data) return { ...state };
    const payload = data.data;

    const newShips = [];
    if (payload.berths) {
      Object.keys(payload.berths).forEach(berthId => {
        const b = payload.berths[berthId];
        if (b.vessel_name) {
          newShips.push({
            id: b.vessel_name,
            type: 'Ship',
            status: b.phase, // 'approaching', 'mooring', 'operating', 'departing'
            berth: berthId,
            cargoAmount: b.progress ? b.progress * 1000 : 0, // Mock cargo
            vessel_lat: b.vessel_lat,
            vessel_lon: b.vessel_lon,
            vessel_heading: b.vessel_heading,
            vessel_speed: b.vessel_speed,
          });
        }
      });
    }

    let newAlerts = [];
    const newTanks = state.tanks.map(tank => {
      if (payload.tanks && payload.tanks[tank.id]) {
        const tData = payload.tanks[tank.id];
        const newLevel = tData.level !== undefined ? tData.level : tank.level;
        
        // Generate Alert for High Level
        if (newLevel > 90 && tank.level <= 90) {
          newAlerts.push({ message: `${tank.id} 탱크 수위 위험 (90% 초과)`, type: 'danger' });
        }
        
        return {
          ...tank,
          level: newLevel,
          flowRate: tData.flow_rate !== undefined ? tData.flow_rate : tank.flowRate,
          status: tData.state !== undefined ? tData.state : tank.status,
        };
      }
      return tank;
    });

    if (payload.weather) {
      if (payload.weather.wind_speed > 15) {
        // Prevent spamming the same alert
        const recentWindAlert = state.alerts.find(a => a.message.includes('풍속') && Date.now() - a.timestamp < 10000);
        if (!recentWindAlert) {
          newAlerts.push({ message: `강풍 경보: 풍속 ${payload.weather.wind_speed.toFixed(1)}m/s`, type: 'warning' });
        }
      }
    }

    const updatedAlerts = [...state.alerts];
    newAlerts.forEach(a => {
      updatedAlerts.unshift({ id: Date.now() + Math.random(), timestamp: Date.now(), ...a });
    });

    return { 
      ...state, 
      ships: newShips.length > 0 ? newShips : state.ships,
      tanks: newTanks,
      weather: payload.weather || state.weather,
      timestamp: payload.timestamp || state.timestamp,
      alerts: updatedAlerts.slice(0, 20)
    }; 
  })
}));

export default useSensorStore;

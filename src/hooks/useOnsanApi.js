import { useCallback } from 'react';
import { API_BASE } from '../utils/constants';
import { ONSAN_WEATHER_GROUP } from '../utils/geoUtils';
import useSensorStore from '../stores/useSensorStore';

// 온산 MVP 에이전트 API (선석별 기상 / 안전 게이트 R1~R15)
const V1_BASE = API_BASE.replace(/\/api$/, '/api/v1');

// ─── 로컬 폴백 (백엔드 미가동 시에도 데모 가능하게) ───
// 실측 임계는 berth_weather_thresholds.csv 기준, 미등록 선석군은 기본값.
const LOCAL_THRESHOLDS = {
  '정일1/2부두(산암리)': {
    stop: { wind: 17, wave: 1.0 }, unberth: { wind: 19, wave: null },
    disconnect: { wind: 21, wave: 2.0 }, source: '정일_입항정보_9.8 (로컬 폴백)',
  },
  'OTK1/2부두(처용리)': {
    stop: { wind: 14, wave: 2.0 }, unberth: { wind: 17, wave: null },
    disconnect: { wind: 20, wave: 2.5 }, source: 'OTK_입항정보 (로컬 폴백)',
  },
  default: {
    stop: { wind: 14, wave: 1.5 }, unberth: { wind: 17, wave: null },
    disconnect: { wind: 20, wave: 2.0 }, source: '기본 임계 (로컬 폴백)',
  },
};

function localAssessWeather({ berthGroup, windSpeed, waveHeight, isStale }) {
  if (isStale) {
    return {
      berth_group: berthGroup, status: '판단불가',
      reasons: ['관측값 유효기간 초과(stale) → fail-safe 판단불가'],
      thresholds_used: LOCAL_THRESHOLDS[berthGroup] || LOCAL_THRESHOLDS.default,
      is_local_fallback: true,
    };
  }
  const th = LOCAL_THRESHOLDS[berthGroup] || LOCAL_THRESHOLDS.default;
  const w = parseFloat(windSpeed) || 0;
  const h = parseFloat(waveHeight) || 0;
  const reasons = [];
  let status = '정상';
  const over = (v, lim) => lim != null && v >= lim;
  if (over(w, th.disconnect.wind) || over(h, th.disconnect.wave)) {
    status = '호스분리';
    if (over(w, th.disconnect.wind)) reasons.push(`풍속 ${w} m/s >= ${th.disconnect.wind} m/s -> 호스분리`);
    if (over(h, th.disconnect.wave)) reasons.push(`파고 ${h} m >= ${th.disconnect.wave} m -> 호스분리`);
  } else if (over(w, th.unberth.wind) || over(h, th.unberth.wave)) {
    status = '이안';
    if (over(w, th.unberth.wind)) reasons.push(`풍속 ${w} m/s >= ${th.unberth.wind} m/s -> 이안`);
    if (over(h, th.unberth.wave)) reasons.push(`파고 ${h} m >= ${th.unberth.wave} m -> 이안`);
  } else if (over(w, th.stop.wind) || over(h, th.stop.wave)) {
    status = '하역중단';
    if (over(w, th.stop.wind)) reasons.push(`풍속 ${w} m/s >= ${th.stop.wind} m/s -> 하역중단`);
    if (over(h, th.stop.wave)) reasons.push(`파고 ${h} m >= ${th.stop.wave} m -> 하역중단`);
  } else {
    reasons.push(`풍속 ${w} m/s · 파고 ${h} m — 모든 임계 미만`);
  }
  return {
    berth_group: berthGroup, status, reasons,
    thresholds_used: th, is_local_fallback: true,
  };
}

const LOCAL_BERTH_GROUPS = [...new Set(Object.values(ONSAN_WEATHER_GROUP))];

export default function useOnsanApi() {
  const setBerthGroups = useSensorStore((s) => s.setBerthGroups);
  const setBerthWeather = useSensorStore((s) => s.setBerthWeather);
  const setGateAssessment = useSensorStore((s) => s.setGateAssessment);
  const setOrchestration = useSensorStore((s) => s.setOrchestration);

  const fetchJson = useCallback(async (url, options) => {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error(`[OnsanAPI] ${url}:`, err);
      return null;
    }
  }, []);

  // 선석군 목록 (기상 임계 등록분) - 드롭다운용
  const fetchBerthGroups = useCallback(async () => {
    const data = await fetchJson(`${V1_BASE}/weather/berth-groups`);
    if (data) setBerthGroups(data.berth_groups || []);
    else setBerthGroups(LOCAL_BERTH_GROUPS); // 백엔드 미가동 → 로컬 목록
    return data;
  }, [fetchJson, setBerthGroups]);

  // 선석별 4단계 기상 판정 (정상/하역중단/이안/호스분리 + 판단불가)
  const assessBerthWeather = useCallback(
    async ({ berthGroup, windSpeed, waveHeight, visibility, isStale = false }) => {
      const params = new URLSearchParams({ berth_group: berthGroup, is_stale: String(isStale) });
      if (windSpeed !== '' && windSpeed != null) params.set('wind_speed', String(windSpeed));
      if (waveHeight !== '' && waveHeight != null) params.set('wave_height', String(waveHeight));
      if (visibility !== '' && visibility != null) params.set('visibility', String(visibility));
      const data = await fetchJson(`${V1_BASE}/weather/assess?${params}`);
      if (data) {
        setBerthWeather(data);
        return data;
      }
      // 백엔드 미가동 → 로컬 임계로 동일 4단계 판정 (데모/역연동 유지)
      const local = localAssessWeather({ berthGroup, windSpeed, waveHeight, isStale });
      setBerthWeather(local);
      return local;
    },
    [fetchJson, setBerthWeather]
  );

  // 안전 게이트 R1~R15 심사 (결정론, 같은 입력 = 같은 risk_level)
  const assessSafetyGates = useCallback(
    async (arrival) => {
      const data = await fetchJson(`${V1_BASE}/safety/assess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(arrival),
      });
      if (data) setGateAssessment(data);
      return data;
    },
    [fetchJson, setGateAssessment]
  );

  // 오케스트레이터: 기상 → 스케줄링(전용→대체→정박지대기) → 안전 게이트
  const orchestrate = useCallback(
    async ({ vesselName = 'DEMO VESSEL', cargoName, berthName, dwt, draught, gt, windSpeed = 5, waveHeight = 0.5 }) => {
      const params = new URLSearchParams({
        vessel_name: vesselName,
        cargo_name: cargoName,
        berth_name: berthName,
        wind_speed: String(windSpeed),
        wave_height: String(waveHeight),
      });
      if (dwt != null && dwt !== '') params.set('dwt', String(dwt));
      if (draught != null && draught !== '') params.set('draught', String(draught));
      if (gt != null && gt !== '') params.set('gt', String(gt));
      const data = await fetchJson(`${API_BASE}/agent/orchestrate?${params}`);
      if (data) setOrchestration(data);
      return data;
    },
    [fetchJson, setOrchestration]
  );

  return { fetchBerthGroups, assessBerthWeather, assessSafetyGates, orchestrate };
}

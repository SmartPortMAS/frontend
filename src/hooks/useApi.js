import { useCallback } from 'react';
import { API_BASE } from '../utils/constants';
import useSensorStore from '../stores/useSensorStore';

export default function useApi() {
  const setDashboardData = useSensorStore((s) => s.setDashboardData);
  const setVessels = useSensorStore((s) => s.setVessels);
  const setTankList = useSensorStore((s) => s.setTankList);
  const setBerthList = useSensorStore((s) => s.setBerthList);
  const setWeatherHistory = useSensorStore((s) => s.setWeatherHistory);
  const setKnowledgeGraph = useSensorStore((s) => s.setKnowledgeGraph);
  const setSafetyAssessment = useSensorStore((s) => s.setSafetyAssessment);
  const setOrchestrationResult = useSensorStore((s) => s.setOrchestrationResult);
  const addAgentLog = useSensorStore((s) => s.addAgentLog);

  const fetchJson = useCallback(async (url) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error(`[API] ${url}:`, err);
      return null;
    }
  }, []);

  const fetchDashboard = useCallback(async () => {
    const data = await fetchJson(`${API_BASE}/dashboard`);
    if (data) setDashboardData(data);
    return data;
  }, [fetchJson, setDashboardData]);

  const fetchVessels = useCallback(async () => {
    const data = await fetchJson(`${API_BASE}/simulation/vessels`);
    if (data) setVessels(Array.isArray(data) ? data : data.vessels || []);
    return data;
  }, [fetchJson, setVessels]);

  const fetchTanks = useCallback(async () => {
    const data = await fetchJson(`${API_BASE}/simulation/tanks`);
    if (data) setTankList(Array.isArray(data) ? data : data.tanks || []);
    return data;
  }, [fetchJson, setTankList]);

  const fetchBerths = useCallback(async () => {
    const data = await fetchJson(`${API_BASE}/simulation/berths`);
    if (data) setBerthList(Array.isArray(data) ? data : data.berths || []);
    return data;
  }, [fetchJson, setBerthList]);

  const fetchWeatherHistory = useCallback(async (hours = 72) => {
    const data = await fetchJson(`${API_BASE}/weather/history?hours=${hours}`);
    if (data) setWeatherHistory(Array.isArray(data) ? data : data.history || []);
    return data;
  }, [fetchJson, setWeatherHistory]);

  const fetchKnowledgeGraph = useCallback(async (cargoName) => {
    const data = await fetchJson(
      `${API_BASE}/agent/knowledge-graph?cargo_name=${encodeURIComponent(cargoName)}`
    );
    if (data) setKnowledgeGraph(data);
    return data;
  }, [fetchJson, setKnowledgeGraph]);

  const fetchSafety = useCallback(async (cargoName, adjacentCargo) => {
    const data = await fetchJson(
      `${API_BASE}/agent/safety?cargo_name=${encodeURIComponent(cargoName)}&adjacent_cargo=${encodeURIComponent(adjacentCargo)}`
    );
    if (data) setSafetyAssessment(data);
    return data;
  }, [fetchJson, setSafetyAssessment]);

  const fetchOrchestrate = useCallback(
    async ({ vesselName, cargoName, berthName, windSpeed, waveHeight }) => {
      const params = new URLSearchParams({
        vessel_name: vesselName,
        cargo_name: cargoName,
        berth_name: berthName,
        wind_speed: String(windSpeed),
        wave_height: String(waveHeight),
      });
      const data = await fetchJson(`${API_BASE}/agent/orchestrate?${params}`);
      if (data) {
        setOrchestrationResult(data);
        addAgentLog({
          timestamp: new Date().toISOString(),
          action: '오케스트레이션 실행',
          detail: `${vesselName} → ${berthName} (${cargoName})`,
          result: data.decision || data.result || 'completed',
        });
      }
      return data;
    },
    [fetchJson, setOrchestrationResult, addAgentLog]
  );

  return {
    fetchDashboard,
    fetchVessels,
    fetchTanks,
    fetchBerths,
    fetchWeatherHistory,
    fetchKnowledgeGraph,
    fetchSafety,
    fetchOrchestrate,
  };
}

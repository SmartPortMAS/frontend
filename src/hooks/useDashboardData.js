import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '../utils/constants';
import { mockDashboard, advanceMockVessels } from '../mocks/mockDashboard';

// false: GET /api/dashboard 사용 (지금은 mock-server/dashboard_server.py,
// 김동안 백엔드 완성 시 동일 계약으로 자동 대체). true: 브라우저 내장 mock.
const USE_MOCK = false;

// 폴링 주기 30초 (CLAUDE.md 합의: WebSocket 은 후순위)
const POLL_INTERVAL_MS = 30_000;

/**
 * 대시보드 데이터(선박·기상·경고)를 주기적으로 가져오는 훅.
 * mock 모드에서는 폴링 시점마다 항해 중 선박을 조금씩 움직여
 * 실시간처럼 보이게 한다.
 *
 * @returns {{ data: object, loading: boolean, error: string|null, refresh: () => void }}
 */
export default function useDashboardData() {
  const [data, setData] = useState(mockDashboard);
  const [loading, setLoading] = useState(!USE_MOCK);
  const [error, setError] = useState(null);
  const dataRef = useRef(mockDashboard);

  const refresh = useCallback(async () => {
    if (USE_MOCK) {
      const next = advanceMockVessels(dataRef.current);
      dataRef.current = next;
      setData(next);
      return;
    }
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/dashboard`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      dataRef.current = json;
      setData(json);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!USE_MOCK) refresh();
    const timer = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  return { data, loading, error, refresh };
}

import { useEffect, useRef, useCallback } from 'react';
import useSensorStore from '../stores/useSensorStore';
import { WS_URL } from '../utils/constants';

export default function useWebSocket() {
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const updateSensorData = useSensorStore((s) => s.updateSensorData);
  const setConnected = useSensorStore((s) => s.setConnected);
  const addAlert = useSensorStore((s) => s.addAlert);

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WS] Connected to sensor stream');
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          updateSensorData(data);

          // Check for gas alerts
          if (data.gas) {
            Object.entries(data.gas).forEach(([berthId, gasData]) => {
              if (gasData.ppm > 5.0) {
                addAlert({
                  type: 'danger',
                  title: '가스 농도 경고',
                  message: `${berthId} 선석 가스 농도 ${gasData.ppm.toFixed(1)} ppm 초과`,
                });
              }
            });
          }

          // Check for weather alerts
          if (data.weather) {
            if (data.weather.wind_speed > 15) {
              addAlert({
                type: 'warning',
                title: '강풍 주의',
                message: `풍속 ${data.weather.wind_speed.toFixed(1)} m/s — 하역 작업 주의`,
              });
            }
          }
        } catch (err) {
          console.warn('[WS] Parse error:', err);
        }
      };

      ws.onclose = () => {
        console.log('[WS] Disconnected, reconnecting in 3s...');
        setConnected(false);
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        console.error('[WS] Error:', err);
        ws.close();
      };
    } catch (err) {
      console.error('[WS] Connection failed:', err);
      reconnectTimer.current = setTimeout(connect, 3000);
    }
  }, [updateSensorData, setConnected, addAlert]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  return wsRef;
}

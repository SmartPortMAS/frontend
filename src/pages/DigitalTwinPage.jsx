import { useState, useEffect, useRef } from 'react';
import Scene from '../components/three/Scene';
import PortMap from '../components/dashboard/PortMap';
import RadarMap from '../components/three/hud/RadarMap';
import CCTVPanel from '../components/three/hud/CCTVPanel';
import VesselTrafficList from '../components/three/hud/VesselTrafficList';
import useSensorStore from '../stores/useSensorStore';
import { FaMap, FaPlay, FaPause, FaForward, FaFastForward, FaExclamationTriangle } from 'react-icons/fa';

export default function DigitalTwinPage() {
  const [showMap, setShowMap] = useState(false);
  const [showOmniverseStream, setShowOmniverseStream] = useState(false);
  const predictionOffset = useSensorStore(state => state.predictionOffset);
  const setPredictionOffset = useSensorStore(state => state.setPredictionOffset);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setPredictionOffset(prev => {
          if (prev >= 720) {
            setIsPlaying(false);
            return 720;
          }
          return prev + 10;
        });
      }, 1000 / playSpeed);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, playSpeed, setPredictionOffset]);

  const togglePlay = () => setIsPlaying(!isPlaying);

  return (
    <div className="digital-twin-page" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <Scene />
      
      {/* VTS 실시간 관제 알림 전광판 (Alert Ticker) */}
      <div style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '30px',
        background: 'linear-gradient(90deg, rgba(15,23,42,1) 0%, rgba(220,38,38,0.8) 50%, rgba(15,23,42,1) 100%)',
        zIndex: 2000, display: 'flex', alignItems: 'center', color: '#fff', fontSize: '14px', fontWeight: 'bold',
        overflow: 'hidden', borderBottom: '2px solid #ef4444'
      }}>
        <div style={{
          whiteSpace: 'nowrap',
          animation: 'marquee 20s linear infinite',
          display: 'flex', gap: '50px'
        }}>
          <span><FaExclamationTriangle color="#f59e0b" /> [위험] T005 탱크 수위 90% 임박 (ESD 대기)</span>
          <span>✅ [접안] ULSAN PIONEER 제3부두 접안 완료</span>
          <span>ℹ️ [시스템] 해양수산부 VTS 연동 정상화</span>
          <span><FaExclamationTriangle color="#f59e0b" /> [위험] T005 탱크 수위 90% 임박 (ESD 대기)</span>
        </div>
      </div>

      <style>{`
        @keyframes marquee {
          0% { transform: translateX(100vw); }
          100% { transform: translateX(-100%); }
        }
      `}</style>

      {/* HUD Overlays */}
      {!showMap && (
        <>
          <RadarMap />
          <CCTVPanel />
          <VesselTrafficList />
        </>
      )}

      <div style={{ position: 'absolute', top: 50, right: 20, zIndex: 1000, display: 'flex', gap: '10px' }}>
        <button 
          className="action-btn"
          onClick={() => setShowOmniverseStream(!showOmniverseStream)}
          style={{ 
            padding: '10px 16px', background: showOmniverseStream ? 'rgba(16, 185, 129, 0.8)' : 'rgba(15, 23, 42, 0.8)', 
            backdropFilter: 'blur(10px)', color: showOmniverseStream ? '#fff' : '#10b981', border: '1px solid rgba(16, 185, 129, 0.5)',
            borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold'
          }}
        >
          <FaPlay /> {showOmniverseStream ? 'Omniverse 스트리밍 끄기' : 'Omniverse 실시간 스트리밍 켜기'}
        </button>

        <button 
          className="action-btn"
          onClick={() => setShowMap(!showMap)}
          style={{ 
            padding: '10px 16px', background: 'rgba(15, 23, 42, 0.8)', 
            backdropFilter: 'blur(10px)', color: '#0ea5e9', border: '1px solid rgba(14, 165, 233, 0.5)',
            borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold'
          }}
        >
          <FaMap /> {showMap ? '3D View' : '2D Map'}
        </button>
      </div>

      {/* Omniverse WebRTC Streaming Player */}
      {showOmniverseStream && (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 850, background: '#000' }}>
          {/* 보통 Omniverse WebRTC는 8011, 8111, 또는 8889 포트를 사용합니다 */}
          <iframe 
            src="http://localhost:8111" 
            style={{ width: '100%', height: '100%', border: 'none' }}
            title="Omniverse WebRTC Stream"
            allow="camera; microphone; fullscreen; display-capture"
          />
        </div>
      )}

      {showMap && (
        <div className="map-overlay" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 900 }}>
          <PortMap />
        </div>
      )}

      {/* Time Travel Slider with Media Controls */}
      <div className="time-slider-container" style={{ 
        position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)', 
        width: '600px', background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(10px)',
        padding: '16px 24px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', flexDirection: 'column', gap: '12px', zIndex: 1000 
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={togglePlay} style={{ background: isPlaying ? '#ef4444' : '#10b981', color: '#fff', border: 'none', borderRadius: '4px', padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
              {isPlaying ? <FaPause /> : <FaPlay />} {isPlaying ? '정지' : '오토플레이'}
            </button>
            <button onClick={() => setPlaySpeed(1)} style={{ background: playSpeed === 1 ? '#38bdf8' : '#334155', color: '#fff', border: 'none', borderRadius: '4px', padding: '6px 10px', cursor: 'pointer' }}>1x</button>
            <button onClick={() => setPlaySpeed(2)} style={{ background: playSpeed === 2 ? '#38bdf8' : '#334155', color: '#fff', border: 'none', borderRadius: '4px', padding: '6px 10px', cursor: 'pointer' }}><FaForward /></button>
            <button onClick={() => setPlaySpeed(5)} style={{ background: playSpeed === 5 ? '#38bdf8' : '#334155', color: '#fff', border: 'none', borderRadius: '4px', padding: '6px 10px', cursor: 'pointer' }}><FaFastForward /></button>
          </div>
          
          <span style={{ color: predictionOffset > 0 ? '#38bdf8' : '#10b981', fontSize: '13px', fontWeight: 'bold' }}>
            {predictionOffset === 0 ? '실시간 관제 중' : `예측 시뮬레이션: +${Math.floor(predictionOffset / 60)}시간 ${predictionOffset % 60}분 뒤`}
          </span>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '11px', marginTop: '-4px' }}>
          <span>Live</span>
          <span>+12h</span>
        </div>
        
        <input 
          type="range" 
          min="0" 
          max="720" 
          step="10" 
          value={predictionOffset} 
          onChange={(e) => {
            setIsPlaying(false);
            setPredictionOffset(parseInt(e.target.value));
          }}
          style={{ width: '100%', cursor: 'pointer', accentColor: '#38bdf8' }}
        />
      </div>
    </div>
  );
}

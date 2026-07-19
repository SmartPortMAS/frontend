import { useState, useEffect } from 'react';

export default function CCTVPanel() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="cctv-panel" style={{
      position: 'absolute', top: 20, left: 20, zIndex: 1000,
      width: '280px', height: '160px',
      background: 'rgba(0, 0, 0, 0.6)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      borderRadius: '4px',
      overflow: 'hidden',
      pointerEvents: 'none',
      fontFamily: 'monospace'
    }}>
      {/* Noise Background (CSS pattern) */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.1) 1px, transparent 1px)',
        backgroundSize: '3px 3px',
        opacity: 0.3
      }}></div>
      
      {/* Scanline */}
      <div className="cctv-scanline" style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '10px',
        background: 'rgba(255,255,255,0.05)',
        boxShadow: '0 0 10px rgba(255,255,255,0.1)'
      }}></div>

      <div style={{ position: 'absolute', top: 10, left: 10, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 'bold' }}>
        <div style={{ width: '8px', height: '8px', background: '#ef4444', borderRadius: '50%', animation: 'pulse 1s infinite' }}></div>
        REC
      </div>

      <div style={{ position: 'absolute', top: 10, right: 10, color: '#fff', fontSize: '12px' }}>
        CAM-04 (B004)
      </div>

      <div style={{ position: 'absolute', bottom: 10, right: 10, color: '#fff', fontSize: '12px' }}>
        {time.toISOString().replace('T', ' ').substring(0, 19)}
      </div>
      
      <style>{`
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0; } 100% { opacity: 1; } }
        .cctv-scanline { animation: scan 4s linear infinite; }
        @keyframes scan { 0% { top: -10%; } 100% { top: 110%; } }
      `}</style>
    </div>
  );
}

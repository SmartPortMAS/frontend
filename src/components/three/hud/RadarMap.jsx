import { useEffect, useState } from 'react';
import useSensorStore from '../../../stores/useSensorStore';

export default function RadarMap() {
  const ships = useSensorStore(state => state.ships);
  const [angle, setAngle] = useState(0);

  useEffect(() => {
    let animationFrame;
    const animate = () => {
      setAngle(prev => (prev + 2) % 360);
      animationFrame = requestAnimationFrame(animate);
    };
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  return (
    <div className="radar-container" style={{
      position: 'absolute', bottom: 40, right: 20, zIndex: 1000,
      width: '200px', height: '200px',
      background: 'rgba(5, 8, 17, 0.8)',
      border: '2px solid #00d4aa',
      borderRadius: '50%',
      overflow: 'hidden',
      boxShadow: '0 0 15px rgba(0, 212, 170, 0.4)',
      pointerEvents: 'none'
    }}>
      {/* Grid Lines */}
      <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: 'rgba(0, 212, 170, 0.3)' }}></div>
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: '1px', background: 'rgba(0, 212, 170, 0.3)' }}></div>
      
      {/* Concentric Circles */}
      <div style={{ position: 'absolute', top: '25%', left: '25%', right: '25%', bottom: '25%', border: '1px solid rgba(0, 212, 170, 0.3)', borderRadius: '50%' }}></div>
      <div style={{ position: 'absolute', top: '10%', left: '10%', right: '10%', bottom: '10%', border: '1px solid rgba(0, 212, 170, 0.3)', borderRadius: '50%' }}></div>
      
      {/* Sweeper */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        width: '50%', height: '50%',
        background: 'conic-gradient(from 0deg, transparent 70%, rgba(0, 212, 170, 0.8) 100%)',
        transformOrigin: '0 0',
        transform: `rotate(${angle}deg)`,
      }}></div>

      {/* Ship Blips */}
      {ships.map((ship, idx) => (
        <div key={ship.id} style={{
          position: 'absolute',
          top: `${50 + (Math.sin(idx * 2) * 30)}%`,
          left: `${50 + (Math.cos(idx * 2) * 30)}%`,
          width: '6px', height: '6px',
          background: '#00d4aa',
          borderRadius: '50%',
          boxShadow: '0 0 5px #00d4aa'
        }}></div>
      ))}
      
      <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, textAlign: 'center', color: '#00d4aa', fontSize: '10px', fontFamily: 'monospace' }}>
        UPA VTS RADAR
      </div>
    </div>
  );
}

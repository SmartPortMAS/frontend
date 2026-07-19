import useSensorStore from '../../../stores/useSensorStore';

export default function VesselTrafficList() {
  const ships = useSensorStore(state => state.ships);

  return (
    <div className="vessel-traffic-list" style={{
      position: 'absolute', top: 200, left: 20, zIndex: 1000,
      width: '320px',
      background: 'rgba(5, 8, 17, 0.85)',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(0, 212, 170, 0.3)',
      borderRadius: '8px',
      color: '#00d4aa',
      fontFamily: 'monospace',
      overflow: 'hidden'
    }}>
      <div style={{ padding: '10px 15px', borderBottom: '1px solid rgba(0, 212, 170, 0.3)', background: 'rgba(0, 212, 170, 0.1)', fontWeight: 'bold', letterSpacing: '2px' }}>
        UPA VTS TRAFFIC
      </div>
      
      <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
        {ships.length === 0 ? (
          <div style={{ color: '#8ba3b8', fontSize: '12px', textAlign: 'center' }}>No active vessels</div>
        ) : (
          ships.map(ship => (
            <div key={ship.id} style={{ 
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px',
              borderLeft: `3px solid ${ship.status === 'operating' ? '#10b981' : ship.status === 'mooring' ? '#f59e0b' : '#38bdf8'}`
            }}>
              <div>
                <div style={{ color: '#fff', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>{ship.id}</div>
                <div style={{ color: '#8ba3b8', fontSize: '11px' }}>{ship.berth} | {ship.status.toUpperCase()}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: '#38bdf8', fontSize: '12px', marginBottom: '4px' }}>{Math.round(ship.cargoAmount / 1000)}k t</div>
                <div style={{ color: '#10b981', fontSize: '11px' }}>{ship.vessel_speed || 0} kts</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

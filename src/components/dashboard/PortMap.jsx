import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import useSensorStore from '../../stores/useSensorStore';
import { BERTHS } from '../../utils/geoUtils';

// Custom Map Marker Icons
const createShipIcon = (color) => new L.Icon({
  iconUrl: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${encodeURIComponent(color)}"><path d="M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42c-.26.08-.48.26-.6.5s-.15.52-.06.78L3.95 19zM6 6h12v3.73l-6-1.94-6 1.94V6z"/></svg>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16]
});

export default function PortMap() {
  const { ships, selectedObject, setSelectedObject } = useSensorStore();
  const mapRef = useRef();

  return (
    <div style={{ height: '100%', width: '100%', borderRadius: '16px', overflow: 'hidden' }}>
      <MapContainer 
        center={[35.46, 129.38]} 
        zoom={13} 
        style={{ height: '100%', width: '100%', background: '#0a0f1c' }}
        ref={mapRef}
        attributionControl={false}
      >
        {/* Dark theme tile layer */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        {/* Berths / Terminals */}
        {Object.entries(BERTHS).map(([id, b]) => (
          <Circle
            key={id}
            center={[b.lat, b.lon]}
            radius={100}
            pathOptions={{ color: '#4ecdc4', fillColor: '#4ecdc4', fillOpacity: 0.2 }}
          >
            <Popup>
              <div style={{ color: '#000' }}>
                <strong>{b.name} ({id})</strong>
              </div>
            </Popup>
          </Circle>
        ))}

        {/* Ships */}
        {ships.map(ship => {
          if (!ship.vessel_lat || !ship.vessel_lon) return null;
          
          let color = '#3a86ff'; // approaching/departing
          if (ship.status === 'operating') color = '#00d4aa'; // working
          if (ship.status === 'mooring') color = '#ffd166'; // mooring

          return (
            <Marker 
              key={ship.id} 
              position={[ship.vessel_lat, ship.vessel_lon]}
              icon={createShipIcon(color)}
              eventHandlers={{
                click: () => setSelectedObject(ship),
              }}
            >
              <Popup>
                <div style={{ color: '#000', padding: '5px' }}>
                  <h3 style={{ margin: '0 0 5px 0' }}>{ship.id}</h3>
                  <p style={{ margin: 0 }}><strong>Phase:</strong> {ship.status}</p>
                  <p style={{ margin: 0 }}><strong>Speed:</strong> {ship.vessel_speed} knots</p>
                  <p style={{ margin: 0 }}><strong>Heading:</strong> {ship.vessel_heading}°</p>
                  {ship.status === 'operating' && <p style={{ margin: 0 }}><strong>Cargo:</strong> {ship.cargoAmount}t</p>}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}

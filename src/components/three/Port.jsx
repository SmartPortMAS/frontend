import { useMemo } from 'react';
import useSensorStore from '../../stores/useSensorStore';
import Tank from './Tank';
import Ship from './Ship';
import Pipe from './Pipe';
import InfoPopup from './InfoPopup';
import { BERTHS, convertLatLonToVector3 } from '../../utils/geoUtils';

export default function Port() {
  const { tanks, ships, pipes, selectedObject, setSelectedObject } =
    useSensorStore();

  // Pre-compute berth positions for tank placement
  const berthPositions = useMemo(() => {
    const positions = {};
    Object.entries(BERTHS).forEach(([id, berth]) => {
      positions[id] = convertLatLonToVector3(berth.lat, berth.lon);
    });
    return positions;
  }, []);

  return (
    <group>
      {/* ===== GROUND PLANE (Land Area) ===== */}
      <mesh position={[120, -0.5, 0]} receiveShadow>
        <boxGeometry args={[300, 1, 600]} />
        <meshStandardMaterial color="#2d3748" roughness={0.95} />
      </mesh>

      {/* ===== BERTH STRUCTURES ===== */}
      {Object.entries(BERTHS).map(([id, berth]) => {
        const [x, , z] = convertLatLonToVector3(berth.lat, berth.lon);

        return (
          <group key={id} position={[x, 0, z]}>
            {/* Main Pier Deck */}
            <mesh position={[20, 2, 0]} receiveShadow>
              <boxGeometry args={[45, 4, 25]} />
              <meshStandardMaterial color="#374151" roughness={0.9} />
            </mesh>

            {/* Marine Loading Arms (MLA) — complex structure */}
            <group position={[3, 4.5, 0]}>
              {/* MLA tower */}
              <mesh position={[0, 4, 0]} castShadow>
                <boxGeometry args={[3, 8, 3]} />
                <meshStandardMaterial
                  color="#eab308"
                  roughness={0.5}
                  metalness={0.7}
                />
              </mesh>
              {/* Arm 1 (port side) */}
              <mesh
                position={[-3, 7.5, -4]}
                rotation={[0, 0, Math.PI / 4]}
                castShadow
              >
                <cylinderGeometry args={[0.3, 0.3, 10, 8]} />
                <meshStandardMaterial color="#eab308" />
              </mesh>
              {/* Arm 2 (starboard side) */}
              <mesh
                position={[-3, 7.5, 4]}
                rotation={[0, 0, Math.PI / 4]}
                castShadow
              >
                <cylinderGeometry args={[0.3, 0.3, 10, 8]} />
                <meshStandardMaterial color="#eab308" />
              </mesh>
            </group>

            {/* Trestle (Access Bridge) */}
            <mesh position={[45, 2, 0]} receiveShadow>
              <boxGeometry args={[30, 3, 8]} />
              <meshStandardMaterial color="#4b5563" />
            </mesh>

            {/* Pier Pipeline */}
            <group position={[25, 4.5, -5]}>
              <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.4, 0.4, 30, 8]} />
                <meshStandardMaterial
                  color="#9ca3af"
                  metalness={0.8}
                  roughness={0.3}
                />
              </mesh>
              <mesh
                position={[0, 0, 2]}
                rotation={[0, 0, Math.PI / 2]}
                castShadow
              >
                <cylinderGeometry args={[0.6, 0.6, 30, 8]} />
                <meshStandardMaterial
                  color="#9ca3af"
                  metalness={0.8}
                  roughness={0.3}
                />
              </mesh>
            </group>

            {/* Tire Fenders */}
            <group position={[0, 2, 0]}>
              {[-10, 0, 10].map((fz, i) => (
                <mesh
                  key={`fender-${i}`}
                  position={[-2.5, 0, fz]}
                  rotation={[0, 0, Math.PI / 2]}
                  castShadow
                >
                  <cylinderGeometry args={[1, 1, 1, 16]} />
                  <meshStandardMaterial color="#1f2937" roughness={1} />
                </mesh>
              ))}
            </group>

            {/* Light Poles */}
            <group>
              {[-10, 10].map((lz, i) => (
                <group key={`light-${i}`} position={[15, 4, lz]}>
                  {/* Pole */}
                  <mesh position={[0, 10, 0]} castShadow>
                    <cylinderGeometry args={[0.2, 0.4, 20, 8]} />
                    <meshStandardMaterial color="#6b7280" />
                  </mesh>
                  {/* Light fixture */}
                  <mesh position={[0, 20, 0]}>
                    <boxGeometry args={[1, 0.5, 2]} />
                    <meshStandardMaterial
                      color="#eab308"
                      emissive="#eab308"
                      emissiveIntensity={2}
                    />
                  </mesh>
                  <pointLight
                    position={[0, 19, 0]}
                    distance={100}
                    intensity={0.5}
                    color="#fef08a"
                  />
                </group>
              ))}
            </group>

            {/* Mooring Dolphins & Catwalks */}
            <group>
              {[-35, 35].map((dz, i) => (
                <group key={`dolphin-${i}`} position={[20, 2, dz]}>
                  {/* Dolphin concrete base */}
                  <mesh position={[0, 0, 0]} castShadow receiveShadow>
                    <boxGeometry args={[10, 4, 10]} />
                    <meshStandardMaterial color="#4b5563" roughness={0.9} />
                  </mesh>
                  {/* Bollard */}
                  <mesh position={[-3, 2.5, 0]} castShadow>
                    <cylinderGeometry args={[0.5, 0.6, 1.5, 16]} />
                    <meshStandardMaterial color="#1f2937" metalness={0.8} />
                  </mesh>
                  {/* Dolphin fender */}
                  <mesh
                    position={[-5.2, 0, 0]}
                    rotation={[0, 0, Math.PI / 2]}
                    castShadow
                  >
                    <cylinderGeometry args={[2, 2, 0.5, 16]} />
                    <meshStandardMaterial color="#111827" roughness={1} />
                  </mesh>
                  {/* Catwalk connecting to main pier */}
                  <mesh
                    position={[0, 1, dz < 0 ? 15 : -15]}
                    receiveShadow
                  >
                    <boxGeometry args={[4, 0.5, 20]} />
                    <meshStandardMaterial color="#9ca3af" wireframe />
                  </mesh>
                </group>
              ))}
            </group>
          </group>
        );
      })}

      {/* ===== NAVIGATIONAL BUOYS ===== */}
      <group>
        {[-80, -40, 40, 80].map((bz, i) => (
          <group key={`buoy-${i}`} position={[-50, 0, bz]}>
            {/* Buoy base cylinder */}
            <mesh position={[0, 0.5, 0]}>
              <cylinderGeometry args={[1.5, 1.5, 1, 16]} />
              <meshStandardMaterial
                color={bz < 0 ? '#ef4444' : '#10b981'}
              />
            </mesh>
            {/* Buoy cone top */}
            <mesh position={[0, 2, 0]}>
              <coneGeometry args={[1.5, 3, 16]} />
              <meshStandardMaterial
                color={bz < 0 ? '#ef4444' : '#10b981'}
              />
            </mesh>
            <pointLight
              position={[0, 4, 0]}
              distance={50}
              intensity={1}
              color={bz < 0 ? '#ef4444' : '#10b981'}
            />
          </group>
        ))}
      </group>

      {/* ===== TANKS — placed inland in organized rows ===== */}
      {tanks.map((tank, index) => {
        // Assign tank to a berth cyclically
        const berthId = `B00${(index % 8) + 1}`;
        const berthPos = berthPositions[berthId] || berthPositions['B001'];
        const [bx, , bz] = berthPos;

        // Tank placement: base X offset 80 units inland from berth
        // Arrange in 2 rows with 20 unit spacing between rows
        // Z spacing: 18 units between tanks in same row
        const row = index % 2; // 0 or 1 (two rows)
        const col = Math.floor(index / 2); // column position

        const tankX = bx + 80 + row * 20;
        const tankZ = bz - 18 + col * 18;

        return (
          <Tank
            key={tank.id}
            position={[tankX, 0, tankZ]}
            tank={tank}
            onClick={() => setSelectedObject(tank)}
          />
        );
      })}

      {/* ===== SHIPS ===== */}
      {ships.map((ship) => (
        <Ship
          key={ship.id}
          ship={ship}
          onClick={() => setSelectedObject(ship)}
        />
      ))}

      {/* ===== PIPES ===== */}
      {pipes && pipes.map((pipe) => (
        <Pipe key={pipe.id} pipe={pipe} />
      ))}

      {/* ===== INFO POPUP (HTML Overlay) ===== */}
      {selectedObject && (
        <InfoPopup
          object={selectedObject}
          onClose={() => setSelectedObject(null)}
        />
      )}
    </group>
  );
}

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { convertLatLonToVector3 } from '../../utils/geoUtils';
import useSensorStore from '../../stores/useSensorStore';

export default function Ship({ ship, onClick }) {
  const shipRef = useRef();
  const predictionOffset = useSensorStore(state => state.predictionOffset);

  // Base position from lat/lon or fallback
  const basePos = useMemo(() => {
    return ship.vessel_lat
      ? convertLatLonToVector3(ship.vessel_lat, ship.vessel_lon)
      : [0, 0, 0];
  }, [ship.vessel_lat, ship.vessel_lon]);

  // Compute target position and heading based on ship status and prediction offset
  const { targetPos, targetHeading } = useMemo(() => {
    const pos = [basePos[0], 0, basePos[2]];

    // Ship faces negative-X direction when docked (perpendicular to pier, bow pointing seaward)
    let heading = -Math.PI / 2;

    if (ship.status === 'arriving') {
      // Ship starts 80 units away on Z axis, arrives over 90 minutes
      const progress = Math.min(1, predictionOffset / 90);
      const distanceLeft = 80 * (1 - progress);
      pos[2] += distanceLeft;
      // While arriving, face toward the berth (negative-Z direction blended toward dock heading)
      heading = -Math.PI / 2 + (1 - progress) * (Math.PI * 0.15);
    } else if (ship.status === 'operating') {
      // Stay docked until predictionOffset > 240 minutes (4 hours), then slowly depart
      if (predictionOffset > 240) {
        const departTime = predictionOffset - 240;
        const departProgress = Math.min(1, departTime / 60);
        const distanceGone = 150 * departProgress;
        pos[2] += distanceGone;
        // Gradually turn away from dock as departing
        heading = -Math.PI / 2 - departProgress * (Math.PI * 0.15);
      }
      // Otherwise stay exactly at dock position
    } else if (ship.status === 'departing') {
      // Move away gradually, max 150 units over 60 minutes
      const departProgress = Math.min(1, predictionOffset / 60);
      const distanceGone = 150 * departProgress;
      pos[2] += distanceGone;
      // Turn away from dock
      heading = -Math.PI / 2 - departProgress * (Math.PI * 0.2);
    }

    // Apply vessel_heading from sensor data if available (for live data)
    if (ship.vessel_heading && ship.status !== 'operating') {
      heading = THREE.MathUtils.degToRad(-ship.vessel_heading);
    }

    return { targetPos: pos, targetHeading: heading };
  }, [basePos, ship.status, ship.vessel_heading, predictionOffset]);

  useFrame((state, delta) => {
    if (!shipRef.current) return;

    // Smooth position lerp — delta * 0.8 for realistic large vessel movement
    const lerpFactor = delta * 0.8;
    shipRef.current.position.x = THREE.MathUtils.lerp(
      shipRef.current.position.x,
      targetPos[0],
      lerpFactor
    );
    shipRef.current.position.z = THREE.MathUtils.lerp(
      shipRef.current.position.z,
      targetPos[2],
      lerpFactor
    );

    // Gentle bobbing — amplitude 0.15, frequency 0.8
    const bobPhase = shipRef.current.position.z * 0.1;
    shipRef.current.position.y =
      Math.sin(state.clock.elapsedTime * 0.8 + bobPhase) * 0.15;

    // Smooth rotation lerp — delta * 1.0 for slower, more realistic turning
    const currentQuat = shipRef.current.quaternion;
    const targetQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, targetHeading, 0)
    );
    currentQuat.slerp(targetQuat, delta * 1.0);
  });

  // Hull colors: operating = dark maroon, docked/arriving = dark navy
  const hullColor = ship.status === 'operating' ? '#5c1a1a' : '#1a2d5c';
  const deckColor = '#374151';

  return (
    <group
      ref={shipRef}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      scale={[0.6, 0.6, 0.6]}
    >
      {/* Hull (Main Body) */}
      <mesh position={[0, 3, 0]} castShadow receiveShadow>
        <boxGeometry args={[16, 6, 60]} />
        <meshStandardMaterial
          color={hullColor}
          metalness={0.6}
          roughness={0.4}
        />
      </mesh>

      {/* Bow (Front Curve) */}
      <mesh
        position={[0, 3, 34]}
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[0.1, 8, 6, 32]} />
        <meshStandardMaterial
          color={hullColor}
          metalness={0.6}
          roughness={0.4}
        />
      </mesh>

      {/* Main Deck */}
      <mesh position={[0, 6.1, 0]} receiveShadow>
        <boxGeometry args={[15.8, 0.2, 58]} />
        <meshStandardMaterial color={deckColor} roughness={0.8} />
      </mesh>

      {/* Bridge Superstructure (Back) */}
      <group position={[0, 6.2, -22]}>
        {/* Lower bridge block */}
        <mesh castShadow>
          <boxGeometry args={[14, 4, 10]} />
          <meshStandardMaterial
            color="#f3f4f6"
            roughness={0.3}
            metalness={0.1}
          />
        </mesh>
        {/* Upper bridge block */}
        <mesh position={[0, 4, 0]} castShadow>
          <boxGeometry args={[10, 3, 8]} />
          <meshStandardMaterial color="#f3f4f6" />
        </mesh>
        {/* Bridge Windows */}
        <mesh position={[0, 4.5, 4.1]}>
          <boxGeometry args={[9, 1.5, 0.1]} />
          <meshStandardMaterial
            color="#111827"
            metalness={0.9}
            roughness={0.1}
          />
        </mesh>
        {/* Funnel / Exhaust Stack */}
        <mesh position={[0, 7, -2]} castShadow>
          <cylinderGeometry args={[0.3, 0.5, 6]} />
          <meshStandardMaterial color="#9ca3af" />
        </mesh>
      </group>

      {/* Piping Manifolds (Middle) */}
      <group position={[0, 6.2, 5]}>
        {Array.from({ length: 6 }).map((_, i) => (
          <group key={i} position={[0, 0, (i - 2.5) * 4]}>
            {/* Port side pipe */}
            <mesh
              position={[-4, 1, 0]}
              rotation={[0, 0, Math.PI / 2]}
              castShadow
            >
              <cylinderGeometry args={[0.4, 0.4, 6]} />
              <meshStandardMaterial color="#9ca3af" metalness={0.7} />
            </mesh>
            {/* Starboard side pipe */}
            <mesh
              position={[4, 1, 0]}
              rotation={[0, 0, Math.PI / 2]}
              castShadow
            >
              <cylinderGeometry args={[0.4, 0.4, 6]} />
              <meshStandardMaterial color="#9ca3af" metalness={0.7} />
            </mesh>
            {/* Manifold valve box */}
            <mesh position={[0, 1.5, 0]} castShadow>
              <boxGeometry args={[2, 2, 2]} />
              <meshStandardMaterial color="#fbbf24" />
            </mesh>
          </group>
        ))}
      </group>

      {/* Helipad (Front) */}
      <mesh
        position={[0, 6.2, 22]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <circleGeometry args={[4, 32]} />
        <meshStandardMaterial color="#10b981" />
      </mesh>
      {/* Helipad ring marking */}
      <mesh position={[0, 6.21, 22]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3, 3.2, 32]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </group>
  );
}

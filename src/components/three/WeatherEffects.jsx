import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import useSensorStore from '../../stores/useSensorStore';

export default function WeatherEffects() {
  const weather = useSensorStore(state => state.weather);
  const rainRef = useRef();
  const particleCount = 10000;

  // Generate rain particles
  const [positions, velocities] = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    const vel = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 400; // x
      pos[i * 3 + 1] = Math.random() * 200;     // y
      pos[i * 3 + 2] = (Math.random() - 0.5) * 400; // z
      vel[i] = 1 + Math.random() * 2; // fall speed
    }
    return [pos, vel];
  }, [particleCount]);

  useFrame((state, delta) => {
    if (!rainRef.current || !weather) return;

    // Visibility controls rain intensity (lower visibility = more rain)
    // Wind speed controls rain angle
    const windSpeed = weather.wind_speed || 0;
    const visibility = weather.visibility || 10;
    const isRaining = visibility < 5;

    rainRef.current.visible = isRaining;

    if (isRaining) {
      const positionsAttr = rainRef.current.geometry.attributes.position;
      for (let i = 0; i < particleCount; i++) {
        // Fall down
        positionsAttr.array[i * 3 + 1] -= velocities[i] * delta * 50;
        // Wind drift
        positionsAttr.array[i * 3] += windSpeed * delta * 2;

        // Reset if below ground
        if (positionsAttr.array[i * 3 + 1] < 0) {
          positionsAttr.array[i * 3] = (Math.random() - 0.5) * 400 - (windSpeed * 2);
          positionsAttr.array[i * 3 + 1] = 200;
        }
      }
      positionsAttr.needsUpdate = true;
    }
  });

  return (
    <points ref={rainRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particleCount}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#a0aec0"
        size={0.5}
        transparent
        opacity={0.6}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sky, Environment } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, Noise } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { Suspense } from 'react';
import Port from './Port';
import Water from './Water';
import WeatherEffects from './WeatherEffects';
import useSensorStore from '../../stores/useSensorStore';

function SimulationEnvironment() {
  const timestamp = useSensorStore((s) => s.timestamp);
  const predictionOffset = useSensorStore((s) => s.predictionOffset);

  let hour = timestamp
    ? new Date(timestamp).getHours() + new Date(timestamp).getMinutes() / 60
    : 12;
  hour = (hour + predictionOffset / 60) % 24;
  if (hour < 0) hour += 24;

  const sunAngle = ((hour - 6) / 12) * Math.PI;
  const sunX = Math.cos(sunAngle) * 1000;
  const sunY = Math.sin(sunAngle) * 1000;

  const isNight = hour < 6 || hour > 18;
  const ambientIntensity = isNight ? 0.15 : 0.5;
  const sunIntensity = isNight ? 0 : Math.max(Math.sin(sunAngle), 0) * 1.8;

  return (
    <>
      <color attach="background" args={['#0a1628']} />
      <fog attach="fog" args={['#0a1628', 200, 1200]} />

      <ambientLight intensity={ambientIntensity} color="#b0c4de" />
      <hemisphereLight
        skyColor="#4a7aad"
        groundColor="#1a2a3a"
        intensity={isNight ? 0.1 : 0.35}
      />

      {!isNight && (
        <directionalLight
          position={[sunX, sunY, -500]}
          intensity={sunIntensity}
          color="#fff5e6"
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
      )}
      {isNight && (
        <directionalLight
          position={[-500, 400, 500]}
          intensity={0.35}
          color="#38bdf8"
        />
      )}

      <Sky
        distance={450000}
        sunPosition={[sunX, sunY, -500]}
        inclination={0}
        azimuth={0.25}
        rayleigh={isNight ? 0 : 1.5}
        turbidity={isNight ? 0 : 6}
      />
      <Environment preset={isNight ? 'night' : 'city'} />

      <Water />
      <Port />
      <WeatherEffects />

      <EffectComposer disableNormalPass>
        <Bloom luminanceThreshold={0.55} mipmapBlur intensity={0.8} />
        <Noise opacity={0.04} blendFunction={BlendFunction.OVERLAY} />
        <Vignette eskil={false} offset={0.15} darkness={0.9} />
      </EffectComposer>

      <OrbitControls
        makeDefault
        target={[50, 0, 50]}
        minPolarAngle={Math.PI / 8}
        maxPolarAngle={Math.PI / 2 - 0.05}
        minDistance={30}
        maxDistance={800}
        enableDamping
        dampingFactor={0.08}
      />
    </>
  );
}

export default function Scene() {
  return (
    <Canvas
      camera={{ position: [-100, 120, 200], fov: 50 }}
      style={{ background: '#0a1628' }}
      shadows
      gl={{
        powerPreference: 'high-performance',
        antialias: true,
        alpha: false,
      }}
      dpr={[1, 1.5]}
      onCreated={(state) => {
        state.gl.setClearColor('#0a1628');
      }}
    >
      <Suspense fallback={null}>
        <SimulationEnvironment />
      </Suspense>
    </Canvas>
  );
}

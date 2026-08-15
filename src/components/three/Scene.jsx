import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sky, Environment } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, Noise } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { Suspense } from 'react';
import Port from './Port';
import Water from './Water';
import useSensorStore from '../../stores/useSensorStore';

// WeatherEffects(비 입자 10,000개)는 걷어냈다. store.weather 를 읽는데 그 값을
// 채우는 경로가 없어 useFrame 이 즉시 return 했고, 읽는 필드명(wind_speed·visibility)도
// 실제 계약(wind_speed_ms·visibility_m)과 달라 연결해도 동작하지 않았다.
// 파티클만 만들어 놓고 한 번도 렌더하지 않는 순수 비용이었다.

function SimulationEnvironment() {
  const predictionOffset = useSensorStore((s) => s.predictionOffset);

  // 기준 시각은 현재 시각이다.
  //
  // 예전엔 store.timestamp 를 읽었는데 그 값을 채우는 코드가 없어(WebSocket 경로
  // 잔해) 항상 폴백인 정오로 고정됐다. 밤 10시에도 부두는 한낮이었고, 같은 화면의
  // CCTV 패널은 실제 시각으로 야간·IR 을 그려서 둘이 어긋났다.
  const now = new Date();
  let hour = now.getHours() + now.getMinutes() / 60;
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
      <fog attach="fog" args={['#0a1628', 500, 1800]} />

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

      <EffectComposer disableNormalPass>
        <Bloom luminanceThreshold={0.55} mipmapBlur intensity={0.8} />
        <Noise opacity={0.04} blendFunction={BlendFunction.OVERLAY} />
        <Vignette eskil={false} offset={0.15} darkness={0.9} />
      </EffectComposer>

      <OrbitControls
        makeDefault
        target={[0, 0, 0]}
        minPolarAngle={Math.PI / 8}
        maxPolarAngle={Math.PI / 2 - 0.05}
        minDistance={30}
        maxDistance={1100}
        enableDamping
        dampingFactor={0.08}
      />
    </>
  );
}

export default function Scene() {
  return (
    <Canvas
      camera={{ position: [330, 230, -250], fov: 50 }}
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

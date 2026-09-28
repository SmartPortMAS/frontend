import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Sky } from '@react-three/drei';
import BerthFocus from './BerthFocus';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { Suspense, useRef } from 'react';

// [2026-09-29] 가벼운 모드 — 느린 PC 에서 3D 가 버벅인다(동안·현우). 처음 3초의 프레임을 재서 30 아래면
// 그림자(장면에서 가장 비싼 패스)를 끄고 해상도를 1배로 내린다. 결과·자료는 그대로고 그림만 단순해진다.
// ?lite=1 로 강제, ?lite=0 으로 끔. 켜지면 화면 왼쪽 아래에 "가벼운 모드" 칩이 뜬다.
function PerfProbe() {
  const setTwinLite = useSensorStore((s) => s.setTwinLite);
  const lite = useSensorStore((s) => s.twinLite);
  const setDpr = useThree((s) => s.setDpr);
  const frames = useRef(0);
  const start = useRef(null);
  const done = useRef(false);
  // 처음 5초는 재지 않는다 — 셰이더 컴파일·자료 적재로 좋은 PC 도 느리다(실측: GPU PC 가 가벼운 모드로 빠졌다).
  const WARMUP = 5;
  const WINDOW = 3;
  useFrame((state) => {
    if (done.current) return;
    if (start.current === null) { start.current = state.clock.elapsedTime; return; }
    const dt = state.clock.elapsedTime - start.current;
    if (dt < WARMUP) return;
    frames.current += 1;
    if (dt >= WARMUP + WINDOW) {
      done.current = true;
      const fps = frames.current / (dt - WARMUP);
      if (fps < 30 && !lite) { setTwinLite(true); setDpr(1); }
    }
  });
  return null;
}
const LITE_PARAM = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('lite') : null;
import Port from './Port';
import Water from './Water';
import useSensorStore from '../../stores/useSensorStore';

// WeatherEffects(비 입자 10,000개)는 걷어냈다. store.weather 를 읽는데 그 값을
// 채우는 경로가 없어 useFrame 이 즉시 return 했고, 읽는 필드명(wind_speed·visibility)도
// 실제 계약(wind_speed_ms·visibility_m)과 달라 연결해도 동작하지 않았다.
// 파티클만 만들어 놓고 한 번도 렌더하지 않는 순수 비용이었다.

function SimulationEnvironment({ focusBerth, focusRings = true }) {
  const predictionOffset = useSensorStore((s) => s.predictionOffset);
  const lite = useSensorStore((s) => s.twinLite);

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
  // [2026-09-28] 밤 최저 밝기를 올렸다 — 18시 뒤 장면이 거의 검어 고장처럼 보였다(현우 D13)
  // 가벼운 모드는 그림자가 없어 어두운 면이 안 생기므로 환경광을 조금 올린다
  const ambientIntensity = (isNight ? 0.42 : 0.5) + (lite ? 0.15 : 0);
  const sunIntensity = isNight ? 0 : Math.max(Math.sin(sunAngle), 0) * 1.8;

  return (
    <>
      <color attach="background" args={['#0a1628']} />
      <fog attach="fog" args={['#0a1628', 500, 1800]} />

      <ambientLight intensity={ambientIntensity} color="#b0c4de" />
      <hemisphereLight
        skyColor="#4a7aad"
        groundColor="#1a2a3a"
        intensity={isNight ? 0.3 : 0.35}
      />

      {!isNight && (
        <directionalLight
          position={[sunX, sunY, -500]}
          intensity={sunIntensity}
          color="#fff5e6"
          castShadow={!lite}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
      )}
      {isNight && (
        <directionalLight
          position={[-500, 400, 500]}
          intensity={0.7}
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
      {/* drei <Environment preset> 은 쓰지 않는다 — 프리셋 HDR 을 GitHub 에서
          실시간으로 내려받는데, 2026-08-17 에 GitHub 가 429 를 돌려주자 이
          컴포넌트가 죽으면서 /twin 전체가 빈 화면이 됐다. 반사광 질감을 조금
          더할 뿐인 장식이 화면 생존을 외부 CDN 에 걸어둘 이유가 없다.
          조명은 위의 태양·반구광·Sky 가 이미 전부 담당한다. */}

      <Water />
      <Port />
      <BerthFocus berthName={focusBerth} showRings={focusRings} />

      {/* [2026-09-29] 후처리는 매 프레임 화면 전체를 다시 그려 느린 PC 에서 가장 큰 비용이었다(동안·현우 체감).
          장식이라 기본은 끄고, 촬영 때만 ?fx=1 로 켠다. */}
      {LITE_PARAM !== '0' && <PerfProbe />}
      {FX_ON && !lite && (
        <EffectComposer disableNormalPass>
          <Bloom luminanceThreshold={0.55} mipmapBlur intensity={0.8} />
          <Vignette eskil={false} offset={0.15} darkness={0.9} />
        </EffectComposer>
      )}

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

const FX_ON = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('fx') === '1';

export default function Scene({ focusBerth, focusRings = true }) {
  const lite = useSensorStore((s) => s.twinLite);
  return (
    <Canvas
      key={lite ? 'lite' : 'full'}
      camera={{ position: [330, 230, -250], fov: 50 }}
      style={{ background: '#0a1628' }}
      shadows={!lite}
      gl={{
        powerPreference: 'high-performance',
        antialias: !lite,
        alpha: false,
      }}
      dpr={lite ? 1 : [1, 1.25]}
      onCreated={(state) => {
        state.gl.setClearColor('#0a1628');
      }}
    >
      <Suspense fallback={null}>
        <SimulationEnvironment focusBerth={focusBerth} focusRings={focusRings} />
      </Suspense>
    </Canvas>
  );
}

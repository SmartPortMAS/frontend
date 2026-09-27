import useSensorStore from '../stores/useSensorStore';
import HardwarePanel from '../components/sensor/HardwarePanel';
import { TankModel, PipeModel } from '../components/sensor/EquipmentModels';
import { COLORS } from '../utils/constants';
import HelpTip from '../components/common/HelpTip';
import { } from 'react-icons/fa';

// ─────────────────────────────────────────────────────────────────────────────
// 센서 데이터 — 현장 설비 계측
//
// 이 화면만 실데이터가 아니다. 그 사실을 화면이 직접 말해야 한다.
//
// 예전에는 "IoT 센서 네트워크에서 수집되는 실시간 데이터"라고 적고 우상단에 빨간
// "WebSocket Disconnected" 를 띄우고 있었다. 둘 다 사실과 달랐다 —
//   · 수집하는 IoT 센서가 없다(탱크 수위계·유량계·압력계는 8/3 회의에서 실물 보류).
//   · 끊긴 게 아니라 애초에 연결을 시도하는 코드가 어디에도 마운트돼 있지 않았다.
//     (useWebSocket 훅은 존재했지만 어느 컴포넌트도 부르지 않았다. WS_URL 도 8000을
//      보고 있었는데 백엔드는 8001이고 /ws 엔드포인트 자체가 없다.)
//
// 그래서 "고장난 실시간"처럼 보였다. 지금은 시뮬레이션이라고 밝히고, 무엇이 있으면
// 실데이터가 되는지까지 적는다. 값이 멈춰 있는 것도 정상 동작이라고 말해 둔다.
// ─────────────────────────────────────────────────────────────────────────────

export default function SensorPage() {
  const { tanks, pipes } = useSensorStore();

  return (
    <div className="page-content" style={{ padding: '0' }}>
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '20px', marginBottom: '6px', display: 'flex', alignItems: 'center' }}>
            현장 설비
            <HelpTip title="현장 설비">
              하역 개시 인터락 게이트는 실물(라즈베리파이·밸브)과 연결됩니다. 탱크·배관 계측값은 아직 계측기가 없어
              예시값이며, 터미널 유량계·탱크 레벨 계측이 연결될 자리입니다.
            </HelpTip>
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
            게이트 <strong>실물</strong> · 탱크·배관 <strong>예시값</strong>
          </p>
        </div>
        {/* '시뮬레이션 모드' 배지도 내렸다(2026-08-23) — 시연 UI 는 도입 후 제품
            모습을 보여준다는 원칙. 이 탭의 값이 하드웨어 부재로 모형이라는 사실은
            설계서·보고서 한계점 절에 명시한다. */}
      </div>

      {/* "실측 아님" 장문 안내는 내렸다(2026-08-21 피드백) — 데이터 계보는
          설계문서 몫. 단 이 탭만은 값 자체가 모형이라, 실측으로 오인하지 않을
          최소 표식(상단 배지 + 툴팁)은 남긴다. 나머지 화면이 전부 실데이터라는
          주장 자체를 지키기 위한 표식이다. */}

      <HardwarePanel />

      <h3 style={{ fontSize: '16px', margin: '32px 0 16px', color: 'var(--teal)' }}>
        탱크 센서 — 저장탱크 수위·온도·압력
        <span style={{ fontSize: '12px', fontWeight: 400, color: COLORS.textDim, marginLeft: '8px' }}>
          (데모 값 · 고정)
        </span>
      </h3>
      <div className="sensor-grid">
        {tanks.map((tank) => (
          <TankModel key={tank.id} tank={tank} />
        ))}
      </div>

      <h3 style={{ fontSize: '16px', margin: '32px 0 16px', color: 'var(--teal)' }}>
        배관 센서 — 이송 라인 유량·압력
        <span style={{ fontSize: '12px', fontWeight: 400, color: COLORS.textDim, marginLeft: '8px' }}>
          (데모 값 · 고정)
        </span>
      </h3>
      <div className="sensor-grid">
        {pipes.map((pipe) => (
          <PipeModel key={pipe.id} pipe={pipe} />
        ))}
      </div>
    </div>
  );
}

import { useState } from 'react';
import SafetyGraph from '../components/safety/SafetyGraph';
import SafetyGatesPanel from '../components/safety/SafetyGatesPanel';
import ActiveRiskPanel from '../components/safety/ActiveRiskPanel';
import VesselDetailPanel from '../components/dashboard/VesselDetailPanel';

// 안전/환경 관제 화면의 사용 흐름:
//   ① 오른쪽에서 지금 위험 판정된 선석을 본다 (실경고, 규칙엔진 판정)
//   ② 선석을 누른다 → 왼쪽 심사 폼이 그 선석의 재항 화물로 채워진다
//   ③ 안전 심사 실행 → 혼재금지·IMDG 격리·포장등급 판정과 근거를 본다
//   ④ 아래 다차원 안전 지수로 항만 전체 상태를 확인한다
// [2026-09-28] 다차원 안전 평가 지수는 관제 흐름의 단계가 아니라 항만 전체 요약이라 접어 둔다.
// 펼칠 때만 불러온다 — 첫 계산이 길다(배포 서버 첫 호출 70초대).
function IndexFold() {
  const [open, setOpen] = useState(false);
  if (open) return <SafetyGraph />;
  return (
    <button
      type="button" onClick={() => setOpen(true)}
      className="glass-card"
      style={{ textAlign: 'left', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: 'var(--teal)', fontFamily: 'inherit' }}
    >
      다차원 안전 평가 지수 펼치기
      <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>항만 전체 요약 · 처음 여는 데 시간이 걸립니다</span>
    </button>
  );
}

export default function SafetyPage() {
  return (
    <div className="safety-layout">
      <div className="safety-graph-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <SafetyGatesPanel />
        <SafetyGraph />
      </div>

      <div className="safety-panel">
        <ActiveRiskPanel />
      </div>

      {/* 위험 선석 카드의 선박 버튼이 여는 패널. 이게 없으면 버튼을 눌러도
          selectedVessel 만 바뀌고 화면에는 아무 일도 일어나지 않는다. */}
      <VesselDetailPanel />
    </div>
  );
}

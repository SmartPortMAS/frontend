import { useEffect, useState } from 'react';
import { ResponsiveContainer, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip } from 'recharts';
import { BACKEND_BASE } from '../../api/backendAdapter';

// 이 6축은 원래 탱크 압력·배관 유속·가스 농도·온도 제어·작업자 안전이었고 값이
// 코드에 박혀 있었다. 전부 현장 센서가 있어야 나오는 값인데 우리는 그 센서를
// 수집하지 않는다. 지금은 백엔드가 실제 데이터로 계산한 축을 그대로 받아 그린다
// (backend app/agents/safety/safety_index.py — 축을 고른 이유가 거기 적혀 있다).

const POLL_MS = 60_000;

export default function SafetyGraph() {
  const [index, setIndex] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`${BACKEND_BASE}/dashboard/safety-index`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (alive) { setIndex(json); setError(null); }
      } catch (e) {
        if (alive) setError(e.message);
      }
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  const axes = index?.axes ?? [];
  // 판정 불가 축(재료 없음)은 0으로 그리면 "최악"으로 보인다 — 차트에서 빼고
  // 아래에 이름을 따로 밝힌다.
  const chartData = axes
    .filter((a) => a.score !== null)
    .map((a) => ({ subject: a.subject, A: a.score, fullMark: 100 }));

  return (
    <div style={{ width: '100%', height: '100%', padding: '20px', display: 'flex', flexDirection: 'column' }}>
      <h3 style={{ fontSize: '18px', color: 'var(--teal)', marginBottom: '8px' }}>
        다차원 안전 평가 지수
        {index?.overall != null && (
          <span style={{ marginLeft: '12px', fontSize: '15px', color: 'var(--text-primary)' }}>
            종합 {index.overall}
          </span>
        )}
      </h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '24px' }}>
        수집 중인 실데이터로 계산한 6개 축입니다. 각 축의 근거는 아래에 함께 표시됩니다.
      </p>

      <div style={{ flex: 1, minHeight: '300px' }}>
        {error && (
          <div style={{ color: 'var(--text-dim)', fontSize: '13px' }}>
            안전 지수를 불러오지 못했습니다 ({error}) — 백엔드 연결을 확인하세요.
          </div>
        )}
        {!error && chartData.length === 0 && (
          <div style={{ color: 'var(--text-dim)', fontSize: '13px' }}>불러오는 중…</div>
        )}
        {chartData.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="75%" data={chartData}>
              <PolarGrid stroke="rgba(78, 205, 196, 0.2)" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--text-primary)', fontSize: 12 }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: 'var(--text-dim)', fontSize: 10 }} />
              <Tooltip
                contentStyle={{ backgroundColor: 'rgba(13, 27, 42, 0.9)', border: '1px solid rgba(78, 205, 196, 0.2)', borderRadius: '8px' }}
                itemStyle={{ color: '#00d4aa' }}
              />
              <Radar name="안전 지수" dataKey="A" stroke="#00d4aa" fill="#00d4aa" fillOpacity={0.4} />
            </RadarChart>
          </ResponsiveContainer>
        )}
      </div>

      {axes.length > 0 && (
        <div className="safety-rationale" style={{ marginTop: '24px' }}>
          <strong>축별 근거</strong>
          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {axes.map((a) => (
              <div key={a.subject} style={{ fontSize: '12.5px', lineHeight: 1.5 }}>
                <span style={{ color: 'var(--teal)', fontWeight: 700 }}>
                  {a.subject} {a.score === null ? '판정불가' : a.score}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}> — {a.basis}</span>
              </div>
            ))}
          </div>
          {index?.unavailable_axes?.length > 0 && (
            <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-dim)' }}>
              ※ {index.unavailable_axes.join(', ')} 은(는) 계산 재료가 없어 차트와 종합 점수에서 제외했습니다
              (0점이 아니라 &ldquo;모름&rdquo;입니다).
            </div>
          )}
        </div>
      )}
    </div>
  );
}

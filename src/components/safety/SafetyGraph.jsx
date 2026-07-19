import { ResponsiveContainer, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip } from 'recharts';

export default function SafetyGraph() {
  // 샘플 데이터
  const data = [
    { subject: '탱크 압력', A: 90, fullMark: 100 },
    { subject: '배관 유속', A: 85, fullMark: 100 },
    { subject: '가스 농도', A: 95, fullMark: 100 },
    { subject: '온도 제어', A: 88, fullMark: 100 },
    { subject: '접안 안전', A: 92, fullMark: 100 },
    { subject: '작업자 안전', A: 98, fullMark: 100 },
  ];

  return (
    <div style={{ width: '100%', height: '100%', padding: '20px', display: 'flex', flexDirection: 'column' }}>
      <h3 style={{ fontSize: '18px', color: 'var(--teal)', marginBottom: '8px' }}>다차원 안전 평가 지수</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '24px' }}>
        항만 내 주요 6개 지표에 대한 실시간 종합 안전도 평가 결과입니다.
      </p>
      
      <div style={{ flex: 1, minHeight: '300px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data}>
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
      </div>

      <div className="safety-rationale" style={{ marginTop: '24px' }}>
        <strong>AI 에이전트 종합 의견:</strong><br/>
        현재 모든 탱크와 배관의 압력 및 온도 지표가 정상 범위를 유지하고 있습니다. 배관 유속(A: 85)은 약간의 변동성이 있으나 안전 임계치 이내입니다. 가스 농도 및 작업자 안전 지표는 매우 우수합니다. 특이사항 없습니다.
      </div>
    </div>
  );
}

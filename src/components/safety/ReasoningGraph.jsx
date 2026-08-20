import { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaSearchPlus } from 'react-icons/fa';
import { COLORS } from '../../utils/constants';
import { onsanAdjacencyDistanceM } from '../../utils/geoUtils';

const normalize = (s) => (s || '').replace(/\s+/g, '');

// 인접 화물쌍(선석+화물) 하나에 대해, MSDS(INCOMPATIBLE_WITH)·IMDG(SEGREGATE) 두
// 그래프 신호를 한 그림에서 같이 보여준다. 새 데이터를 계산하지 않는다 —
// useOnsanApi.mapSafety() 가 백엔드 conflicts[]/imdg_conflicts[] 원본 필드를
// gate.detail.msds/detail.imdg 에 그대로 옮겨 둔 것만 그리므로, 이 그림의 근거는
// 항상 옆에 있는 reason 문장과 같다.
//
// 레이아웃: 선석(ADJACENT_TO/동일 선석) → 화물(재항 중) → [MSDS 신호 행 → IMDG
// 신호 행](둘 다 조회됐으면 순서대로 이어그림 — 실제로는 서로 독립 조회지만, 같은
// 화물에 대해 두 그래프를 차례로 훑었다는 걸 하나의 추론 흐름으로 보여주기 위함) →
// 최종 판정. 각 신호 행은 세 상태 중 하나로 그린다: 충돌(빨강, 좌우 두 분류 박스 +
// 점선) / 관계없음 확정(초록, IMDG는 두 화물의 실제 Class를 좌우 박스로, MSDS는
// 화물별 분류를 몰라 가운데 박스 하나로) / 판정 근거 부족(호박, 가운데 박스 하나 —
// 그래프에 필요한 정보 자체가 없어 "안전"이라 단정하지 않는 상태). 인화점 같은
// MSDS 물성 수치는 프론트가 갖고 있지 않아 그리지 않는다 — 없는 자릿수를 지어내면
// 오히려 신뢰를 깎는다.
export default function ReasoningGraph({ targetBerth, targetCargo, gate }) {
  const uid = useId();
  const [zoomed, setZoomed] = useState(false);
  const d = gate.detail;
  if (!d) return null;

  const sameBerth = normalize(targetBerth) === normalize(d.adjacentBerth);
  const distanceM = !sameBerth ? onsanAdjacencyDistanceM(targetBerth, d.adjacentBerth) : null;
  const hasAdjacencyEdge = !sameBerth && distanceM != null;
  const berthEdgeLabel = sameBerth
    ? '동일 선석'
    : hasAdjacencyEdge
      ? (distanceM > 0 ? `ADJACENT_TO · 실측 ${distanceM}m` : 'ADJACENT_TO · 동일 부두군')
      : '근접 작업 중';
  const berthEdgeColor = sameBerth || !hasAdjacencyEdge ? COLORS.textDim : COLORS.yellow;

  // 조회된 신호만 행으로 그린다 — MSDS/IMDG 둘 다 조회됐으면 두 행, 하나만
  // 알고 있으면(예: 예전 응답 형태) 한 행만 그린다.
  //
  // 신호마다 상태가 셋이다:
  //   'hit'    — 충돌 확인(빨강, 좌우 두 박스 + 점선)
  //   'safe'   — 조회했고 관계 없음이 확정됨(초록, MSDS는 박스 하나로 뭉뚱그림 —
  //              화물별 개별 분류를 프론트가 모름. IMDG는 화물마다 자기 Class가
  //              둘 다 확인됐으므로 좌우 두 박스로 실제 값을 보여줌)
  //   'unknown'— 조회는 했지만 판정 근거가 부족(호박, 박스 하나) — IMDG는 두
  //              화물 중 하나라도 그래프에 Class 자체가 없으면 "관계 없음"이
  //              공인 규정상 X인지 이 Class 조합이 안 실린 건지 구분이 안 되므로,
  //              안전하다고 단정하지 않고 이 상태로 따로 보여준다
  //              (imdg_segregation_loader.py가 9x9 전체가 아니라 실제 등재된
  //              화물의 Class만 SEGREGATE로 적재하기 때문에 생기는 간극).
  const tiers = [];
  if (d.msds) {
    const status = d.msds.hit ? 'hit' : 'safe';
    tiers.push({
      kind: 'msds', status, label: 'MSDS 반응성', classifyEdgeLabel: 'MSDS 조회',
      layout: status === 'hit' ? 'two' : 'one',
      crossLabel: status === 'hit' ? `${d.msds.category} 충돌` : 'INCOMPATIBLE_WITH 관계 없음',
      target: status === 'hit' ? d.msds.category : null,
      adjacent: status === 'hit' ? d.msds.category : null,
      centerValue: 'INCOMPATIBLE_WITH 관계 없음',
    });
  }
  if (d.imdg) {
    const status = d.imdg.hit ? 'hit' : d.imdg.confirmedNoRequirement ? 'safe' : 'unknown';
    tiers.push({
      kind: 'imdg', status, label: 'IMDG 등급', classifyEdgeLabel: 'IMDG 매핑',
      layout: status === 'unknown' ? 'one' : 'two',
      crossLabel: status === 'hit' ? `격리코드 ${d.imdg.segregationCode}`
        : status === 'safe' ? 'SEGREGATE 관계 없음 (공인 X)' : undefined,
      target: status === 'hit' ? (d.imdg.targetClass || '분류 없음') : status === 'safe' ? d.imdg.targetClassKnown : null,
      adjacent: status === 'hit' ? (d.imdg.adjacentClass || '분류 없음') : status === 'safe' ? d.imdg.adjacentClassKnown : null,
      centerValue: '두 화물 중 하나 이상 그래프에 Class 미등재 — 판정 근거 부족',
    });
  }
  const anyHit = tiers.some((t) => t.status === 'hit');
  const anyUnknown = !anyHit && tiers.some((t) => t.status === 'unknown');
  const verdictColor = anyHit ? COLORS.red : anyUnknown ? COLORS.yellow : COLORS.teal;
  const statusColor = { hit: COLORS.red, safe: COLORS.teal, unknown: COLORS.yellow };
  const boxColor = { hit: COLORS.purple, safe: COLORS.teal, unknown: COLORS.yellow };

  // 카드 폭(width:100%, 위 주석 참고)은 그대로 두고 내부 좌표계만 줄인다 —
  // 같은 물리적 너비라도 좌표 단위당 픽셀이 늘어나 텍스트·선이 더 커 보인다
  // ("그래프 이미지 좀 키워줘" 요청, 2026-08-20). 폰트 크기·선 굵기는 그대로
  // 둬서(아래 SCALE 미적용) 상자 대비 글자가 상대적으로 더 커지는 효과도 겸한다.
  const SCALE = 0.8;
  const leftX = 70 * SCALE, rightX = 650 * SCALE, boxW = 200 * SCALE;
  const leftCx = leftX + boxW / 2;
  const rightCx = rightX + boxW / 2;
  const midX = (leftCx + rightCx) / 2;
  const centerBoxW = boxW * 1.4;
  const centerX = midX - centerBoxW / 2;

  const row1Y = 26 * SCALE, row2Y = 126 * SCALE, tierStartY = 226 * SCALE, rowStep = 100 * SCALE, boxH = 48 * SCALE;
  const tierYs = tiers.map((_, i) => tierStartY + i * rowStep);
  const verdictY = tierStartY + tiers.length * rowStep;
  const verdictH = 40 * SCALE;
  const verdictW = 260 * SCALE;
  const viewW = 920 * SCALE;
  const viewH = verdictY + verdictH + 30 * SCALE;

  const textStyle = { fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' };

  const Node = ({ x, y, caption, value, color }) => (
    <g style={textStyle}>
      <rect x={x} y={y} width={boxW} height={boxH} rx="10" fill={COLORS.card} stroke={color} strokeWidth="1.5" />
      <text x={x + 14 * SCALE} y={y + 18 * SCALE} fontSize="9.5" fontWeight="700" letterSpacing="0.4" fill={color}>{caption}</text>
      <text x={x + 14 * SCALE} y={y + 36 * SCALE} fontSize="12" fontWeight="700" fill={COLORS.textPrimary}>{value}</text>
    </g>
  );

  // 신호 행 하나의 상/하단 연결점 — 좌우 두 박스 행(hit/safe-IMDG)은 각각
  // leftCx/rightCx, 박스 하나짜리 행(safe-MSDS/unknown)은 가운데 midX로 수렴시킨다.
  const anchorX = (tier) => (tier.layout === 'two' ? { l: leftCx, r: rightCx } : { l: midX, r: midX });

  const tierSummary = tiers
    .map((t) => `${t.label} ${t.status === 'hit' ? `${t.target} / ${t.adjacent}로 분류되어 ${t.crossLabel}`
      : t.status === 'safe' ? `조회 결과 ${t.crossLabel}` : t.centerValue}`)
    .join(', ');
  const ariaLabel = `${targetBerth}의 ${targetCargo}과(와) ${d.adjacentBerth}의 ${d.adjacentCargoName} — ${tierSummary}. 두 선석은 ${berthEdgeLabel} 관계라 ${gate.rule} ${gate.name} 판정이 나왔다`;

  // idSuffix 로 markerId 를 나눈다 — 인라인용/확대 모달용 두 벌을 같은 페이지에
  // 동시에 그릴 수 있어서, 같은 id 를 두 번 쓰면 marker-end 참조가 꼬인다.
  const Diagram = ({ idSuffix }) => {
    const arrow = `rg-arrow-${uid}${idSuffix}`;
    const arrowRed = `rg-arrow-red-${uid}${idSuffix}`;
    const arrowDim = `rg-arrow-dim-${uid}${idSuffix}`;
    const arrowGreen = `rg-arrow-green-${uid}${idSuffix}`;
    const arrowYellow = `rg-arrow-yellow-${uid}${idSuffix}`;
    return (
      <svg
        viewBox={`0 0 ${viewW} ${viewH}`}
        role="img"
        aria-label={ariaLabel}
        style={{ display: 'block', width: '100%', height: 'auto' }}
      >
        <defs>
          <marker id={arrow} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={COLORS.info} />
          </marker>
          <marker id={arrowRed} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={COLORS.red} />
          </marker>
          <marker id={arrowDim} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={COLORS.textDim} />
          </marker>
          <marker id={arrowGreen} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={COLORS.teal} />
          </marker>
          <marker id={arrowYellow} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={COLORS.yellow} />
          </marker>
        </defs>

        {/* 선석 관계 (ADJACENT_TO / 동일 선석) */}
        <path
          d={`M${leftX + boxW},${row1Y + boxH / 2} L${rightX},${row1Y + boxH / 2}`}
          stroke={berthEdgeColor} strokeWidth="1.8" strokeDasharray={sameBerth ? undefined : '5 5'} fill="none"
        />
        <text x={midX} y={row1Y + boxH / 2 - 16 * SCALE} textAnchor="middle" fontSize="10.5" fontWeight="600" fill={berthEdgeColor} style={textStyle}>
          {berthEdgeLabel}
        </text>

        {/* 선석 → 화물 */}
        <path d={`M${leftCx},${row1Y + boxH} L${leftCx},${row2Y - 8 * SCALE}`} stroke={COLORS.textDim} strokeWidth="1.6" fill="none" markerEnd={`url(#${arrowDim})`} />
        <path d={`M${rightCx},${row1Y + boxH} L${rightCx},${row2Y - 8 * SCALE}`} stroke={COLORS.textDim} strokeWidth="1.6" fill="none" markerEnd={`url(#${arrowDim})`} />
        <text x={leftCx + 34 * SCALE} y={(row1Y + boxH + row2Y) / 2} fontSize="10.5" fontWeight="600" fill={COLORS.textSecondary} style={textStyle}>재항 중</text>
        <text x={rightCx + 34 * SCALE} y={(row1Y + boxH + row2Y) / 2} fontSize="10.5" fontWeight="600" fill={COLORS.textSecondary} style={textStyle}>재항 중</text>

        {/* 노드: 선석·화물 */}
        <Node x={leftX} y={row1Y} caption="선석 · 대상" value={targetBerth} color={COLORS.info} />
        <Node x={rightX} y={row1Y} caption={sameBerth ? '선석 · 동일' : '선석 · 인접'} value={d.adjacentBerth} color={COLORS.info} />
        <Node x={leftX} y={row2Y} caption="화물" value={targetCargo} color={COLORS.navy} />
        <Node x={rightX} y={row2Y} caption="화물" value={d.adjacentCargoName} color={COLORS.navy} />

        {/* 신호 행들 — MSDS 조회 · IMDG 조회를 순서대로 이어그린다 */}
        {tiers.map((tier, i) => {
          const y = tierYs[i];
          const prevAnchor = i === 0 ? { l: leftCx, r: rightCx } : anchorX(tiers[i - 1]);
          const prevBottomY = i === 0 ? row2Y + boxH : tierYs[i - 1] + boxH;
          const cur = anchorX(tier);
          const edgeColor = tier.status === 'hit' ? COLORS.info : statusColor[tier.status];
          const marker = tier.status === 'hit' ? arrow : tier.status === 'safe' ? arrowGreen : arrowYellow;
          return (
            <g key={tier.kind}>
              {/* 이전 행 → 이 신호 행 */}
              <path d={`M${prevAnchor.l},${prevBottomY} L${cur.l},${y - 8 * SCALE}`} stroke={edgeColor} strokeWidth="1.6" fill="none" markerEnd={`url(#${marker})`} />
              <path d={`M${prevAnchor.r},${prevBottomY} L${cur.r},${y - 8 * SCALE}`} stroke={edgeColor} strokeWidth="1.6" fill="none" markerEnd={`url(#${marker})`} />
              <text x={leftCx + 46 * SCALE} y={(prevBottomY + y) / 2} fontSize="10.5" fontWeight="600" fill={edgeColor} style={textStyle}>{tier.classifyEdgeLabel}</text>

              {tier.layout === 'two' ? (
                <>
                  <path
                    d={`M${leftX + boxW},${y + boxH / 2} L${rightX},${y + boxH / 2}`}
                    stroke={statusColor[tier.status]} strokeWidth="2" strokeDasharray={tier.status === 'hit' ? '4 4' : undefined} fill="none"
                  />
                  <text x={midX} y={y + boxH / 2 - 16 * SCALE} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={statusColor[tier.status]} style={textStyle}>{tier.crossLabel}</text>
                  <Node x={leftX} y={y} caption={tier.label} value={tier.target} color={boxColor[tier.status]} />
                  <Node x={rightX} y={y} caption={tier.label} value={tier.adjacent} color={boxColor[tier.status]} />
                </>
              ) : (
                <>
                  <rect x={centerX} y={y} width={centerBoxW} height={boxH} rx="10" fill={COLORS.card} stroke={statusColor[tier.status]} strokeWidth="1.5" />
                  <text x={midX} y={y + 18 * SCALE} textAnchor="middle" fontSize="9.5" fontWeight="700" letterSpacing="0.4" fill={statusColor[tier.status]} style={textStyle}>{tier.label} · 그래프 조회</text>
                  <text x={midX} y={y + 36 * SCALE} textAnchor="middle" fontSize="12" fontWeight="700" fill={COLORS.textPrimary} style={textStyle}>{tier.status === 'safe' ? tier.crossLabel : tier.centerValue}</text>
                </>
              )}
            </g>
          );
        })}

        {/* 마지막 신호 행 → 최종 판정 */}
        <path
          d={`M${midX},${tierYs[tierYs.length - 1] + boxH} L${midX},${verdictY - 8 * SCALE}`}
          stroke={verdictColor} strokeWidth="2" strokeDasharray={verdictColor === COLORS.teal ? undefined : '4 4'} fill="none"
          markerEnd={`url(#${anyHit ? arrowRed : anyUnknown ? arrowYellow : arrowGreen})`}
        />

        {/* 판정 노드 */}
        <rect
          x={midX - verdictW / 2} y={verdictY} width={verdictW} height={verdictH} rx="9"
          fill={anyHit ? 'rgba(196, 50, 46, 0.06)' : anyUnknown ? 'rgba(178, 106, 0, 0.06)' : 'rgba(14, 124, 107, 0.06)'}
          stroke={verdictColor} strokeWidth="1.8"
        />
        <text x={midX} y={verdictY + 17 * SCALE} textAnchor="middle" fontFamily="ui-monospace, Consolas, monospace" fontSize="11.5" fontWeight="700" fill={verdictColor}>
          [{gate.rule}] {gate.name}
        </text>
        <text x={midX} y={verdictY + 31 * SCALE} textAnchor="middle" style={textStyle} fontSize="10" fill={verdictColor}>
          {gate.severity} — 사유는 위 카드 문구와 같음
        </text>
      </svg>
    );
  };

  return (
    <figure style={{ margin: '10px 0 0' }}>
      {/* 카드 폭에 맞춰 그리면 작아서, 고정폭으로 키우는 대신(그리드 레이아웃이
          밀려나는 부작용이 있었다) 클릭하면 커지는 모달로 뺀다 — 레이아웃 트리
          밖(document.body)에 그리므로 페이지 폭에 영향을 줄 일이 없다. */}
      <div style={{ position: 'relative' }}>
        <Diagram idSuffix="" />
        <button
          type="button"
          onClick={() => setZoomed(true)}
          title="크게 보기"
          aria-label="추론 그래프 크게 보기"
          style={{
            position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: '50%',
            border: `1px solid ${COLORS.border}`, background: COLORS.card, color: COLORS.textSecondary,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-in', padding: 0,
          }}
        >
          <FaSearchPlus size={10} />
        </button>
      </div>
      <figcaption style={{ marginTop: '8px', fontSize: '11.5px', color: COLORS.textDim, lineHeight: 1.5 }}>
        Neo4j 지식그래프 조회 결과입니다 — 옆의 사유 문장과 같은 근거를 관계로 풀어 보여줍니다.
      </figcaption>

      {zoomed && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${gate.rule} 추론 그래프 크게 보기`}
          onClick={() => setZoomed(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(18, 53, 79, 0.55)', zIndex: 3000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative', background: COLORS.card, borderRadius: '16px', padding: '28px 32px 20px',
              width: '100%', maxWidth: 'min(1100px, 92vw)', boxShadow: '0 24px 64px rgba(18, 53, 79, 0.35)',
            }}
          >
            <button
              type="button"
              onClick={() => setZoomed(false)}
              aria-label="닫기"
              style={{
                position: 'absolute', top: 14, right: 14, background: 'none', border: 'none',
                fontSize: '18px', color: COLORS.textDim, cursor: 'pointer', lineHeight: 1, padding: 4,
              }}
            >
              ✕
            </button>
            <div style={{ fontSize: '13px', fontWeight: 700, color: COLORS.textPrimary, marginBottom: '14px' }}>
              [{gate.rule}] {gate.name} — 추론 그래프
            </div>
            <Diagram idSuffix="-zoom" />
            <div style={{ marginTop: '12px', fontSize: '12px', color: COLORS.textDim }}>{gate.reason}</div>
          </div>
        </div>,
        document.body
      )}
    </figure>
  );
}

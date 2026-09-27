import { useEffect, useMemo, useRef, useState } from 'react';
import { FaPlay, FaPause, FaTimes, FaFastForward, FaUndo } from 'react-icons/fa';
import { fetchTwinOutlook } from '../../../api/backendAdapter';
import useSensorStore from '../../../stores/useSensorStore';
import HelpTip from '../../common/HelpTip';

// ─────────────────────────────────────────────────────────────────────────────
// 앞으로 72시간 — 3D 관제 화면 안의 판정 흐름 (2026-09-27)
//
// 백엔드 /twin/outlook 이 지목한 선석의 "지금 판정"과 "앞으로 72시간"을 한 시각씩 판정해 준다
// (기상청 단기예보 + 국립해양조사원 조석예보, 판정 규칙은 관제 화면과 같다).
//
// 예전엔 이 응답을 Omniverse 정보판이 그렸다. 그런데 Omniverse 장면(흰 상자 모형)과 이 3D 관제
// 화면(온산항 배치)이 달라 "같은 선석"으로 이어지지 않았고, GPU 발열로 시연 PC 가 꺼졌다
// (9/27 현우). 같은 장면 안에서 시간축을 움직이면 그 선석의 색·라벨이 그 시각의 판정으로
// 바뀌므로(Port.jsx outlookPreview) 변화가 눈에 보이고, Kit 없이 돈다.
//
// 재현하지 않는 것: 선박 이동·하역 진행 — 유량계·소요시간 모델이 없어 근거가 없다.
// ─────────────────────────────────────────────────────────────────────────────

// 판정 등급 색 — 어두운 3D 바탕용. 관제 화면 LEVEL_STYLE 과 뜻은 같고 밝기만 다르다.
export const LEVEL_COLOR = {
  적합: '#10b981', 주의: '#f59e0b', 부적합: '#ef4444', 확인요청: '#a78bfa', 판정불가: '#a78bfa',
};
const GATE_TEXT = {
  OPEN: '게이트 열림 가능', CAUTION: '게이트 주의 — 개시 전 확인', LOCKED: '게이트 닫힘 (하역 개시 거부)',
};
const STEP_MS = 320;          // 한 시각 머무는 시간 — 72시간 약 23초
const FIRST_HOLD_MS = 900;    // "지금" 화면을 먼저 보여 주는 시간
const ZONE_KR = { ANCHORAGE: '정박지 대기', UNDERWAY: '항해 중', STOPPED: '선석 밖 정지' };

const KST = 'Asia/Seoul';
function kstParts(iso) {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: KST, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    weekday: 'short', hour12: false,
  }).formatToParts(new Date(iso));
  const g = (t) => parts.find((x) => x.type === t)?.value ?? '';
  return { month: g('month'), day: g('day'), hour: g('hour'), minute: g('minute'), weekday: g('weekday') };
}
const whenLabel = (iso) => { const k = kstParts(iso); return `${k.month}-${k.day}(${k.weekday}) ${k.hour}시`; };
const tickLabel = (iso) => { const k = kstParts(iso); return `${Number(k.day)}일 ${k.hour}시`; };
const hm = (iso) => { if (!iso) return '-'; const k = kstParts(iso); return `${k.month}-${k.day} ${k.hour}:${k.minute}`; };
const offsetHours = (iso) => Math.round((new Date(iso).getTime() - Date.now()) / 3600000);
const signed = (v, digits = 2) => `${Number(v) >= 0 ? '+' : ''}${Number(v).toFixed(digits)}`;
const num = (v, unit) => (v == null ? '-' : `${Number(v).toFixed(1)} ${unit}`);

const dim = { color: '#94a3b8', fontSize: 11, marginRight: 6 };
const iconBtn = {
  background: 'rgba(232,240,242,0.08)', color: '#e8f0f2', border: '1px solid rgba(232,240,242,0.25)',
  borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 11.5, fontWeight: 700,
  display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
};

export default function OutlookTimeline({ focus, onClose, onOmniverse }) {
  const setOutlookPreview = useSensorStore((s) => s.setOutlookPreview);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [cursor, setCursor] = useState(-1);     // -1 = 지금(실측) · 0.. = 예보 시각
  const [playing, setPlaying] = useState(false);
  const stripRef = useRef(null);
  const cursorRef = useRef(-1);
  useEffect(() => { cursorRef.current = cursor; }, [cursor]);

  useEffect(() => {
    let alive = true;
    setData(null); setError(null); setCursor(-1); setPlaying(false);
    fetchTwinOutlook({ berth: focus.berth, call_sign: focus.call_sign })
      .then((d) => { if (!alive) return; setData(d); setPlaying(true); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [focus.berth, focus.call_sign]);

  const pts = useMemo(() => data?.forecast ?? [], [data]);
  const n = pts.length;
  // 예보 점 수 ≠ 시간 수 — 기상청 단기예보는 뒤로 갈수록 3시간 간격이라 66점이 72시간을 덮기도 한다.
  // 띠 오른쪽 끝과 머리말은 마지막 점의 시각으로 말한다(9/27 캡처: "+66시간"과 "72시간"이 나란히 떠 어긋나 보였다).
  const spanH = n ? Math.max(1, offsetHours(pts[n - 1].at_utc)) : 72;
  const firstIdx = useMemo(() => {
    const f = data?.first_change;
    if (!f) return null;
    const i = pts.findIndex((p) => p.at_utc === f.at_utc);
    return i >= 0 ? i : null;
  }, [data, pts]);

  // 자동 재생 — 지금 → 한 시각씩. 첫 변화에서 멈춘다(없으면 끝까지 가서 멈춘다).
  useEffect(() => {
    if (!playing || !n) return undefined;
    const delay = cursorRef.current === -1 ? FIRST_HOLD_MS : STEP_MS;
    const id = setTimeout(() => {
      const next = cursorRef.current + 1;
      if (next >= n) { setCursor(n - 1); setPlaying(false); return; }
      setCursor(next);
      if (firstIdx != null && next === firstIdx) setPlaying(false);
    }, delay);
    return () => clearTimeout(id);
  }, [playing, n, firstIdx, cursor]);

  const cur = data?.current || null;
  const point = cursor >= 0 ? pts[cursor] : null;

  // 3D 장면에 알린다 — Port.jsx 가 이 선석의 색·라벨을 이 시각의 판정으로 바꾼다.
  useEffect(() => {
    if (!data) { setOutlookPreview(null); return; }
    const src = point || cur || {};
    setOutlookPreview({
      berthId: focus.berthId, level: src.level || null, status: src.status || null,
      headline: src.headline || src.status || null, gate: src.gate || null,
      at_utc: point ? point.at_utc : null, offsetH: point ? offsetHours(point.at_utc) : 0,
    });
  }, [data, point, cur, focus.berthId, setOutlookPreview]);
  useEffect(() => () => setOutlookPreview(null), [setOutlookPreview]);

  // ── 글 — Omniverse 정보판과 같은 규칙(open_scene.py _outlook_timeline) ──
  const th = data?.thresholds || {};
  const rule = [
    th.stop_wind_ms != null ? `풍속 중단 ${th.stop_wind_ms} m/s` : '풍속 기준 없음',
    th.stop_wave_m != null ? `파고 중단 ${th.stop_wave_m} m` : '파고 기준 없음',
  ].join(' · ');
  const tf = data?.tide_forecast;
  const hasTide = Boolean(tf) && !tf.error;
  const bias = hasTide ? Number(tf.bias_cm ?? 0) : 0;
  const d = data?.draught || {};
  const depth = Number(d.chart_depth_m);
  const draught = Number(d.vessel_draught_m);
  const draughtOn = depth > 0 && draught > 0;
  const zoneKr = ZONE_KR[data?.presence?.presence_zone];
  const noDraught = !focus.call_sign
    ? '선석만 지목 — 배를 누르면 흘수까지 봅니다'
    : zoneKr ? `이 배는 지금 선석에 없음(${zoneKr})` : '이 배의 흘수 실측 없음';

  const tideLine = (tideM, ukc, isNow) => {
    if (tideM == null) return '조위 예측 없음 — 흘수 여유는 지금 실측만';
    const src = isNow ? '실측' : `조석예보 + 보정 ${bias >= 0 ? '+' : ''}${Math.round(bias)} cm`;
    if (!draughtOn) return `조위 ${signed(tideM)} m (${src}) · 흘수 — ${noDraught}`;
    return `조위 ${signed(tideM)} m (${src}) · 흘수 여유 ${ukc == null ? '-' : signed(ukc)} m (필요 ${(draught * 0.10).toFixed(2)})`;
  };
  const actionFor = (p) => {
    if (p.level === '적합') return '없음 — 이 시각 하역 가능';
    const steps = [];
    if (p.weather_level && p.weather_level !== '적합') steps.push(`${whenLabel(p.at_utc)}부터 ${p.status} 예보 — 그 전에 하역 종료 또는 개시 연기`);
    if (p.draught_verdict && p.draught_verdict !== 'OK') steps.push('조위 오르는 시각으로 이동 또는 수심 깊은 선석');
    return steps.join(' · ') || '하역 개시 전 재확인';
  };

  // 지금(실측) 줄
  const tideNow = d.tide_level_m ?? cur?.tide_m ?? null;
  const ukcNow = draughtOn && tideNow != null ? depth + Number(tideNow) - draught : null;

  // 판정 이력 · 게이트 — 판정 화면·게이트와 잇는 두 줄
  const a = data?.assessment || null;
  const g = data?.gate || null;
  const verdictLine = a?.level
    ? `${a.for === 'vessel' ? (a.vessel_name || a.call_sign || '') : `이 선석 최근(${a.vessel_name || a.call_sign || ''})`} · ${a.stage || ''} ${a.level} (${hm(a.assessed_at_utc)})${a.acknowledged_by ? ' · 확인됨' : ''}`
    : '아직 없음 — 선박 판정 화면에서 [판정 요청]';
  const gateLine = g?.state
    ? `${g.label || g.gate_id} ${g.state === 'LOCKED' ? '잠김' : '해제'}${g.state === 'LOCKED' && g.reason_ko ? ` — ${String(g.reason_ko).slice(0, 40)}` : ''} · ${g.offline ? '장치 미연결' : g.simulate ? '모의 장치' : '실물'}${g.demo ? ' · 시연 입력 중' : ''}`
    : null;

  // 요약 — 지금 실측으로 이미 막혀 있으면 그것부터 말한다(안 그러면 "지금 중단"과 "막히는 예보 없음"이 모순처럼 보인다)
  const first = data?.first_change || null;
  const nowBlocked = Boolean(cur?.level) && cur.level !== '적합';
  let summary = first
    ? `첫 변화 ${whenLabel(first.at_utc)} — ${first.headline || first.status}`
    : `예보로는 앞으로 ${n}시간 하역이 막히지 않음`;
  if (nowBlocked) summary = `지금은 실측으로 ${cur.headline || cur.status} · ${summary}`;
  const waveNow = nowBlocked && (cur.reasons || []).some((r) => /파고/.test(r) && />=/.test(r));
  const sources = data
    ? `기상청 단기예보 발표 ${hm(pts[0]?.issued_at_utc)} · ${hasTide ? '국립해양조사원 조석예보' : '조위 예측 없음'} · 예보 격자 ${data.forecast_grid?.note || '-'}`
    : '';

  // 지금 커서가 가리키는 시각의 내용
  const view = point
    ? {
      stage: `앞으로 · ${whenLabel(point.at_utc)} (+${offsetHours(point.at_utc)}시간)`,
      level: point.level, headline: point.headline || point.status, gate: point.gate,
      line1: `예보 풍속 ${num(point.wind_ms, 'm/s')} · 파고 ${num(point.wave_m, 'm')}${Number(point.precip_mm) > 0 ? ` · 강수 ${num(point.precip_mm, 'mm')}` : ''}`,
      line2: tideLine(point.tide_m, point.ukc_m, false),
      action: actionFor(point),
    }
    : cur
      ? {
        stage: `지금 · 실측 ${hm(cur.wind_observed_at_utc)}`,
        level: cur.level, headline: cur.headline || cur.status || '판단불가', gate: cur.gate,
        line1: `풍속 ${num(cur.wind_ms, 'm/s')} · 파고 ${num(cur.wave_m, 'm')}`,
        line2: tideLine(tideNow, ukcNow, true),
        action: cur.level === '적합' ? '없음 — 배정대로 진행' : '하역 개시 전 재확인',
      }
      : null;
  const levelColor = LEVEL_COLOR[view?.level] || '#94a3b8';

  const onStripClick = (e) => {
    if (!n || !stripRef.current) return;
    const r = stripRef.current.getBoundingClientRect();
    const i = Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * n)));
    setCursor(i); setPlaying(false);
  };
  const togglePlay = () => {
    if (playing) { setPlaying(false); return; }
    if (cursor >= n - 1) setCursor(-1);
    setPlaying(true);
  };

  return (
    <div style={{
      position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      width: 'min(940px, calc(100% - 470px))', minWidth: 600, zIndex: 1000,
      background: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(10px)',
      border: '1px solid rgba(56, 189, 248, 0.45)', borderRadius: 12, padding: '12px 16px 10px',
      color: '#e8f0f2', fontSize: 12.5, boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
    }}>
      {/* 머리 — 무엇의 72시간인가 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ color: '#38bdf8' }}>●</span>
        <strong style={{ fontSize: 14 }}>{focus.berth}{focus.vessel_name ? ` · ${focus.vessel_name}` : ''}</strong>
        <span style={{ fontWeight: 800, color: '#38bdf8' }}>앞으로 72시간</span>
        <HelpTip title="앞으로 72시간">
          <div>이 선석의 <strong>앞으로 72시간</strong>을 기상청 단기예보 · 국립해양조사원 조석예보로 한 시각씩 판정합니다. 판정 규칙은 관제 화면과 같습니다.</div>
          <div style={{ marginTop: 4 }}>시간축을 누르거나 재생하면 3D 화면의 선석 색과 라벨이 그 시각의 판정으로 바뀝니다. 빨간 선이 첫 변화입니다.</div>
          <div style={{ marginTop: 4 }}>선박 이동·하역 진행은 예측 근거(유량계·소요시간 모델)가 없어 재현하지 않습니다.</div>
        </HelpTip>
        {data && <span style={{ color: '#94a3b8', fontSize: 11.5 }}>{data.berth_group || '부두군 미상'} 기준 · {rule}</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {onOmniverse && (
            <button type="button" onClick={onOmniverse} style={{ ...iconBtn, color: '#94a3b8' }} title="같은 72시간을 Omniverse 로 봅니다 — 고사양 PC 전용, 기동 1~2분">
              Omniverse 로 보기
            </button>
          )}
          <button type="button" onClick={onClose} style={iconBtn} title="닫기 — 선석 색이 실측으로 돌아갑니다"><FaTimes /></button>
        </span>
      </div>

      {error && (
        <div style={{ marginTop: 10, color: '#f87171' }}>
          판정 흐름을 읽지 못했습니다 ({error}). 관제 서버가 떠 있는지, 선석 이름이 맞는지 확인하세요.
        </div>
      )}
      {!data && !error && <div style={{ marginTop: 10, color: '#94a3b8' }}>판정 흐름을 읽는 중… (기상청 단기예보 · 조석예보 · 판정 규칙)</div>}

      {data && (
        <>
          {/* 시간축 띠 — 시각마다 판정 색. 클릭하면 그 시각으로 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <button
              type="button" onClick={() => { setCursor(-1); setPlaying(false); }}
              title="지금(실측)으로"
              style={{
                ...iconBtn, flexShrink: 0, padding: '5px 9px',
                borderColor: cursor === -1 ? '#fff' : LEVEL_COLOR[cur?.level] || 'rgba(232,240,242,0.25)',
                color: LEVEL_COLOR[cur?.level] || '#e8f0f2',
              }}
            >
              ● 지금
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                ref={stripRef} onClick={onStripClick} role="slider" aria-label="앞으로 72시간 판정"
                aria-valuemin={0} aria-valuemax={Math.max(0, n - 1)} aria-valuenow={Math.max(0, cursor)}
                style={{ position: 'relative', height: 16, display: 'flex', borderRadius: 3, cursor: 'pointer', border: '1px solid rgba(232,240,242,0.35)' }}
              >
                {pts.map((p, i) => (
                  <div
                    key={p.at_utc}
                    title={`${whenLabel(p.at_utc)} · ${p.headline || p.status}`}
                    style={{ flex: 1, background: LEVEL_COLOR[p.level] || '#64748b', opacity: cursor >= 0 && i > cursor ? 0.5 : 1 }}
                  />
                ))}
                {firstIdx != null && (
                  <div style={{ position: 'absolute', top: -6, bottom: -4, left: `${(firstIdx / n) * 100}%`, width: 2, background: '#ff5a50' }} />
                )}
                {cursor >= 0 && (
                  <div style={{
                    position: 'absolute', top: -9, left: `calc(${((cursor + 0.5) / n) * 100}% - 6px)`, width: 0, height: 0,
                    borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '8px solid #fff',
                  }} />
                )}
              </div>
              <div style={{ position: 'relative', height: 14, fontSize: 10.5, color: '#aab8be' }}>
                {pts.map((p, i) => (i % 12 === 0 ? (
                  <span key={p.at_utc} style={{ position: 'absolute', left: `${(i / n) * 100}%`, whiteSpace: 'nowrap' }}>{tickLabel(p.at_utc)}</span>
                ) : null))}
                <span style={{ position: 'absolute', right: 0 }}>+{n}시간</span>
                {firstIdx != null && (
                  <span style={{ position: 'absolute', left: `${(firstIdx / n) * 100}%`, top: -30, transform: 'translateX(-50%)', color: '#ff8a80', fontWeight: 800, whiteSpace: 'nowrap', fontSize: 11 }}>첫 변화</span>
                )}
              </div>
            </div>
            <span style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
              <button type="button" onClick={togglePlay} style={iconBtn} title={playing ? '멈춤' : '재생 — 한 시각씩'}>
                {playing ? <FaPause /> : <FaPlay />} {playing ? '멈춤' : '재생'}
              </button>
              <button
                type="button" style={iconBtn}
                onClick={() => { setCursor(firstIdx != null ? firstIdx : n - 1); setPlaying(false); }}
                title={firstIdx != null ? '첫 변화 시각으로' : '72시간 끝으로'}
              >
                <FaFastForward /> {firstIdx != null ? '첫 변화' : '끝'}
              </button>
              <button type="button" onClick={() => { setCursor(-1); setPlaying(true); }} style={iconBtn} title="처음부터 다시 재생"><FaUndo /></button>
            </span>
          </div>

          {/* 그 시각의 판정 */}
          {view && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: '6px 18px', marginTop: 10 }}>
              <div>
                <div style={{ color: '#94a3b8', fontSize: 11 }}>{view.stage}</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: levelColor, margin: '2px 0 4px' }}>
                  ● {view.headline} — {GATE_TEXT[view.gate] || ''}
                </div>
                <div>{view.line1}</div>
                <div style={{ color: '#c3cede' }}>{view.line2}</div>
              </div>
              <div style={{ display: 'grid', gap: 3, alignContent: 'start', paddingTop: 14 }}>
                <div><span style={dim}>조치안</span>{view.action}</div>
                <div><span style={dim}>받는 곳</span>터미널 안전관리자 → 하역 개시 게이트</div>
                <div><span style={dim}>판정 이력</span><span style={{ color: a?.level ? LEVEL_COLOR[a.level] : '#c3cede' }}>{verdictLine}</span></div>
                {gateLine && <div><span style={dim}>게이트</span>{gateLine}</div>}
              </div>
            </div>
          )}

          <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.1)', fontWeight: 700, color: first || nowBlocked ? '#ff8a80' : '#10b981' }}>
            {summary}
            {waveNow && <span style={{ color: '#94a3b8', fontWeight: 400 }}> · 실측 파고는 외해 부이, 예보 파고는 부두 앞 격자 — 값이 다르면 현장 파고 확인</span>}
          </div>
          <div style={{ marginTop: 3, fontSize: 10.5, color: '#7f8f96' }}>{sources}</div>
        </>
      )}
    </div>
  );
}

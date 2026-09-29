import { useEffect, useMemo, useRef, useState } from 'react';
import { showDisclosure } from '../../../utils/disclosure';
import { FaPlay, FaPause, FaTimes, FaFastForward, FaUndo } from 'react-icons/fa';
import { fetchTwinOutlook, fetchUpcomingArrivals, fetchBerthAssignments } from '../../../api/backendAdapter';
import { ONSAN_BERTHS_3D } from '../../../utils/geoUtils';
import useSensorStore from '../../../stores/useSensorStore';
import useVesselThread, { normKey } from '../../../hooks/useVesselThread';
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
// 재현하지 않는 것: 선박 이동 경로·하역 진행 — 유량계·소요시간 모델이 없어 근거가 없다.
//
// [2026-09-28] 입항·출항 예정을 시간축에 올렸다(현우: "72시간을 돌려도 바뀌는 게 없다").
//   · PORT-MIS 입항 신고의 입항 예정 시각·사전배정 계류시설·흘수 → 그 시각에 선석에 반투명
//     "입항 예정(신고)" 선체(ScheduledShips)가 서고, 출항 예정 시각에 사라진다.
//   · 지금 접안한 선박은 선석 점유의 출항 예정 신고 시각이 지나면 3D 에서 뺀다.
//   · 지목한 선석에 그 시각 머무는 예정 선박의 흘수 여유를 조석예보로 매시 계산한다 —
//     필요 여유는 판정 잡과 같은 max(1.0 m, 흘수×10%). 흘수 신고가 없으면 판정불가.
//   경로는 그리지 않는다(나타남·사라짐만). 모두 신고 기준이라 화면에 "신고"를 적는다.
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

// 판정 순위 · 게이트 — 백엔드 twin.py 와 같은 표
const RANK = { 적합: 0, 주의: 1, 확인요청: 2, 판정불가: 2, 부적합: 3 };
const GATE_OF = { 적합: 'OPEN', 주의: 'CAUTION', 확인요청: 'CAUTION', 판정불가: 'CAUTION', 부적합: 'LOCKED' };
const worse = (a, b) => ((RANK[b] ?? -1) > (RANK[a] ?? -1) ? b : a);
// 필요 여유 — 판정 잡·대시보드와 같은 규칙(docs/28): max(1.0 m, 흘수×10%)
const ukcRequired = (dr) => Math.max(1.0, dr * 0.1);
const draughtLevel = (ukc, dr) => (ukc == null ? null : ukc <= 0 ? '부적합' : ukc < ukcRequired(dr) ? '주의' : '적합');
// PORT-MIS 표기(OTK1부두 · S-OIL2부두)를 3D 선석 키로 — 공백·대소문자만 무시한다
const norm = (s) => (s || '').replace(/\s+/g, '').toUpperCase();
const berthIdOf = (name) => Object.keys(ONSAN_BERTHS_3D).find((k) => norm(ONSAN_BERTHS_3D[k].name) === norm(name)) || null;
const ms = (iso) => (iso ? new Date(iso).getTime() : null);
// [2026-09-30] 시간이 지나도 바뀌지 않는 사유 — 화물 혼재 · 선석 조건. 기상 · 조위는 시각마다 예보로 다시 본다.
//   예전엔 시각별 판정이 기상 · 조위만 봐서, 지금 '주의(같은 배 화물 혼재 → 하역보류)'인 배도
//   "조치안 없음 — 이 시각 하역 가능"으로 나왔다(현우 검토 요청으로 찾음).
const FIXED_CAUSE = /혼재|호환|격리|반응|취급 화물|선석 길이|DWT|최대 접안/;
const shortWhy = (t) => String(t || '').replace(/^.*?(으나|지만)\s*/, '').split(' — ')[0]
  .replace(/(이|가) 있습니다$|입니다$|습니다$/, '').trim();
const iconBtn = {
  background: 'rgba(232,240,242,0.08)', color: '#e8f0f2', border: '1px solid rgba(232,240,242,0.25)',
  borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 11.5, fontWeight: 700,
  display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
};

export default function OutlookTimeline({ focus, onClose, onOmniverse }) {   // eslint-disable-line no-unused-vars
  const setOutlookPreview = useSensorStore((s) => s.setOutlookPreview);
  // 선석을 지목했으면 그 선석에 지금 접안한 배(판정이 가장 나쁜 배)를 같이 본다 — 흘수 여유와 지금 판정이 붙는다.
  //   예전엔 '선석만 지목 — 배를 누르면 흘수까지 봅니다'라고 안내만 했다.
  const { berths, loaded: threadLoaded } = useVesselThread();
  const occupant = useMemo(() => {
    if (focus.call_sign) return null;
    const row = berths.find((b) => normKey(b.wharf_name) === normKey(focus.berth));
    const order = { 부적합: 0, 판정불가: 1, 주의: 2, 적합: 3 };
    return [...(row?.slots || [])].filter((x) => x.call_sign)
      .sort((x, y) => (order[x.status] ?? 5) - (order[y.status] ?? 5))[0] || null;
  }, [berths, focus.berth, focus.call_sign]);
  const callSign = focus.call_sign || occupant?.call_sign || null;
  const vesselName = focus.vessel_name || occupant?.vessel_name || null;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [sched, setSched] = useState([]);     // 입항 예정(PORT-MIS 신고) — 온산 3D 선석
  const [leaving, setLeaving] = useState([]); // 지금 접안 선박의 출항 예정(신고)
  const [cursor, setCursor] = useState(-1);     // -1 = 지금(실측) · 0.. = 예보 시각
  const [playing, setPlaying] = useState(false);
  const stripRef = useRef(null);
  const cursorRef = useRef(-1);
  useEffect(() => { cursorRef.current = cursor; }, [cursor]);

  useEffect(() => {
    if (!focus.call_sign && !threadLoaded) return undefined;   // 선석의 지금 배를 알고 나서 한 번 읽는다
    let alive = true;
    setData(null); setError(null); setCursor(-1); setPlaying(false);
    fetchTwinOutlook({ berth: focus.berth, call_sign: callSign })
      .then((d) => { if (!alive) return; setData(d); setPlaying(true); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [focus.berth, callSign, threadLoaded]);   // eslint-disable-line react-hooks/exhaustive-deps

  // 입항·출항 예정 — 판정 흐름과 따로 읽는다(실패해도 기상 흐름은 그대로 보인다)
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetchUpcomingArrivals({ aheadHours: 72, pastHours: 0 }).catch(() => null),
      fetchBerthAssignments().catch(() => null),
    ]).then(([arr, berths]) => {
      if (!alive) return;
      const now = Date.now();
      setSched((arr?.items || []).map((r) => {
        const berthId = berthIdOf(r.wharf_name || r.facility_name);
        if (!berthId || r.facility_type !== 'BERTH' || !(ms(r.arrival_at_utc) > now)) return null;
        return {
          berthId, call_sign: r.call_sign, vessel_name: r.vessel_name, eta: r.arrival_at_utc,
          etd: r.departure_sched_utc || null, draught: Number(r.draught_m) > 0 ? Number(r.draught_m) : null,
          draught_basis: r.draught_basis || null,
          depth: Number(r.depth_m) > 0 ? Number(r.depth_m) : (ONSAN_BERTHS_3D[berthId] ? null : null),
          report_type: r.report_type || null,
        };
      }).filter(Boolean));
      setLeaving((berths || []).flatMap((b) => (b.slots || [])
        .filter((x) => x.call_sign && x.departure_scheduled_utc && ms(x.departure_scheduled_utc) > now)
        .map((x) => ({ berthId: berthIdOf(b.wharf_name), call_sign: x.call_sign, vessel_name: x.vessel_name, etd: x.departure_scheduled_utc })))
        .filter((x) => x.berthId));
    });
    return () => { alive = false; };
  }, [focus.berth]);

  const rawPts = useMemo(() => data?.forecast ?? [], [data]);
  const focusDraught = Number(data?.draught?.vessel_draught_m);
  const focusLeave = leaving.find((l) => callSign && norm(l.call_sign) === norm(callSign));
  // 지금 판정(판정 이력)에서 시간이 지나도 그대로인 사유 — 그 배가 이 선석에 있는 동안 모든 시각에 얹는다
  const a = data?.assessment || null;
  const fixed = useMemo(() => {
    if (!a?.level || a.level === '적합' || !callSign) return null;
    if (norm(a.call_sign) !== norm(callSign)) return null;         // 다른(떠난) 배의 판정은 얹지 않는다
    if (a.stage && a.stage !== '하역중') return null;               // 접안해 있는 배의 판정만
    const why = (a.reasons || []).find((r) => FIXED_CAUSE.test(r));
    if (!why) return null;
    return { level: a.level, why: shortWhy(why), action: a.action || null, recipient: a.recipient || null };
  }, [a, callSign]);
  // 시각마다: 백엔드 기상 판정 + (지목 선박이 아직 있으면) 흘수 여유 + 그 시각 이 선석의 입항 예정 선박 흘수 여유
  const pts = useMemo(() => rawPts.map((p) => {
    const t = ms(p.at_utc);
    let level = p.weather_level || p.level || '적합';
    const notes = [];
    const stillHere = !(focusLeave && ms(focusLeave.etd) <= t);
    if (stillHere && p.ukc_m != null && focusDraught > 0) level = worse(level, draughtLevel(p.ukc_m, focusDraught));
    const ghosts = sched
      .filter((g) => ms(g.eta) <= t && (!g.etd || t < ms(g.etd)))
      .map((g) => {
        let gl = null; let ukc = null;
        if (g.berthId === focus.berthId) {
          if (!g.draught) gl = '판정불가';
          else if (g.depth && p.tide_m != null) { ukc = g.depth + p.tide_m - g.draught; gl = draughtLevel(ukc, g.draught); }
        }
        return { ...g, level: gl, ukc };
      });
    ghosts.filter((g) => g.berthId === focus.berthId && g.level).forEach((g) => {
      level = worse(level, g.level);
      notes.push(g.level === '판정불가'
        ? `입항 예정 ${g.vessel_name || g.call_sign} 흘수 미신고`
        : g.level !== '적합' ? `입항 예정 ${g.vessel_name || g.call_sign} 흘수 여유 ${signed(g.ukc)} m` : null);
    });
    const departed = leaving.filter((l) => ms(l.etd) <= t).map((l) => l.call_sign);
    const wx = p.weather_level && p.weather_level !== '적합' ? p.status : null;
    const fixedHere = fixed && stillHere ? fixed : null;
    if (fixedHere) level = worse(level, fixedHere.level);
    const headline = [wx, fixedHere ? fixedHere.why : null, ...notes.filter(Boolean)].filter(Boolean).join(' · ')
      || (level === '적합' ? '정상' : p.headline || p.status);
    return { ...p, level, gate: GATE_OF[level] || p.gate, headline, ghosts, departed, fixedHere };
  }), [rawPts, sched, leaving, focus.berthId, focusDraught, focusLeave, fixed]);
  const n = pts.length;
  // 첫 변화 = 지금보다 나빠지는 첫 시각(시간이 지나도 그대로인 사유만으로 처음부터 주의면 그건 '변화'가 아니다)
  const baseLevel = fixed ? fixed.level : '적합';
  const firstIdx = useMemo(() => {
    const i = pts.findIndex((p) => p.level && (RANK[p.level] ?? 0) > (RANK[baseLevel] ?? 0));
    return i >= 0 ? i : null;
  }, [pts, baseLevel]);
  // 지목 선석의 72시간 안 입항·출항 예정 — 시간축 표지와 목록
  const hereEvents = useMemo(() => {
    const evs = [];
    sched.filter((g) => g.berthId === focus.berthId).forEach((g) => evs.push({ kind: 'in', at: g.eta, g }));
    leaving.filter((l) => l.berthId === focus.berthId).forEach((l) => evs.push({ kind: 'out', at: l.etd, g: l }));
    sched.filter((g) => g.berthId === focus.berthId && g.etd).forEach((g) => evs.push({ kind: 'out', at: g.etd, g }));
    return evs.sort((a, b) => ms(a.at) - ms(b.at));
  }, [sched, leaving, focus.berthId]);
  const idxOf = (iso) => {
    if (!n) return null;
    const t = ms(iso);
    const i = pts.findIndex((p) => ms(p.at_utc) >= t);
    return i >= 0 ? i : null;
  };

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
  //   [2026-09-30] 장면 글씨는 한 낱말만(하역중단 · 주의 · 혼재 …) — 긴 사유가 배 이름표와 겹쳤다. 사유는 아래 패널에 있다.
  const sceneWord = (src) => {
    if (!src) return null;
    if (src.weather_level && src.weather_level !== '적합') return src.status;
    if (src.level && src.level !== '적합') return src.fixedHere ? `${src.level} · 혼재` : src.level;
    return '정상';
  };
  useEffect(() => {
    if (!data) { setOutlookPreview(null); return; }
    const src = point || cur || {};
    const nowWord = fixed ? `${worse(cur?.level || '적합', fixed.level)} · 혼재` : (cur?.headline || cur?.status || null);
    setOutlookPreview({
      berthId: focus.berthId, level: point ? src.level : (fixed ? worse(cur?.level || '적합', fixed.level) : src.level) || null,
      status: src.status || null,
      headline: point ? sceneWord(point) : nowWord, gate: src.gate || null,
      at_utc: point ? point.at_utc : null, offsetH: point ? offsetHours(point.at_utc) : 0,
      ghosts: point ? point.ghosts : [], departed: point ? point.departed : [],
      wave_m: point ? point.wave_m : null,
    });
  }, [data, point, cur, focus.berthId, setOutlookPreview, fixed]);   // eslint-disable-line react-hooks/exhaustive-deps
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
  const noDraught = !callSign
    ? '접안 선박 없음'
    : zoneKr ? `이 배는 지금 선석에 없음(${zoneKr})` : '이 배의 흘수 실측 없음';

  const tideLine = (tideM, ukc, isNow) => {
    if (tideM == null) return '조위 예측 없음 — 흘수 여유는 지금 실측만';
    const src = isNow ? '실측' : `조석예보 + 보정 ${bias >= 0 ? '+' : ''}${Math.round(bias)} cm`;
    if (!draughtOn) return `조위 ${signed(tideM)} m (${src}) · 흘수 — ${noDraught}`;
    return `조위 ${signed(tideM)} m (${src}) · 흘수 여유 ${ukc == null ? '-' : signed(ukc)} m (필요 ${ukcRequired(draught).toFixed(2)})`;
  };
  const actionFor = (p) => {
    if (p.level === '적합') return '없음 — 이 시각 하역 가능';
    const steps = [];
    if (p.fixedHere) steps.push(`${p.fixedHere.action || '하역 개시 전 재확인'} — ${p.fixedHere.why}`);
    if (p.weather_level && p.weather_level !== '적합') steps.push(`${whenLabel(p.at_utc)}부터 ${p.status} 예보 — 그 전에 하역 종료 또는 개시 연기`);
    if (p.draught_verdict && p.draught_verdict !== 'OK') steps.push('조위 오르는 시각으로 이동 또는 수심 깊은 선석');
    (p.ghosts || []).filter((g) => g.berthId === focus.berthId && g.level && g.level !== '적합').forEach((g) => {
      steps.push(g.level === '판정불가'
        ? `${g.vessel_name || g.call_sign} 흘수 신고 확인 후 입항 전 재판정`
        : `${g.vessel_name || g.call_sign} 입항 시각을 조위 오르는 때로 조정 또는 대체 선석 검토`);
    });
    return steps.join(' · ') || '하역 개시 전 재확인';
  };

  // 지금(실측) 줄
  const tideNow = d.tide_level_m ?? cur?.tide_m ?? null;
  const ukcNow = draughtOn && tideNow != null ? depth + Number(tideNow) - draught : null;

  // 판정 이력 · 게이트 — 판정 화면·게이트와 잇는 두 줄
  const g = data?.gate || null;
  const verdictLine = a?.level
    ? `${a.for === 'vessel' ? (a.vessel_name || a.call_sign || '') : `이 선석 최근(${a.vessel_name || a.call_sign || ''})`} · ${a.stage || ''} ${a.level} (${hm(a.assessed_at_utc)})${a.acknowledged_by ? ' · 확인됨' : ''}`
    : '아직 없음 — 선박 판정 화면에서 [판정 요청]';
  const gateLine = g?.state
    ? `${g.label || g.gate_id} ${g.state === 'LOCKED' ? '잠김' : '해제'}${g.state === 'LOCKED' && g.reason_ko ? ` — ${String(g.reason_ko).slice(0, 40)}` : ''} · ${g.offline ? '장치 미연결' : showDisclosure() ? (g.simulate ? '모의 장치' : '실물') : '장치 연결'}${g.demo && showDisclosure() ? ' · 시연 입력 중' : ''}`
    : null;

  // 요약 — 지금 실측으로 이미 막혀 있으면 그것부터 말한다(안 그러면 "지금 중단"과 "막히는 예보 없음"이 모순처럼 보인다)
  const first = firstIdx != null ? pts[firstIdx] : null;
  const nowBlocked = Boolean(cur?.level) && cur.level !== '적합';
  const inbound = hereEvents.filter((e) => e.kind === 'in').length;
  let summary = first
    ? `첫 변화 ${whenLabel(first.at_utc)} — ${first.headline || first.status}`
    : [`앞으로 ${n}시간 기상 · 조위로 더 나빠지는 시각 없음`,
      fixed ? `지금 판정 ${fixed.level}(${fixed.why}) 계속` : null,
      inbound ? `이 선석 입항 예정 ${inbound}척(신고)` : null].filter(Boolean).join(' · ');
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
      line3: (() => {
        const here = (point.ghosts || []).filter((g) => g.berthId === focus.berthId);
        if (!here.length) return null;
        return here.map((g) => `입항 예정(신고 ${hm(g.eta)}) ${g.vessel_name || g.call_sign} · `
          + (g.draught ? `흘수 ${g.draught.toFixed(1)} m${g.draught_basis ? `(${g.draught_basis})` : ''}`
            + (g.ukc != null ? ` · 여유 ${signed(g.ukc)} m (필요 ${ukcRequired(g.draught).toFixed(2)})` : '') : '흘수 미신고 → 판정불가')).join(' / ');
      })(),
      recipient: (point.ghosts || []).some((g) => g.berthId === focus.berthId && g.level && g.level !== '적합')
        ? '선석 운영 주체 · VTS (입항 전)'
        : point.fixedHere?.recipient && !(point.weather_level && point.weather_level !== '적합')
          ? point.fixedHere.recipient
          : '터미널 안전관리자 → 하역 개시 게이트',
      action: actionFor(point),
    }
    : cur
      ? (() => {
        const lv = fixed ? worse(cur.level || '적합', fixed.level) : cur.level;
        const wxBad = cur.level && cur.level !== '적합';
        return {
          stage: `지금 · 실측 ${hm(cur.wind_observed_at_utc)}`,
          level: lv,
          headline: [wxBad ? (cur.headline || cur.status) : null, fixed ? fixed.why : null].filter(Boolean).join(' · ')
            || cur.headline || cur.status || '판단불가',
          gate: fixed ? (GATE_OF[lv] || cur.gate) : cur.gate,
          line1: `풍속 ${num(cur.wind_ms, 'm/s')} · 파고 ${num(cur.wave_m, 'm')}`,
          line2: tideLine(tideNow, ukcNow, true),
          action: fixed ? `${fixed.action || '하역 개시 전 재확인'} — ${fixed.why}`
            : cur.level === '적합' ? '없음 — 배정대로 진행' : '하역 개시 전 재확인',
          recipient: fixed?.recipient || null,
        };
      })()
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
    // [2026-09-30] 72시간을 보는 동안 선박 목록 · 레이더는 접는다(DigitalTwinPage) — 왼쪽 목록과 겹쳤다(현우)
    <div style={{
      position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      width: 'min(1000px, calc(100% - 80px))', minWidth: 600, zIndex: 1000,
      background: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(10px)',
      border: '1px solid rgba(56, 189, 248, 0.45)', borderRadius: 12, padding: '12px 16px 10px',
      color: '#e8f0f2', fontSize: 12.5, boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
    }}>
      {/* 머리 — 무엇의 72시간인가 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ color: '#38bdf8' }}>●</span>
        <strong style={{ fontSize: 14 }}>{focus.berth}{vesselName ? ` · ${vesselName}` : ''}</strong>
        <span style={{ fontWeight: 800, color: '#38bdf8' }}>앞으로 72시간</span>
        <HelpTip title="앞으로 72시간">
          <div>이 선석(과 지금 접안한 배)의 <strong>앞으로 72시간</strong>을 한 시각씩 판정합니다 — 기상은 기상청 단기예보, 흘수 여유는 국립해양조사원 조석예보로 다시 보고,
            화물 혼재 · 선석 조건처럼 시간이 지나도 바뀌지 않는 사유는 지금 판정을 그대로 얹습니다. 판정 규칙은 관제 화면과 같습니다.</div>
          <div style={{ marginTop: 4 }}>쓰는 때: 하역 도중 기상이 나빠지는 시각을 미리 보고 하역 종료 · 개시 연기를 터미널에 알리거나, 저조 때 흘수 여유가 모자라는 시각을 피해 입항 시각을 조정할 때.</div>
          <div style={{ marginTop: 4 }}>시간축을 누르거나 재생하면 3D 화면의 선석 색과 라벨이 그 시각의 판정으로 바뀝니다. 빨간 선이 첫 변화입니다.</div>
          <div style={{ marginTop: 4 }}>입항·출항 예정(PORT-MIS 신고)도 시간축에 올립니다 — 입항 예정 시각에 선석에 반투명 선체가 서고(▼ 파랑), 출항 예정 시각에 사라집니다(▲ 회색). 그 시각의 조석예보로 흘수 여유를 계산해 필요 여유 max(1.0 m, 흘수×10%)보다 작으면 주의, 흘수 신고가 없으면 판정불가입니다.</div>
          <div style={{ marginTop: 4 }}>선박 이동 경로·하역 진행은 예측 근거(유량계·소요시간 모델)가 없어 재현하지 않습니다.</div>
        </HelpTip>
        {data && <span style={{ color: '#94a3b8', fontSize: 11.5 }}>{data.berth_group || '부두군 미상'} 기준 · {rule}</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
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
                {hereEvents.map((e) => {
                  const i = idxOf(e.at);
                  if (i == null) return null;
                  return (
                    <div
                      key={`${e.kind}-${e.g.call_sign}-${e.at}`}
                      title={`${e.kind === 'in' ? '입항 예정' : '출항 예정'}(신고) ${hm(e.at)} · ${e.g.vessel_name || e.g.call_sign}`}
                      style={{
                        position: 'absolute', left: `calc(${((i + 0.5) / n) * 100}% - 5px)`, bottom: -11, width: 0, height: 0,
                        borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
                        ...(e.kind === 'in' ? { borderBottom: '7px solid #60a5fa' } : { borderBottom: '7px solid #94a3b8' }),
                      }}
                    />
                  );
                })}
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
                {view.line3 && <div style={{ color: '#93c5fd' }}>{view.line3}</div>}
              </div>
              <div style={{ display: 'grid', gap: 3, alignContent: 'start', paddingTop: 14 }}>
                <div><span style={dim}>조치안</span>{view.action}</div>
                <div><span style={dim}>받는 곳</span>{view.recipient || '터미널 안전관리자 → 하역 개시 게이트'}</div>
                <div><span style={dim}>지금 판정</span><span style={{ color: a?.level ? LEVEL_COLOR[a.level] : '#c3cede' }}>{verdictLine}</span></div>
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

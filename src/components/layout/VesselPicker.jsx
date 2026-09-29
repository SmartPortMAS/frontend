import { useEffect, useMemo, useRef, useState } from 'react';
import { FaSearch, FaTimes } from 'react-icons/fa';
import useVesselThread, { normKey } from '../../hooks/useVesselThread';
import { VERDICT_RANK, verdictColor } from '../../utils/verdict';
import { sortOnsan, shortBerth } from '../../utils/onsanBerths';

// ─────────────────────────────────────────────────────────────────────────────
// 선박 찾기 (2026-09-29 밤) — 추적 띠의 선박 고르기
//
// 긴 드롭다운 목록 대신 관제사가 배를 떠올리는 방식 그대로 고른다(현우: "너무 리스트 형태").
//   온산 선석  부두 칸 안에 지금 접안한 배 — 판정 색 막대
//   입항 예정  72시간 안에 들어올 배를 시각순으로 — 판정 색 점
//   검색      선명·호출부호 몇 글자
// ─────────────────────────────────────────────────────────────────────────────

const STAGE_TEXT = { 입항전: '입항 전', 접안직전: '접안 직전', 하역중: '하역 중' };
const hm = (iso) => new Date(iso).toLocaleString('ko-KR', {
  timeZone: 'Asia/Seoul', hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
});

export default function VesselPicker({ current, onPick, onClose }) {
  const { options, berths, arrivals, loaded } = useVesselThread();
  const [q, setQ] = useState('');
  const box = useRef(null);
  const input = useRef(null);

  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    const onDown = (e) => {
      if (box.current && !box.current.contains(e.target) && !e.target.closest?.('.trail-find')) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown); };
  }, [onClose]);

  const onsan = useMemo(() => sortOnsan(berths.filter((b) => b.port_name === '온산항')), [berths]);
  const upcoming = useMemo(() => arrivals
    .filter((r) => r.is_onsan && (r.stage === '입항전' || r.stage === '접안직전'))
    .sort((a, b) => String(a.arrival_at_utc).localeCompare(String(b.arrival_at_utc)))
    .slice(0, 16), [arrivals]);
  const found = useMemo(() => {
    const k = normKey(q);
    if (!k) return [];
    return options
      .filter((o) => normKey(o.name).includes(k) || normKey(o.callsgn).includes(k))
      .sort((a, b) => (VERDICT_RANK[a.level] ?? 9) - (VERDICT_RANK[b.level] ?? 9))
      .slice(0, 30);
  }, [q, options]);
  const cur = normKey(current);
  const pick = (callsgn, name) => onPick({ callsgn, vessel_name: name });

  return (
    <div className="vp-pop" ref={box} role="dialog" aria-label="선박 찾기">
      <div className="vp-head">
        <FaSearch aria-hidden="true" />
        <input
          ref={input}
          id="vessel-picker-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="선명 · 호출부호"
          autoComplete="off"
        />
        <button type="button" className="vp-close" onClick={onClose} aria-label="닫기"><FaTimes /></button>
      </div>

      {q.trim() ? (
        <ul className="vp-results">
          {found.map((o) => (
            <li key={o.callsgn}>
              <button type="button" className={normKey(o.callsgn) === cur ? 'on' : ''} onClick={() => pick(o.callsgn, o.name)}>
                <i style={{ background: o.level ? verdictColor(o.level) : 'transparent', borderColor: o.level ? verdictColor(o.level) : undefined }} />
                <strong>{o.name}</strong>
                <span>{o.callsgn}</span>
                <em>{o.berth || '-'}</em>
                <b style={{ color: o.level ? verdictColor(o.level) : undefined }}>{o.level || '판정 전'}</b>
              </button>
            </li>
          ))}
          {found.length === 0 && <li className="vp-none">찾는 선박이 없습니다</li>}
        </ul>
      ) : (
        <div className="vp-body">
          <section className="vp-berths" aria-label="온산 선석">
            <h4>온산 선석</h4>
            {!loaded ? <p className="vp-none">불러오는 중…</p> : (
              <div className="vp-grid">
                {onsan.map((b) => {
                  const ships = (b.slots || []).filter((s) => s.call_sign);
                  return (
                    <div key={b.wharf_name} className={`vp-berth${ships.length ? ' busy' : ''}`}>
                      <span className="vp-bname">{shortBerth(b.wharf_name)}</span>
                      {ships.map((s) => (
                        <button
                          key={s.call_sign}
                          type="button"
                          className={`vp-ship${normKey(s.call_sign) === cur ? ' on' : ''}`}
                          style={{ '--ship-tone': s.status ? verdictColor(s.status) : undefined }}
                          onClick={() => pick(s.call_sign, s.vessel_name)}
                          title={`${s.vessel_name || s.call_sign} · ${s.status || '판정 전'}`}
                        >
                          {s.vessel_name || s.call_sign}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
          <section className="vp-arrivals" aria-label="입항 예정">
            <h4>입항 예정</h4>
            <ul>
              {upcoming.map((r) => {
                const lv = r.assessment?.level;
                return (
                  <li key={`${r.call_sign}-${r.arrival_at_utc}`}>
                    <button type="button" className={normKey(r.call_sign) === cur ? 'on' : ''} onClick={() => pick(r.call_sign, r.vessel_name)}>
                      <time>{hm(r.arrival_at_utc)}</time>
                      <i style={{ background: lv ? verdictColor(lv) : 'transparent', borderColor: lv ? verdictColor(lv) : undefined }} />
                      <strong>{r.vessel_name || r.call_sign}</strong>
                      <em>{shortBerth(r.wharf_name || r.facility_name)} · {STAGE_TEXT[r.stage]}</em>
                    </button>
                  </li>
                );
              })}
              {loaded && upcoming.length === 0 && <li className="vp-none">72시간 안에 온산 입항 예정이 없습니다</li>}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

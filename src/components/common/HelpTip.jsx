import { useEffect, useId, useRef, useState } from 'react';
import { FaQuestionCircle } from 'react-icons/fa';
import { COLORS } from '../../utils/constants';

// 도움말 — 화면에는 핵심 낱말만 두고, 설명·근거·주의는 (?) 를 눌렀을 때만 보여준다.
// 발표·관제 화면에서 긴 문장이 카드마다 붙어 읽히지 않던 문제(2026-09-27 현우 지적)의 공용 해법.
// 바깥을 누르거나 Esc 로 닫힌다. children 은 문장 또는 목록.
export default function HelpTip({ title, children, align = 'left', width = 320, label = '도움말' }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const id = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={rootRef} style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle' }}>
      <button
        type="button"
        aria-label={title ? `${title} ${label}` : label}
        aria-expanded={open}
        aria-controls={id}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22, padding: 0, marginLeft: 6, borderRadius: '50%',
          border: 'none', background: 'transparent', cursor: 'pointer',
          color: open ? COLORS.info : COLORS.textDim,
        }}
      >
        <FaQuestionCircle size={15} />
      </button>
      {open && (
        <span
          id={id}
          role="dialog"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', [align === 'right' ? 'right' : 'left']: 0,
            zIndex: 2000, width, maxWidth: '80vw',
            background: COLORS.card, color: COLORS.textPrimary,
            border: `1px solid ${COLORS.border}`, borderRadius: 10,
            boxShadow: '0 10px 28px rgba(16, 35, 43, 0.18)',
            padding: '12px 14px', fontSize: 12.5, fontWeight: 400, lineHeight: 1.65,
            textAlign: 'left', whiteSpace: 'normal', letterSpacing: 0,
          }}
        >
          {title && <strong style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>{title}</strong>}
          {children}
        </span>
      )}
    </span>
  );
}

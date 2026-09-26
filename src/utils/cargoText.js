// [2026-09-25] 한 입항 건에 화물이 여러 종 실린다(합성 manifest v4, 입항 건당 1~8종).
// 화면마다 첫 화물 1종만 찍으면 여러 화물을 실은 배가 단일 화물선처럼 읽혀서,
// 화물 표기를 이 한 곳에서 만든다.

/** 이름 목록(중복·빈 값 제거). 입력은 문자열 또는 { name } 객체 배열. */
export function cargoNames(list) {
  const out = [];
  for (const c of list || []) {
    const name = typeof c === 'string' ? c : c?.name;
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/** 'A' · 'A, B' · 'A, B 외 3종' — 좁은 칸용 요약. 전체 목록은 title 로 준다. */
export function cargoSummary(list, max = 2) {
  const names = cargoNames(list);
  if (names.length <= max) return names.join(', ');
  return `${names.slice(0, max).join(', ')} 외 ${names.length - max}종`;
}

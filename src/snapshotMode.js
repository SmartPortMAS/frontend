// ─────────────────────────────────────────────
// 스냅샷 모드 — 서버 없이 열리는 배포본용 fetch 가로채기
//
// 대시보드 데이터는 함현우 PC 의 DB 에서 나오므로 PC 가 꺼지면 공개 주소가 빈
// 화면이 된다. VITE_SNAPSHOT=1 로 빌드하면 이 모듈이 fetch 를 감싸서 API 호출을
// 같이 배포된 snapshot.json 으로 응답한다 → 정적 호스팅(무료)에 올려도 화면이 산다.
//
// 굳힌 시점의 데이터라 실시간이 아니다. 스냅샷에 없는 경로(챗봇·안전판정 등
// 입력값을 받는 API)는 503 으로 돌려주고, 화면은 각자의 실패 처리(판단불가 등)를
// 그대로 타게 둔다 — 없는 데이터를 지어내지 않기 위해서다.
// ─────────────────────────────────────────────
const ENABLED = import.meta.env.VITE_SNAPSHOT === '1';

export const IS_SNAPSHOT = ENABLED;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

if (ENABLED && typeof window !== 'undefined') {
  const nativeFetch = window.fetch.bind(window);
  const loading = fetch('./snapshot/snapshot.json')
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));

  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url ?? '';
    // 스냅샷은 API 만 대신한다. 정적 파일·지도 타일 등은 원래 fetch 로 보낸다.
    if (!url.includes('/api/')) return nativeFetch(input, init);

    const snap = await loading;
    const path = url.startsWith('http') ? new URL(url).pathname : url.split('?')[0];

    // 선석별 기상 판정은 body 의 berth_group 으로 갈라 저장해 뒀다
    if (path.endsWith('/weather/assess')) {
      const byGroup = snap['/api/v1/weather/assess'] || {};
      let group = null;
      try {
        group = JSON.parse(init?.body ?? '{}').berth_group;
      } catch { /* body 파싱 실패 시 아래 503 */ }
      if (group && byGroup[group]) return jsonResponse(byGroup[group]);
    }

    if (snap[path]) return jsonResponse(snap[path]);

    return jsonResponse(
      { detail: '스냅샷 배포본입니다 - 이 기능은 실시간 서버가 필요합니다' },
      503,
    );
  };
}

# -*- coding: utf-8 -*-
"""스냅샷 생성 — 지금 살아있는 로컬 서버의 응답을 파일로 굳힌다.

왜 필요한가: 대시보드 데이터는 내 PC 의 DB 에서 나오므로 PC 가 꺼지면 공개 주소도
빈 화면이 된다. 응답을 미리 받아 화면과 함께 배포하면 서버 없이도 열린다
(데이터는 굳힌 시점에 고정 — 실시간이 필요한 회의 때는 터널 주소를 쓴다).

전제: 관제시스템_시작.bat 으로 8000·8001 이 떠 있을 것.
실행:  python scripts/make_snapshot.py     (루트의 스냅샷_만들기.bat 이 호출)
"""
import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, "public", "snapshot")

MOCK = "http://localhost:8000/api"
BACKEND = "http://localhost:8001/api/v1"

# 저장 키는 화면이 호출하는 경로와 1:1 로 맞춘다 (snapshotMode.js 가 이 키로 찾는다)
GETS = {
    "/api/dashboard": f"{MOCK}/dashboard",
    "/api/v1/dashboard/weather": f"{BACKEND}/dashboard/weather",
    "/api/v1/dashboard/vessels": f"{BACKEND}/dashboard/vessels",
    "/api/v1/dashboard/berths": f"{BACKEND}/dashboard/berths",
    "/api/v1/dashboard/anchorages": f"{BACKEND}/dashboard/anchorages",
}

# 선석 그룹 목록은 API 가 아니라 프론트 상수(geoUtils.ONSAN_WEATHER_GROUP)에서 온다.
# 목록이 바뀌면 여기도 같이 고쳐야 하므로, 그 파일에서 직접 뽑아 쓴다.
GEO_UTILS = os.path.join(BASE, "src", "utils", "geoUtils.js")


def fetch(url: str):
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode("utf-8"))


def post(url: str, body: dict):
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json; charset=utf-8"}
    )
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read().decode("utf-8"))


def berth_groups() -> list:
    """geoUtils.js 의 ONSAN_WEATHER_GROUP 값(선석 그룹명)을 순서 유지·중복 제거로 뽑는다."""
    import re

    with open(GEO_UTILS, encoding="utf-8") as f:
        src = f.read()
    block = re.search(r"ONSAN_WEATHER_GROUP\s*=\s*\{(.*?)\}", src, re.S)
    if not block:
        print("[경고] ONSAN_WEATHER_GROUP 을 못 찾음 - 선석 기상 판정은 스냅샷에서 빠집니다")
        return []
    names = re.findall(r":\s*'([^']+)'", block.group(1))
    return list(dict.fromkeys(names))


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    snap, fails = {}, []

    for key, url in GETS.items():
        try:
            snap[key] = fetch(url)
            print(f"[OK] {key}")
        except Exception as e:
            fails.append(key)
            print(f"[실패] {key}: {e}")

    # 선석별 기상 판정 — 드롭다운 전 선석을 미리 받아둔다 (시연 동선 ②)
    groups = berth_groups()
    wx = {}
    for g in groups:
        try:
            wx[g] = post(f"{BACKEND}/weather/assess", {"berth_group": g})
            print(f"[OK] weather/assess {g}")
        except Exception as e:
            print(f"[실패] weather/assess {g}: {e}")
    snap["/api/v1/weather/assess"] = wx

    if not snap.get("/api/dashboard"):
        sys.exit("대시보드 응답을 못 받았습니다 - 관제시스템_시작.bat 으로 서버부터 켜세요")

    path = os.path.join(OUT, "snapshot.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(snap, f, ensure_ascii=False)
    size = os.path.getsize(path)
    print(f"\n생성 완료: {path} ({size:,} bytes)")
    if fails:
        print(f"못 받은 항목 {len(fails)}건: {', '.join(fails)} (해당 화면은 스냅샷에서 비어 보임)")


if __name__ == "__main__":
    main()

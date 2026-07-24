# -*- coding: utf-8 -*-
"""GET /api/dashboard 서버 — 두 트윈(React·Omniverse)의 공용 데이터 소스.

실수집 DB(smartport-postgres-dev, localhost:5433)가 켜져 있으면 실데이터를,
꺼져 있으면 mock 을 응답한다. 응답의 data_source 필드로 어느 쪽인지 표시.

  실데이터 사용 항목
  - weather      : mart.weather_now (기상청·조위·파고 실관측, 이영서 mart 뷰)
  - operations 중 접안 이력 : upa_port_call 온산 시설 실제 입출항 기록
  - stats        : 입출항 11,275건 등 수집 규모 통계
  mock 유지 항목
  - vessels      : 온산 데모 배치 (실 AIS 는 수집 시점 스냅샷이라 정적)
  - 진행 중 하역 작업 : 실시간 유량 센서 미수집 → 서버 시계 기반 mock 진행률

백엔드(FastAPI)가 완성되면 이 서버를 끄기만 하면 된다 (동일 계약).
실행: python dashboard_server.py  (포트 8000)
"""
import json
import math
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    import psycopg2
    HAS_PG = True
except ImportError:
    HAS_PG = False

START = time.time()
ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "backend", ".env")

_env_cache = None


def db_config():
    global _env_cache
    if _env_cache is None:
        env = {}
        try:
            with open(ENV_PATH, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if "=" in line and not line.startswith("#"):
                        k, v = line.split("=", 1)
                        env[k] = v
        except OSError:
            pass
        _env_cache = env
    e = _env_cache
    if not e.get("POSTGRES_DB"):
        return None
    return dict(host="localhost", port=5433, dbname=e["POSTGRES_DB"],
                user=e["POSTGRES_USER"], password=e["POSTGRES_PASSWORD"], connect_timeout=2)


# ─── mock 선박 (온산 데모 배치 — 지도/트윈 움직임용) ───
VESSELS = [
    {"port_call_id": "D7ABC_2026_001", "callsgn": "D7ABC", "vessel_name": "HMM GOODWILL",
     "mmsi": 440559000, "is_liquid_cargo_vessel": True, "latitude": 35.45661, "longitude": 129.35119,
     "sog": 0.1, "nav_status_category": "MOORED", "arrival_at_utc": "2026-07-18T22:40:00Z",
     "cargo": {"name": "에탄올", "un_no": "UN1170"}, "berth": "OTK 1부두"},
    {"port_call_id": "D8XYZ_2026_014", "callsgn": "D8XYZ", "vessel_name": "WOOYANG CHEMI",
     "mmsi": 440112000, "is_liquid_cargo_vessel": True, "latitude": 35.43778, "longitude": 129.36694,
     "sog": 0.0, "nav_status_category": "MOORED", "arrival_at_utc": "2026-07-19T01:10:00Z",
     "cargo": {"name": "자일렌", "un_no": "UN1307"}, "berth": "정일 1부두"},
    {"port_call_id": "V7GAS_2026_007", "callsgn": "V7GAS", "vessel_name": "GAS UTOPIA",
     "mmsi": 538007123, "is_liquid_cargo_vessel": True, "latitude": 35.4250, "longitude": 129.3900,
     "sog": 11.4, "nav_status_category": "UNDER_WAY", "arrival_at_utc": "2026-07-24T09:30:00Z",
     "cargo": {"name": "부타디엔", "un_no": "UN1010"}, "berth": "OTK 2부두"},
    {"port_call_id": "SUNVN_2026_003", "callsgn": "3FQP8", "vessel_name": "SUN VENUS",
     "mmsi": 371234000, "is_liquid_cargo_vessel": True, "latitude": 35.4280, "longitude": 129.4050,
     "sog": 0.2, "nav_status_category": "AT_ANCHOR", "arrival_at_utc": "2026-07-23T15:00:00Z",
     "cargo": {"name": "톨루엔", "un_no": "UN1294"}, "berth": None, "anchorage": "E2"},
    {"port_call_id": "ULPIO_2026_021", "callsgn": "D9PIO", "vessel_name": "ULSAN PIONEER",
     "mmsi": 440778000, "is_liquid_cargo_vessel": True, "latitude": 35.4320, "longitude": 129.3780,
     "sog": 8.6, "nav_status_category": "UNDER_WAY", "arrival_at_utc": "2026-07-22T20:00:00Z",
     "cargo": {"name": "가솔린", "un_no": "UN1203"}, "berth": "S-Oil 2부두"},
    {"port_call_id": "PGLRY_2026_009", "callsgn": "9VPG7", "vessel_name": "PACIFIC GLORY",
     "mmsi": 563556000, "is_liquid_cargo_vessel": True, "latitude": 35.45100, "longitude": 129.35600,
     "sog": 0.0, "nav_status_category": "MOORED", "arrival_at_utc": "2026-07-23T06:20:00Z",
     "cargo": {"name": "등유", "un_no": "UN1223"}, "berth": "S-Oil 1부두"},
    {"port_call_id": "KRSTU_2026_030", "callsgn": "9WKR3", "vessel_name": "KOTA RESTU",
     "mmsi": 533445000, "is_liquid_cargo_vessel": False, "latitude": 35.31, "longitude": 129.48,
     "sog": 13.8, "nav_status_category": "UNDER_WAY", "arrival_at_utc": "2026-07-24T11:00:00Z",
     "cargo": None},
    {"port_call_id": "SVSTR_2026_012", "callsgn": "HLSV2", "vessel_name": "SILVER STAR",
     "mmsi": 440334000, "is_liquid_cargo_vessel": False, "latitude": 35.40, "longitude": 129.47,
     "sog": 0.3, "nav_status_category": "AT_ANCHOR", "arrival_at_utc": "2026-07-23T10:45:00Z",
     "cargo": None},
]

MOCK_WEATHER = {
    "wind_speed_ms": 6.2, "wind_dir_deg": 335, "wave_height_sig_m": 0.8,
    "tide_level_cm": 120, "visibility_m": 19.8, "observed_at_utc": "2026-07-24T02:00:00Z",
}

ALERTS = [
    {"level": "DANGER", "type": "SEGREGATION",
     "message": "OTK 1부두: 메탄올-황산 혼재금지 (IMDG 격리 위반)",
     "port_call_id": "D7ABC_2026_001", "created_at_utc": "2026-07-24T01:55:00Z"},
    {"level": "WARNING", "type": "WEATHER",
     "message": "풍속 상승 추세 (현재 6.2m/s, 임계 14m/s)",
     "port_call_id": None, "created_at_utc": "2026-07-24T02:00:00Z"},
]

# ─── 진행 중 하역 작업 (mock — 실시간 유량 센서 미수집) ───
# begin_off/duration: 서버 기동 시각 기준 (시간). 진행률은 요청 시점 계산.
MOCK_JOBS = [
    {"job_id": "OP-2026-101", "vessel_name": "HMM GOODWILL", "berth": "OTK 1부두",
     "cargo": "에탄올", "un_no": "UN1170", "planned_tons": 12000, "begin_off": -3.0, "duration_h": 8.0},
    {"job_id": "OP-2026-102", "vessel_name": "WOOYANG CHEMI", "berth": "정일 1부두",
     "cargo": "자일렌", "un_no": "UN1307", "planned_tons": 7500, "begin_off": -1.5, "duration_h": 6.0},
    {"job_id": "OP-2026-103", "vessel_name": "PACIFIC GLORY", "berth": "S-Oil 1부두",
     "cargo": "등유", "un_no": "UN1223", "planned_tons": 9800, "begin_off": 2.0, "duration_h": 7.0},
]


def iso(ts):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ts))


def mock_jobs_now():
    now = time.time()
    out = []
    for j in MOCK_JOBS:
        begin = START + j["begin_off"] * 3600
        end = begin + j["duration_h"] * 3600
        progress = max(0.0, min(1.0, (now - begin) / (end - begin)))
        status = "PLANNED" if now < begin else ("COMPLETED" if now >= end else "IN_PROGRESS")
        out.append({
            "job_id": j["job_id"], "vessel_name": j["vessel_name"], "berth": j["berth"],
            "cargo": j["cargo"], "un_no": j["un_no"],
            "planned_tons": j["planned_tons"],
            "done_tons": round(j["planned_tons"] * progress),
            "progress_pct": round(progress * 100, 1),
            "status": status,
            "begin_utc": iso(begin), "end_utc": iso(end),
            "is_real_record": False,
        })
    return out


def fetch_real():
    """DB 에서 실데이터 조회. 실패 시 예외."""
    cfg = db_config()
    if not (HAS_PG and cfg):
        raise RuntimeError("db unavailable")
    conn = psycopg2.connect(**cfg)
    try:
        cur = conn.cursor()

        # 실관측 기상 (mart.weather_now — 이영서 mart 뷰)
        cur.execute("""SELECT wind_speed_ms, wind_dir_deg, wave_height_sig_m,
                              tide_level_cm, visibility_m, weather_observed_at_utc
                       FROM mart.weather_now""")
        w = cur.fetchone()
        weather = None
        if w and w[0] is not None:
            weather = {
                "wind_speed_ms": float(w[0]), "wind_dir_deg": int(w[1]),
                "wave_height_sig_m": float(w[2]) if w[2] is not None else None,
                "tide_level_cm": float(w[3]) if w[3] is not None else None,
                "visibility_m": float(w[4]) if w[4] is not None else None,
                "observed_at_utc": w[5].strftime("%Y-%m-%dT%H:%M:%SZ") if w[5] else None,
            }

        # 온산 선석 실제 접안 이력 (upa_port_call)
        cur.execute("""
            SELECT COALESCE(NULLIF(vessel_name, ''), NULLIF(vessel_name_en, ''), '(선명 미상)'),
                   facility_name, arrival_at_utc, departure_at_utc
            FROM upa_port_call
            WHERE (facility_name LIKE %s OR facility_name LIKE %s OR facility_name LIKE %s)
              AND arrival_at_utc IS NOT NULL AND departure_at_utc IS NOT NULL
              AND departure_at_utc > arrival_at_utc
            ORDER BY departure_at_utc DESC LIMIT 7
        """, ("%온산%", "%정일%", "%OTK%"))
        history = []
        for i, (vn, fac, arr, dep) in enumerate(cur.fetchall()):
            history.append({
                "job_id": f"REAL-{i}", "vessel_name": vn, "berth": fac,
                "cargo": None, "un_no": None, "planned_tons": None, "done_tons": None,
                "progress_pct": 100.0, "status": "COMPLETED",
                "begin_utc": arr.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "end_utc": dep.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "is_real_record": True,
            })

        # 수집 규모 통계
        cur.execute("SELECT COUNT(*) FROM upa_port_call")
        total_calls = cur.fetchone()[0]
        cur.execute("""SELECT COUNT(*) FROM upa_port_call
                       WHERE facility_name LIKE %s OR facility_name LIKE %s OR facility_name LIKE %s""",
                    ("%온산%", "%정일%", "%OTK%"))
        onsan_calls = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM ais_vessel_position")
        ais_rows = cur.fetchone()[0]
        stats = {"total_port_calls": total_calls, "onsan_port_calls": onsan_calls,
                 "ais_position_rows": ais_rows}
        return weather, history, stats
    finally:
        conn.close()


def current_vessels():
    t = time.time() - START
    u = (t % 1500.0) / 1500.0
    out = []
    for v in VESSELS:
        v2 = dict(v)
        if v["nav_status_category"] == "UNDER_WAY":
            v2["latitude"] = round(v["latitude"] + (35.452 - v["latitude"]) * u, 5)
            v2["longitude"] = round(v["longitude"] + (129.360 - v["longitude"]) * u, 5)
        out.append(v2)
    return out


_cache = {"t": 0.0, "payload": None}


def build_payload():
    if time.time() - _cache["t"] < 10 and _cache["payload"]:
        # 진행률·선박 위치는 캐시와 무관하게 갱신
        p = dict(_cache["payload"])
        p["vessels"] = current_vessels()
        p["operations"] = mock_jobs_now() + p.get("history_ops", [])
        return p
    weather, history, stats, src = None, [], None, {"weather": "MOCK", "history": "NONE", "stats": "NONE"}
    try:
        weather, history, stats = fetch_real()
        src = {"weather": "REAL" if weather else "MOCK",
               "history": "REAL" if history else "NONE",
               "stats": "REAL" if stats else "NONE"}
    except Exception:
        pass
    payload = {
        "weather": weather or MOCK_WEATHER,
        "alerts": ALERTS,
        "stats": stats,
        "data_source": src,
        "history_ops": history,
    }
    _cache["t"] = time.time()
    _cache["payload"] = payload
    p = dict(payload)
    p["vessels"] = current_vessels()
    p["operations"] = mock_jobs_now() + history
    return p


# ─────────────────────────────────────────────
# 물리 시뮬레이션 준정적 근사식 (8월 시나리오 S1·S2)
# 상수·수식은 digital-twin/physics/mooring_berthing_sim.py 의 PhysX
# 동역학 검증 스크립트와 동일 — 그쪽 결과로 이 근사식을 검증한다.
# 시나리오 입력=실측(풍속·파고·DWT), 물리 상수=공개 문헌(OCIMF 계열) 근사.
# ─────────────────────────────────────────────
def _vessel_particulars(dwt):
    loa = 8.6 * dwt ** 0.316
    freeboard = 0.02 * loa + 3.0
    return dict(loa=loa, area=0.75 * loa * (freeboard + 4.0), mass=dwt * 1000 * 1.35)


def _line_mbl_kn(dwt):
    return 392.0 if dwt < 20000 else (588.0 if dwt < 60000 else 784.0)


def sim_mooring(dwt, wind_ms, wave_m):
    p = _vessel_particulars(dwt)
    force = 0.5 * 1.225 * 1.0 * p["area"] * wind_ms ** 2
    eff = 2 * 0.9 + 4 * 0.25            # 계류삭 6가닥 횡하중 유효 분담
    daf = 1.0 + 0.35 * wave_m           # 파랑 동적증폭
    t_line_kn = force * daf / eff / 1000
    mbl = _line_mbl_kn(dwt)
    pct = t_line_kn / mbl * 100
    if pct < 30:
        verdict, action = "정상", "하역 계속 가능"
    elif pct < 50:
        verdict, action = "주의", "하역 중단 검토 (라인 텐딩 강화)"
    elif pct < 70:
        verdict, action = "경고", "이안 준비 권고"
    else:
        verdict, action = "위험", "즉시 호스분리·비상 이안"
    # 정상 한계 풍속 (장력 30% 도달 풍속 역산) [m/s]
    safe_wind = math.sqrt(0.30 * mbl * 1000 * eff /
                          (0.5 * 1.225 * p["area"] * daf))
    return {
        "line_tension_kn": round(t_line_kn, 1), "mbl_kn": mbl,
        "tension_pct": round(pct, 1), "verdict": verdict, "action": action,
        "safe_wind_limit_ms": round(safe_wind, 1),
        "model": "준정적 근사 (OCIMF 계열) — PhysX 검증 스크립트와 동일 상수",
    }


def sim_berthing(dwt, speed_ms):
    p = _vessel_particulars(dwt)
    energy_kj = 0.5 * 1.8 * p["mass"] * speed_ms ** 2 / 1000
    # 콘 펜더 정격 흡수에너지 근사: 2만 DWT급 ≈ 500 kJ 스케일
    cap_kj = 0.5 * dwt ** 0.7
    ratio = energy_kj / cap_kj * 100
    safe_v = math.sqrt(2 * cap_kj * 1000 / (1.8 * p["mass"]))
    verdict = "안전" if ratio < 60 else ("주의" if ratio < 100 else "펜더 용량 초과")
    return {
        "berthing_energy_kj": round(energy_kj, 1), "fender_capacity_kj": round(cap_kj, 1),
        "ratio_pct": round(ratio, 1), "safe_speed_ms": round(safe_v, 2),
        "safe_speed_kn": round(safe_v * 1.944, 2), "verdict": verdict,
        "model": "berthing energy 근사 (Cm=1.8)",
    }


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.startswith("/api/dashboard"):
            p = build_payload()
            p.pop("history_ops", None)
            self._send(200, p)
        else:
            self._send(404, {"detail": "not found"})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            self._send(400, {"detail": "invalid json"})
            return

        if self.path.startswith("/api/v1/sim/mooring"):
            self._send(200, sim_mooring(
                float(body.get("dwt", 20000)),
                float(body.get("wind_speed", 10)),
                float(body.get("wave_height", 0.5)),
            ))
        elif self.path.startswith("/api/v1/sim/berthing"):
            self._send(200, sim_berthing(
                float(body.get("dwt", 20000)),
                float(body.get("speed_ms", 0.15)),
            ))
        else:
            self._send(404, {"detail": "not found"})

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8000), Handler)
    print("dashboard server: http://127.0.0.1:8000/api/dashboard (실DB 연결 시 실데이터)")
    server.serve_forever()

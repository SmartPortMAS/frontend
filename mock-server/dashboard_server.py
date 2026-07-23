# -*- coding: utf-8 -*-
"""GET /api/dashboard mock 서버 — 두 트윈(React·Omniverse)의 공용 데이터 소스.

백엔드(FastAPI + mart.dashboard_current)가 완성되기 전까지 같은 포트(8000)에서
같은 계약으로 응답한다. 백엔드가 준비되면 이 서버를 끄기만 하면 된다.

- 항해 중(UNDER_WAY) 선박은 서버 시간 기준으로 온산항 방향 이동 (25분 주기 왕복)
- 실행: python dashboard_server.py  (포트 8000)
"""
import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

START = time.time()

# frontend src/mocks/mockDashboard.js 와 동일한 선박 상태
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
     "sog": 11.4, "nav_status_category": "UNDER_WAY", "arrival_at_utc": "2026-07-19T09:30:00Z",
     "cargo": {"name": "부타디엔", "un_no": "UN1010"}, "berth": "OTK 2부두"},
    {"port_call_id": "SUNVN_2026_003", "callsgn": "3FQP8", "vessel_name": "SUN VENUS",
     "mmsi": 371234000, "is_liquid_cargo_vessel": True, "latitude": 35.4280, "longitude": 129.4050,
     "sog": 0.2, "nav_status_category": "AT_ANCHOR", "arrival_at_utc": "2026-07-18T15:00:00Z",
     "cargo": {"name": "톨루엔", "un_no": "UN1294"}, "berth": None, "anchorage": "E2"},
    {"port_call_id": "ULPIO_2026_021", "callsgn": "D9PIO", "vessel_name": "ULSAN PIONEER",
     "mmsi": 440778000, "is_liquid_cargo_vessel": True, "latitude": 35.4320, "longitude": 129.3780,
     "sog": 8.6, "nav_status_category": "UNDER_WAY", "arrival_at_utc": "2026-07-17T20:00:00Z",
     "cargo": {"name": "가솔린", "un_no": "UN1203"}, "berth": "S-Oil 2부두"},
    {"port_call_id": "PGLRY_2026_009", "callsgn": "9VPG7", "vessel_name": "PACIFIC GLORY",
     "mmsi": 563556000, "is_liquid_cargo_vessel": True, "latitude": 35.45100, "longitude": 129.35600,
     "sog": 0.0, "nav_status_category": "MOORED", "arrival_at_utc": "2026-07-18T06:20:00Z",
     "cargo": {"name": "등유", "un_no": "UN1223"}, "berth": "S-Oil 1부두"},
    {"port_call_id": "KRSTU_2026_030", "callsgn": "9WKR3", "vessel_name": "KOTA RESTU",
     "mmsi": 533445000, "is_liquid_cargo_vessel": False, "latitude": 35.31, "longitude": 129.48,
     "sog": 13.8, "nav_status_category": "UNDER_WAY", "arrival_at_utc": "2026-07-19T11:00:00Z",
     "cargo": None},
    {"port_call_id": "SVSTR_2026_012", "callsgn": "HLSV2", "vessel_name": "SILVER STAR",
     "mmsi": 440334000, "is_liquid_cargo_vessel": False, "latitude": 35.40, "longitude": 129.47,
     "sog": 0.3, "nav_status_category": "AT_ANCHOR", "arrival_at_utc": "2026-07-18T10:45:00Z",
     "cargo": None},
]

WEATHER = {
    "wind_speed_ms": 6.2, "wind_dir_deg": 335, "wave_height_sig_m": 0.8,
    "tide_level_cm": 120, "visibility_m": 19.8, "observed_at_utc": "2026-07-23T13:00:00Z",
}

ALERTS = [
    {"level": "DANGER", "type": "SEGREGATION",
     "message": "OTK 1부두: 메탄올-황산 혼재금지 (IMDG 격리 위반)",
     "port_call_id": "D7ABC_2026_001", "created_at_utc": "2026-07-23T12:55:00Z"},
    {"level": "WARNING", "type": "WEATHER",
     "message": "풍속 상승 추세 (현재 6.2m/s, 임계 14m/s)",
     "port_call_id": None, "created_at_utc": "2026-07-23T13:00:00Z"},
]


def current_vessels():
    """항해 중 선박은 온산항(35.452, 129.360) 방향으로 25분 주기 왕복 이동."""
    t = time.time() - START
    u = (t % 1500.0) / 1500.0  # 0→1 반복
    out = []
    for v in VESSELS:
        v2 = dict(v)
        if v["nav_status_category"] == "UNDER_WAY":
            v2["latitude"] = round(v["latitude"] + (35.452 - v["latitude"]) * u, 5)
            v2["longitude"] = round(v["longitude"] + (129.360 - v["longitude"]) * u, 5)
        out.append(v2)
    return out


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
            self._send(200, {"vessels": current_vessels(), "weather": WEATHER, "alerts": ALERTS})
        else:
            self._send(404, {"detail": "not found"})

    def log_message(self, *args):
        pass  # 콘솔 스팸 방지


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8000), Handler)
    print("mock dashboard server: http://127.0.0.1:8000/api/dashboard")
    server.serve_forever()

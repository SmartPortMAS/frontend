# -*- coding: utf-8 -*-
"""온산항 액체화물 부두 물리 검증 시뮬레이션 (Isaac Sim PhysX, 헤드리스 배치).

시나리오
  S1 계류 안정성: 선체 강체 + 계류삭 6가닥(스프링-댐퍼) + 풍하중
     → 30초 동역학 시뮬레이션으로 계류삭 최대 장력 측정
  S2 접안 충돌 : 접안 속도로 진입하는 선체가 펜더(스프링)에 접촉
     → 최대 펜더 반력·흡수 에너지 측정

목적: dashboard_server 의 준정적 근사식(/api/v1/sim/*)이 내는 값을
     PhysX 동역학 결과와 비교·검증한다 (근사식의 물리적 근거 확보).

입력 전제 (발표 시 명시):
  - 시나리오 입력(DWT·풍속·파고·접안속도)은 실수집/실측 값 사용
  - 물리 상수(계류삭 강성·MBL, 펜더 강성, 풍압면적 계수)는 공개 문헌
    (OCIMF MEG4, 펜더 제조사 규격) 기반 근사값 — 아래 CONSTANTS 참고

실행 (Isaac Sim 동봉 파이썬):
  D:\\isaacsim\\python.bat mooring_berthing_sim.py --dwt 20000 --wind 17 --wave 1.0
결과: JSON (stdout 마지막 줄) — 준정적 근사식 결과와 병기
"""
import argparse
import json
import math

# ── 공학 근사 상수 (문헌 기반 — dashboard_server 와 동일해야 함) ──
RHO_AIR = 1.225          # kg/m^3
CD_WIND = 1.0            # 횡풍 항력계수 (블러프 보디)
CM_BERTHING = 1.8        # 부가수질량 계수 (횡접안)
DT = 1.0 / 60.0
SIM_SECONDS = 30.0


def vessel_particulars(dwt):
    """DWT → 개략 제원 (탱커 통계 회귀 근사)."""
    loa = 8.6 * dwt ** 0.316            # 전장 [m]
    beam = loa / 6.2
    freeboard = 0.02 * loa + 3.0
    lateral_area = 0.75 * loa * (freeboard + 4.0)   # 횡풍압 면적(선체+상부구조) [m^2]
    mass = dwt * 1000 * 1.35            # 만재배수량 근사 [kg]
    return dict(loa=loa, beam=beam, area=lateral_area, mass=mass)


def line_mbl_kn(dwt):
    """계류삭 최소파단하중 근사 (MEG4 계열 관행값)."""
    if dwt < 20000:
        return 392.0    # 40 tf
    if dwt < 60000:
        return 588.0    # 60 tf
    return 784.0        # 80 tf


def wind_force_n(wind_ms, area):
    return 0.5 * RHO_AIR * CD_WIND * area * wind_ms ** 2


# ─────────────────────────────────────────────
# 준정적 근사식 (dashboard_server /api/v1/sim/mooring 과 동일 로직)
# ─────────────────────────────────────────────
def quasi_static_mooring(dwt, wind_ms, wave_m):
    p = vessel_particulars(dwt)
    F = wind_force_n(wind_ms, p["area"])
    # 6가닥 중 횡하중 유효 분담: 브레스트 2가닥 x 0.9 + 스프링/헤드 4가닥 x 0.25
    eff = 2 * 0.9 + 4 * 0.25
    daf = 1.0 + 0.35 * wave_m           # 파랑 동적증폭
    t_line = F * daf / eff
    mbl = line_mbl_kn(dwt) * 1000
    pct = t_line / mbl * 100
    return dict(line_tension_kn=t_line / 1000, mbl_kn=mbl / 1000, tension_pct=pct)


def quasi_static_berthing(dwt, speed_ms):
    p = vessel_particulars(dwt)
    e = 0.5 * CM_BERTHING * p["mass"] * speed_ms ** 2 / 1000.0   # kJ
    cap = 0.5 * dwt ** 0.7                                       # 펜더 정격 흡수 [kJ] 근사 (2만DWT≈500kJ)
    safe_v = math.sqrt(2 * cap * 1000 / (CM_BERTHING * p["mass"]))
    return dict(energy_kj=e, fender_capacity_kj=cap, ratio_pct=e / cap * 100, safe_speed_ms=safe_v)


# ─────────────────────────────────────────────
# PhysX 동역학 검증 (Isaac Sim 필요)
# ─────────────────────────────────────────────
def run_physx(dwt, wind_ms, wave_m, berth_speed_ms):
    from isaacsim import SimulationApp
    app = SimulationApp({"headless": True})
    import numpy as np
    from isaacsim.core.api import World
    from isaacsim.core.api.objects import DynamicCuboid, FixedCuboid

    p = vessel_particulars(dwt)
    world = World(stage_units_in_meters=1.0, physics_dt=DT)
    world.scene.add_default_ground_plane()

    # ── S1: 계류 선체 + 계류삭 6가닥 ──
    ship = world.scene.add(DynamicCuboid(
        prim_path="/World/Ship", name="ship",
        position=np.array([0.0, 0.0, 2.0]),
        scale=np.array([p["beam"], p["loa"], 4.0]),
        mass=p["mass"],
    ))
    # 계류점(부두측 고정 앵커)과 선체측 페어리드 (횡방향 -x 가 부두)
    L = p["loa"]
    anchors = [(-p["beam"] / 2 - 12, -L * 0.45), (-p["beam"] / 2 - 12, L * 0.45),
               (-p["beam"] / 2 - 10, -L * 0.15), (-p["beam"] / 2 - 10, L * 0.15),
               (-p["beam"] / 2 - 14, -L * 0.30), (-p["beam"] / 2 - 14, L * 0.30)]
    fairleads = [(-p["beam"] / 2, -L * 0.42), (-p["beam"] / 2, L * 0.42),
                 (-p["beam"] / 2, -L * 0.12), (-p["beam"] / 2, L * 0.12),
                 (-p["beam"] / 2, -L * 0.28), (-p["beam"] / 2, L * 0.28)]
    K_LINE = 8.0e5      # 계류삭 강성 [N/m] (와이어+테일 복합 근사)
    C_LINE = 5.0e4      # 감쇠

    wind_f = wind_force_n(wind_ms, p["area"]) * (1.0 + 0.35 * wave_m)
    world.reset()

    max_tension = 0.0
    rest_lens = None
    steps = int(SIM_SECONDS / DT)
    for i in range(steps):
        pos, _ = ship.get_world_pose()
        vel = ship.get_linear_velocity()
        if rest_lens is None:
            rest_lens = [math.hypot(pos[0] + fl[0] - a[0], pos[1] + fl[1] - a[1])
                         for a, fl in zip(anchors, fairleads)]
        total = np.zeros(3)
        for k, (a, fl) in enumerate(zip(anchors, fairleads)):
            fx = pos[0] + fl[0] - a[0]
            fy = pos[1] + fl[1] - a[1]
            dist = math.hypot(fx, fy)
            stretch = dist - rest_lens[k]
            if stretch > 0:
                t = K_LINE * stretch + C_LINE * max(0.0, (vel[0] * fx + vel[1] * fy) / max(dist, 1e-6))
                max_tension = max(max_tension, t)
                total[0] -= t * fx / dist
                total[1] -= t * fy / dist
        total[0] += wind_f    # 횡풍 (+x, 부두 반대 방향으로 밀어냄)
        ship.apply_forces(total)   # 매 스텝 외력 적용 (isaacsim.core RigidPrim API)
        world.step(render=False)

    # ── S2: 접안 충돌 (별도 선체가 펜더 벽으로 진입) ──
    wall = world.scene.add(FixedCuboid(
        prim_path="/World/Fender", name="fender",
        position=np.array([300.0, 0.0, 2.0]), scale=np.array([2.0, 60.0, 6.0])))
    ship2 = world.scene.add(DynamicCuboid(
        prim_path="/World/Ship2", name="ship2",
        position=np.array([300.0 + 30.0, 0.0, 2.0]),
        scale=np.array([p["beam"], p["loa"], 4.0]), mass=p["mass"]))
    world.reset()
    ship2.set_linear_velocity(np.array([-berth_speed_ms, 0.0, 0.0]))
    K_FENDER = 3.0e6
    max_fender = 0.0
    for i in range(int(10.0 / DT)):
        pos2, _ = ship2.get_world_pose()
        pen = (300.0 + 1.0 + p["beam"] / 2) - pos2[0]
        if pen > 0:
            f = K_FENDER * pen
            max_fender = max(max_fender, f)
            ship2.apply_forces(np.array([f, 0.0, 0.0]))
        world.step(render=False)

    app.close()
    fender_energy = 0.5 * max_fender ** 2 / K_FENDER / 1000.0   # kJ (스프링 에너지)
    return dict(physx_max_line_tension_kn=max_tension / 1000.0,
                physx_fender_energy_kj=fender_energy)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dwt", type=float, default=20000)
    ap.add_argument("--wind", type=float, default=17.0)
    ap.add_argument("--wave", type=float, default=1.0)
    ap.add_argument("--berth-speed", type=float, default=0.15)
    ap.add_argument("--no-physx", action="store_true", help="근사식만 계산 (Isaac 불필요)")
    a = ap.parse_args()

    result = {
        "input": vars(a),
        "quasi_static_mooring": quasi_static_mooring(a.dwt, a.wind, a.wave),
        "quasi_static_berthing": quasi_static_berthing(a.dwt, a.berth_speed),
    }
    if not a.no_physx:
        try:
            result["physx"] = run_physx(a.dwt, a.wind, a.wave, a.berth_speed)
        except Exception as e:  # Isaac 미설치 환경 등
            result["physx_error"] = str(e)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()

/**
 * 울산항 위경도를 3D 공간의 X, Z 좌표로 변환하는 유틸리티
 */

// 울산항 시뮬레이터 중심 기준점 (울산본항 중심)
const CENTER_LAT = 35.5000;
const CENTER_LON = 129.3800;

// 스케일 팩터 (위도/경도 1도당 3D 공간 거리)
// 1도는 약 111km. 0.01도는 약 1.11km.
// 화면에서 1.1km가 약 100 유닛이 되도록 스케일링. (1도 = 10000)
const SCALE_X = 10000;
const SCALE_Z = -10000; // 위도(북)가 커질수록 화면의 -Z 방향으로 가도록 설정

/**
 * 위도/경도를 3D 벡터(x, 0, z) 형태로 변환합니다.
 * @param {number} lat - 위도
 * @param {number} lon - 경도
 * @returns {Array} [x, y, z] 배열
 */
export function convertLatLonToVector3(lat, lon) {
  if (lat == null || lon == null) return [0, 0, 0];
  
  const x = (lon - CENTER_LON) * SCALE_X;
  const z = (lat - CENTER_LAT) * SCALE_Z;
  
  return [x, 0, z];
}

// 실제 울산항의 지리적 만(Bay) 형태를 모사한 정밀 위경도 매핑
export const BERTHS = {
  "B001": { lat: 35.495, lon: 129.370, name: "OTK 1부두" },
  "B002": { lat: 35.498, lon: 129.372, name: "OTK 2부두" },
  "B003": { lat: 35.502, lon: 129.375, name: "OTK 3부두" },
  "B004": { lat: 35.505, lon: 129.380, name: "정일 1터미널" },
  "B005": { lat: 35.506, lon: 129.385, name: "정일 2터미널" },
  "B006": { lat: 35.504, lon: 129.390, name: "현대오일 부두" },
  "B007": { lat: 35.499, lon: 129.395, name: "SK에너지 부두" },
  "B008": { lat: 35.492, lon: 129.398, name: "S-OIL 부두" },
};

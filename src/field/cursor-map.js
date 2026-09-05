/**
 * 필드 1 의 커서 자리를 필드 2 의 자리로 옮기는 규칙.
 *
 * 두 필드는 같은 지형 좌표를 쓰지만 개체는 각자의 시간으로 배회하고(worldTime 이 다르다), 필드 1 은
 * 폐허(Ghost Forest) 표면 위에, 필드 2 는 절차적 지형 위에 개체를 얹어 높이도 다르다. 그래서 개체 근처에서는
 * "그 개체로부터의 오프셋"을 지킨다: 필드 1 에서 NO.2 의 등 위에 있던 커서는 필드 2 에서도 NO.2 의 등 위에
 * 놓인다. 개체에서 멀면 옮기지 않는다(anchored 0 — 받는 쪽은 그때 화면 좌표를 그대로 쓴다). 사이는 거리 가중.
 */

/**
 * 개체 밑동 기준 반경(월드 단위). 개체 폭이 5~6, 배회 반경이 1~2.3 이므로 그보다 넉넉하게.
 * 개체 중심 간격은 x 30 / z 22 라 서로 겹치지 않는다.
 */
export const ANCHOR_RADIUS = 9;

/**
 * @param {{ x: number, z: number, h?: number }} point
 *   필드 1 커서의 월드 xz 와, 개체 표면이면 그 개체 밑동 위 높이 h (지형이면 0)
 * @param {Array<{ id: string, x: number, z: number }>} fromAnchors 그 순간 필드 1 의 개체 밑동 위치
 * @param {Array<{ id: string, x: number, y: number, z: number }>} toAnchors 이쪽(필드 2) 개체 밑동 위치
 * @param {{ hover?: string | null, groundHeight?: (x: number, z: number) => number }} [options]
 *   hover 가 있으면(커서가 그 개체 표면에 얹혀 있으면) 가중 없이 그 개체에 정확히 붙인다.
 *   groundHeight 는 개체에서 멀 때의 y 에만 쓰인다.
 * @returns {{ x: number, y: number, z: number, anchored: number }}
 *   anchored 0 = 개체와 무관(옮기지 않음) … 1 = 개체에 완전히 붙음. y 는 이쪽 개체 밑동 높이(가중 평균) + h.
 */
export function mapCursorToPeer(point, fromAnchors, toAnchors, { hover = null, groundHeight = () => 0 } = {}) {
  const toById = new Map(toAnchors.map((anchor) => [anchor.id, anchor]));
  const lift = Math.max(0, point.h ?? 0);

  if (hover) {
    const from = fromAnchors.find((anchor) => anchor.id === hover);
    const to = toById.get(hover);
    if (from && to) {
      return { x: to.x + (point.x - from.x), y: to.y + lift, z: to.z + (point.z - from.z), anchored: 1 };
    }
  }

  let shiftX = 0;
  let shiftZ = 0;
  let baseY = 0;
  let total = 0;
  for (const from of fromAnchors) {
    const to = toById.get(from.id);
    if (!to) continue;
    const distance = Math.hypot(point.x - from.x, point.z - from.z);
    const weight = Math.max(0, 1 - distance / ANCHOR_RADIUS) ** 2;
    if (weight <= 0) continue;
    shiftX += weight * (to.x - from.x);
    shiftZ += weight * (to.z - from.z);
    baseY += weight * to.y;
    total += weight;
  }
  if (total > 0) {
    baseY /= total;
    if (total > 1) {
      shiftX /= total;
      shiftZ /= total;
    }
  }
  const x = point.x + shiftX;
  const z = point.z + shiftZ;
  return { x, y: (total > 0 ? baseY : groundHeight(x, z)) + lift, z, anchored: Math.min(1, total) };
}

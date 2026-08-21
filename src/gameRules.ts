export type Player = 1 | 2;

export type BoardBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type Point = {
  x: number;
  y: number;
};

export const otherPlayer = (player: Player): Player => (player === 1 ? 2 : 1);

/** 駒の半分以上が盤外なら、円の中心は盤の境界上または外側にある。 */
export const isPieceDropped = (position: Point, board: BoardBounds): boolean =>
  position.x <= board.left ||
  position.x >= board.right ||
  position.y <= board.top ||
  position.y >= board.bottom;

export const calculateShotVelocity = (
  start: Point,
  end: Point,
  maxDrag: number,
  maxSpeed: number,
): Point => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);

  if (distance === 0 || maxDrag <= 0) {
    return { x: 0, y: 0 };
  }

  const speed = Math.min(distance / maxDrag, 1) * maxSpeed;
  return {
    x: (dx / distance) * speed,
    y: (dy / distance) * speed,
  };
};

export const getWinner = (remaining: Record<Player, number>): Player | null => {
  if (remaining[1] === 0 && remaining[2] > 0) return 2;
  if (remaining[2] === 0 && remaining[1] > 0) return 1;
  return null;
};

import { describe, expect, it } from "vitest";
import { calculateShotVelocity, getWinner, isPieceDropped, otherPlayer } from "./gameRules";

const board = { left: 10, top: 10, right: 100, bottom: 100 };

describe("isPieceDropped", () => {
  it("中心が盤内なら駒は残る", () => {
    expect(isPieceDropped({ x: 50, y: 50 }, board)).toBe(false);
  });

  it("中心が境界に達すると半分以上が盤外になり落ちる", () => {
    expect(isPieceDropped({ x: 10, y: 50 }, board)).toBe(true);
    expect(isPieceDropped({ x: 101, y: 50 }, board)).toBe(true);
  });
});

describe("calculateShotVelocity", () => {
  it("ドラッグの方向と距離を速度へ変換する", () => {
    expect(calculateShotVelocity({ x: 0, y: 0 }, { x: 30, y: 40 }, 100, 20)).toEqual({
      x: 6,
      y: 8,
    });
  });

  it("最大速度を超えない", () => {
    expect(calculateShotVelocity({ x: 0, y: 0 }, { x: 200, y: 0 }, 100, 20)).toEqual({
      x: 20,
      y: 0,
    });
  });
});

describe("ターンと勝敗", () => {
  it("手番を交代する", () => {
    expect(otherPlayer(1)).toBe(2);
    expect(otherPlayer(2)).toBe(1);
  });

  it("相手の駒をすべて落としたプレイヤーが勝つ", () => {
    expect(getWinner({ 1: 4, 2: 0 })).toBe(1);
    expect(getWinner({ 1: 0, 2: 3 })).toBe(2);
    expect(getWinner({ 1: 2, 2: 2 })).toBeNull();
  });
});

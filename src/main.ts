import {
  Bodies,
  Body,
  Composite,
  Engine,
  Events,
  type IBodyDefinition,
  Runner,
  Vector,
} from "matter-js";
import "./style.css";
import {
  type BoardBounds,
  calculateShotVelocity,
  getWinner,
  isPieceDropped,
  otherPlayer,
  type Player,
  type Point,
} from "./gameRules";

type Piece = {
  body: Body;
  owner: Player;
  label: string;
};

const PIECE_ROWS = [
  ["香", "桂", "銀", "金", "王", "金", "銀", "桂", "香"],
  ["", "飛", "", "", "", "", "", "角", ""],
  ["歩", "歩", "歩", "歩", "歩", "歩", "歩", "歩", "歩"],
] as const;

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("アプリの表示先が見つかりません。");

app.innerHTML = `
  <div class="page-shell">
    <header class="site-header">
      <a class="brand" href="/" aria-label="Shogi Otoshi ホーム">
        <span class="brand-mark" aria-hidden="true">王</span>
        <span>Shogi Otoshi</span>
      </a>
      <nav class="header-actions" aria-label="サイトメニュー">
        <a class="icon-button" href="https://x.com/JADENgygo" target="_blank" rel="noreferrer" aria-label="XでJADENgygoを見る">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.9 2H22l-6.77 7.74L23.2 22h-6.24l-4.89-6.39L6.48 22H3.36l7.26-8.3L2.98 2h6.4l4.42 5.84L18.9 2Zm-1.1 17.84h1.73L8.44 4.05H6.59L17.8 19.84Z"/></svg>
        </a>
        <button class="icon-button" id="theme-toggle" type="button" aria-label="ダークモードに切り替える">
          <span class="sun" aria-hidden="true">☀</span><span class="moon" aria-hidden="true">☾</span>
        </button>
      </nav>
    </header>

    <main>
      <section class="hero">
        <p class="eyebrow">盤上から、弾き出せ。</p>
        <h1>Shogi <em>Otoshi</em></h1>
        <p>駒をドラッグして狙いを定め、相手の駒をすべて落とそう。</p>
      </section>

      <section class="game-card" aria-labelledby="turn-label">
        <div class="game-status">
          <div>
            <span class="status-dot" aria-hidden="true"></span>
            <span id="turn-label">1P のターン</span>
          </div>
          <div class="piece-counts" aria-label="残り駒数">
            <span><i class="count-chip p1"></i>1P <b id="p1-count">20</b></span>
            <span><i class="count-chip p2"></i>2P <b id="p2-count">20</b></span>
          </div>
        </div>
        <div class="canvas-wrap">
          <canvas id="game-canvas" aria-label="将棋落としのゲーム盤"></canvas>
          <div class="result-panel" id="result-panel" hidden>
            <p class="result-kicker">勝負あり</p>
            <h2 id="result-title">1P の勝ち！</h2>
            <button id="play-again" type="button">もう一度遊ぶ</button>
          </div>
        </div>
        <p class="game-hint"><span aria-hidden="true">↗</span> 自分の駒をドラッグ。長く引くほど強く飛びます。</p>
      </section>
    </main>

    <footer>© 2026 Shogi Otoshi <span class="footer-dot">・</span> 友達と一緒に、一本勝負。</footer>
  </div>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
const turnLabel = document.querySelector<HTMLSpanElement>("#turn-label");
const p1Count = document.querySelector<HTMLElement>("#p1-count");
const p2Count = document.querySelector<HTMLElement>("#p2-count");
const resultPanel = document.querySelector<HTMLDivElement>("#result-panel");
const resultTitle = document.querySelector<HTMLHeadingElement>("#result-title");
const playAgain = document.querySelector<HTMLButtonElement>("#play-again");
const themeToggle = document.querySelector<HTMLButtonElement>("#theme-toggle");

if (
  !canvas ||
  !turnLabel ||
  !p1Count ||
  !p2Count ||
  !resultPanel ||
  !resultTitle ||
  !playAgain ||
  !themeToggle
) {
  throw new Error("ゲームの初期化に必要な要素が見つかりません。");
}

const context = canvas.getContext("2d");
if (!context) throw new Error("Canvasを利用できません。");

const engine = Engine.create({ gravity: { x: 0, y: 0 } });
const runner = Runner.create();
let pieces: Piece[] = [];
let currentPlayer: Player = 1;
let board: BoardBounds = { left: 0, top: 0, right: 0, bottom: 0 };
let boardSize = 0;
let pieceRadius = 0;
let selectedPiece: Piece | null = null;
let dragStart: Point | null = null;
let dragCurrent: Point | null = null;
let shotInProgress = false;
let settledFrames = 0;
let winner: Player | null = null;
let animationFrame = 0;

const bodyOptions: IBodyDefinition = {
  friction: 0.08,
  frictionAir: 0.027,
  restitution: 0.76,
  density: 0.003,
};

const getCanvasPoint = (event: PointerEvent): Point => {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
};

const pieceAt = (point: Point): Piece | null => {
  for (let index = pieces.length - 1; index >= 0; index -= 1) {
    const piece = pieces[index];
    if (piece && Vector.magnitude(Vector.sub(piece.body.position, point)) <= pieceRadius * 1.15) {
      return piece;
    }
  }
  return null;
};

const updateStatus = (): void => {
  const remaining: Record<Player, number> = {
    1: pieces.filter((piece) => piece.owner === 1).length,
    2: pieces.filter((piece) => piece.owner === 2).length,
  };
  p1Count.textContent = String(remaining[1]);
  p2Count.textContent = String(remaining[2]);
  winner = getWinner(remaining);

  if (winner) {
    turnLabel.textContent = `${winner}P の勝利`;
    resultTitle.textContent = `${winner}P の勝ち！`;
    resultPanel.hidden = false;
  } else {
    turnLabel.textContent = shotInProgress
      ? "駒が止まるのを待っています…"
      : `${currentPlayer}P のターン`;
  }
};

const removeDroppedPieces = (): void => {
  const dropped = pieces.filter((piece) => isPieceDropped(piece.body.position, board));
  if (dropped.length === 0) return;
  for (const piece of dropped) Composite.remove(engine.world, piece.body);
  const droppedBodies = new Set(dropped.map((piece) => piece.body));
  pieces = pieces.filter((piece) => !droppedBodies.has(piece.body));
  updateStatus();
};

const createPieces = (): void => {
  pieces = [];
  const cell = boardSize / 9;
  pieceRadius = cell * 0.31;

  const addRow = (owner: Player, row: readonly string[], rowIndex: number): void => {
    row.forEach((label, column) => {
      if (!label) return;
      const x = board.left + cell * (column + 0.5);
      const y =
        owner === 2 ? board.top + cell * (rowIndex + 0.5) : board.bottom - cell * (rowIndex + 0.5);
      const body = Bodies.circle(x, y, pieceRadius * 0.9, bodyOptions);
      pieces.push({ body, owner, label });
      Composite.add(engine.world, body);
    });
  };

  PIECE_ROWS.forEach((row, index) => {
    addRow(2, row, index);
    addRow(1, row, index);
  });
};

const resetGame = (): void => {
  Composite.clear(engine.world, false, true);
  currentPlayer = 1;
  shotInProgress = false;
  settledFrames = 0;
  selectedPiece = null;
  winner = null;
  resultPanel.hidden = true;
  createPieces();
  updateStatus();
};

const resizeCanvas = (): void => {
  const cssSize = Math.min(canvas.parentElement?.clientWidth ?? 720, 720);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = `${cssSize}px`;
  canvas.style.height = `${cssSize}px`;
  canvas.width = Math.round(cssSize * dpr);
  canvas.height = Math.round(cssSize * dpr);
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const previousSize = boardSize;
  boardSize = cssSize * 0.86;
  const inset = (cssSize - boardSize) / 2;
  const previousBoard = board;
  board = { left: inset, top: inset, right: inset + boardSize, bottom: inset + boardSize };

  if (pieces.length === 0) {
    resetGame();
  } else if (previousSize > 0) {
    for (const piece of pieces) {
      const relativeX = (piece.body.position.x - previousBoard.left) / previousSize;
      const relativeY = (piece.body.position.y - previousBoard.top) / previousSize;
      Body.setPosition(piece.body, {
        x: board.left + relativeX * boardSize,
        y: board.top + relativeY * boardSize,
      });
      Body.scale(piece.body, boardSize / previousSize, boardSize / previousSize);
    }
    pieceRadius *= boardSize / previousSize;
  }
};

const drawBoard = (): void => {
  const cell = boardSize / 9;
  context.save();
  context.shadowColor = "rgba(35, 22, 12, 0.2)";
  context.shadowBlur = 24;
  context.shadowOffsetY = 10;
  context.fillStyle = "#dca958";
  context.fillRect(board.left, board.top, boardSize, boardSize);
  context.restore();

  const gradient = context.createLinearGradient(board.left, board.top, board.right, board.bottom);
  gradient.addColorStop(0, "#edc77d");
  gradient.addColorStop(0.5, "#dca858");
  gradient.addColorStop(1, "#c98b3f");
  context.fillStyle = gradient;
  context.fillRect(board.left, board.top, boardSize, boardSize);

  context.strokeStyle = "rgba(75, 42, 18, 0.72)";
  context.lineWidth = Math.max(1, boardSize / 520);
  for (let index = 0; index <= 9; index += 1) {
    const offset = index * cell;
    context.beginPath();
    context.moveTo(board.left + offset, board.top);
    context.lineTo(board.left + offset, board.bottom);
    context.moveTo(board.left, board.top + offset);
    context.lineTo(board.right, board.top + offset);
    context.stroke();
  }
  context.strokeStyle = "#573117";
  context.lineWidth = Math.max(2, boardSize / 240);
  context.strokeRect(board.left, board.top, boardSize, boardSize);
};

const drawPiece = (piece: Piece): void => {
  const { x, y } = piece.body.position;
  const angle = piece.body.angle + (piece.owner === 2 ? Math.PI : 0);
  const radius = pieceRadius;
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.shadowColor = "rgba(30, 18, 10, 0.32)";
  context.shadowBlur = radius * 0.25;
  context.shadowOffsetY = radius * 0.14;
  context.beginPath();
  context.moveTo(0, -radius);
  context.lineTo(radius * 0.8, -radius * 0.48);
  context.lineTo(radius * 0.68, radius * 0.78);
  context.lineTo(-radius * 0.68, radius * 0.78);
  context.lineTo(-radius * 0.8, -radius * 0.48);
  context.closePath();
  context.fillStyle = piece.owner === 1 ? "#f4d693" : "#4b2717";
  context.fill();
  context.shadowColor = "transparent";
  context.strokeStyle = piece.owner === 1 ? "#7d471f" : "#e4b766";
  context.lineWidth = Math.max(1.2, radius * 0.06);
  context.stroke();
  context.fillStyle = piece.owner === 1 ? "#2d1b11" : "#fff0c5";
  context.font = `700 ${radius * 0.9}px "Yu Mincho", "Hiragino Mincho ProN", serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(piece.label, 0, radius * 0.08);
  context.restore();
};

const drawAim = (): void => {
  if (!selectedPiece || !dragStart || !dragCurrent) return;
  const maxDrag = boardSize * 0.28;
  const dx = dragCurrent.x - dragStart.x;
  const dy = dragCurrent.y - dragStart.y;
  const distance = Math.min(Math.hypot(dx, dy), maxDrag);
  const angle = Math.atan2(dy, dx);
  const end = {
    x: dragStart.x + Math.cos(angle) * distance,
    y: dragStart.y + Math.sin(angle) * distance,
  };
  context.save();
  context.setLineDash([8, 7]);
  context.strokeStyle = "#e85c3d";
  context.lineWidth = Math.max(3, boardSize / 180);
  context.beginPath();
  context.moveTo(dragStart.x, dragStart.y);
  context.lineTo(end.x, end.y);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = "#e85c3d";
  context.beginPath();
  context.arc(end.x, end.y, 5 + (distance / maxDrag) * 5, 0, Math.PI * 2);
  context.fill();
  context.restore();
};

const render = (): void => {
  const width = canvas.clientWidth;
  context.clearRect(0, 0, width, width);
  drawBoard();
  for (const piece of pieces) drawPiece(piece);
  drawAim();
  animationFrame = requestAnimationFrame(render);
};

canvas.addEventListener("pointerdown", (event) => {
  if (shotInProgress || winner) return;
  const point = getCanvasPoint(event);
  const piece = pieceAt(point);
  if (!piece || piece.owner !== currentPlayer) return;
  selectedPiece = piece;
  dragStart = { ...piece.body.position };
  dragCurrent = point;
  canvas.setPointerCapture(event.pointerId);
  canvas.classList.add("is-aiming");
});

canvas.addEventListener("pointermove", (event) => {
  if (!selectedPiece) return;
  dragCurrent = getCanvasPoint(event);
});

const releaseShot = (event: PointerEvent): void => {
  if (!selectedPiece || !dragStart) return;
  const end = getCanvasPoint(event);
  const velocity = calculateShotVelocity(dragStart, end, boardSize * 0.28, boardSize * 0.031);
  if (Math.hypot(velocity.x, velocity.y) > 0.6) {
    Body.setVelocity(selectedPiece.body, velocity);
    shotInProgress = true;
    settledFrames = 0;
    updateStatus();
  }
  selectedPiece = null;
  dragStart = null;
  dragCurrent = null;
  canvas.classList.remove("is-aiming");
};

canvas.addEventListener("pointerup", releaseShot);
canvas.addEventListener("pointercancel", releaseShot);

Events.on(engine, "afterUpdate", () => {
  removeDroppedPieces();
  if (!shotInProgress || winner) return;
  const moving = pieces.some(
    (piece) => piece.body.speed > 0.12 || Math.abs(piece.body.angularSpeed) > 0.08,
  );
  settledFrames = moving ? 0 : settledFrames + 1;
  if (settledFrames >= 14) {
    for (const piece of pieces) {
      Body.setVelocity(piece.body, { x: 0, y: 0 });
      Body.setAngularVelocity(piece.body, 0);
    }
    currentPlayer = otherPlayer(currentPlayer);
    shotInProgress = false;
    settledFrames = 0;
    updateStatus();
  }
});

const setTheme = (theme: "light" | "dark"): void => {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("shogi-otoshi-theme", theme);
  themeToggle.setAttribute(
    "aria-label",
    theme === "dark" ? "ライトモードに切り替える" : "ダークモードに切り替える",
  );
};

const storedTheme = localStorage.getItem("shogi-otoshi-theme");
setTheme(
  storedTheme === "dark" ||
    (storedTheme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches)
    ? "dark"
    : "light",
);
themeToggle.addEventListener("click", () => {
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});
playAgain.addEventListener("click", resetGame);

const resizeObserver = new ResizeObserver(resizeCanvas);
resizeObserver.observe(canvas.parentElement ?? canvas);
Runner.run(runner, engine);
render();

window.addEventListener("beforeunload", () => {
  cancelAnimationFrame(animationFrame);
  Runner.stop(runner);
  resizeObserver.disconnect();
});

"use strict";

/* ------------------------------------------------------------------ *
 * Battleship — vanilla JS, single player vs AI
 * ------------------------------------------------------------------ */

const BOARD_SIZE = 10;
// How long the AI "thinks" before each shot, so its turns are easy to follow.
const AI_MOVE_DELAY_MS = 2000;
const SHIPS = [
  { name: "Carrier", size: 5 },
  { name: "Battleship", size: 4 },
  { name: "Cruiser", size: 3 },
  { name: "Submarine", size: 3 },
  { name: "Destroyer", size: 2 },
];

// Cell states used in the logical board grids.
const EMPTY = 0;
const SHIP = 1;
const MISS = 2;
const HIT = 3;
// Auto-revealed buffer cell around a sunk ship — guaranteed empty, so it is
// locked out for both players (no one can fire there).
const BLOCKED = 4;

/* ------------------------------------------------------------------ *
 * Game state
 * ------------------------------------------------------------------ */
function createState() {
  return {
    phase: "setup", // "setup" | "battle" | "over"
    orientation: "H", // "H" | "V"
    selectedShipIndex: null,
    playerBoard: makeGrid(),
    enemyBoard: makeGrid(),
    playerShips: [], // {name,size,cells:[{r,c}],hits:number}
    enemyShips: [],
    playerTurn: true,
    locked: false, // prevents input while AI is resolving
    ai: createAIState(),
  };
}

function makeGrid() {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => EMPTY)
  );
}

let state = createState();

/* ------------------------------------------------------------------ *
 * DOM references
 * ------------------------------------------------------------------ */
const els = {
  setup: document.getElementById("setup"),
  battle: document.getElementById("battle"),
  shipTray: document.getElementById("ship-tray"),
  setupBoard: document.getElementById("setup-board"),
  enemyBoard: document.getElementById("enemy-board"),
  playerBoard: document.getElementById("player-board"),
  orientationBtn: document.getElementById("orientation-btn"),
  randomBtn: document.getElementById("random-btn"),
  resetPlacementBtn: document.getElementById("reset-placement-btn"),
  startBtn: document.getElementById("start-btn"),
  message: document.getElementById("message"),
  playerScore: document.getElementById("player-score"),
  enemyScore: document.getElementById("enemy-score"),
  playAgainBtn: document.getElementById("play-again-btn"),
};

/* ------------------------------------------------------------------ *
 * Geometry helpers
 * ------------------------------------------------------------------ */
function inBounds(r, c) {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

// Returns the list of cells a ship would occupy, or null if out of bounds.
function shipCells(r, c, size, orientation) {
  const cells = [];
  for (let i = 0; i < size; i++) {
    const rr = orientation === "V" ? r + i : r;
    const cc = orientation === "H" ? c + i : c;
    if (!inBounds(rr, cc)) return null;
    cells.push({ r: rr, c: cc });
  }
  return cells;
}

// Can a ship occupy these cells? Requires the cells to be empty AND a one-square
// buffer (including diagonals) free of any other ship — ships may not touch.
function canPlace(grid, cells) {
  if (!cells) return false;
  return cells.every(({ r, c }) => {
    if (grid[r][c] !== EMPTY) return false;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr;
        const cc = c + dc;
        if (inBounds(rr, cc) && grid[rr][cc] === SHIP) return false;
      }
    }
    return true;
  });
}

/* ------------------------------------------------------------------ *
 * Ship placement
 * ------------------------------------------------------------------ */
function placeShip(grid, shipList, def, r, c, orientation) {
  const cells = shipCells(r, c, def.size, orientation);
  if (!canPlace(grid, cells)) return false;
  cells.forEach(({ r, c }) => {
    grid[r][c] = SHIP;
  });
  shipList.push({ name: def.name, size: def.size, cells, hits: 0 });
  return true;
}

function randomizeFleet(grid, shipList) {
  // Reset
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++) grid[r][c] = EMPTY;
  shipList.length = 0;

  for (const def of SHIPS) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 1000) {
      attempts++;
      const orientation = Math.random() < 0.5 ? "H" : "V";
      const r = Math.floor(Math.random() * BOARD_SIZE);
      const c = Math.floor(Math.random() * BOARD_SIZE);
      placed = placeShip(grid, shipList, def, r, c, orientation);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */
function buildBoard(container, { onCellClick, onCellEnter, onCellLeave } = {}) {
  container.innerHTML = "";
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.r = String(r);
      cell.dataset.c = String(c);
      if (onCellClick) cell.addEventListener("click", () => onCellClick(r, c));
      if (onCellEnter) cell.addEventListener("mouseenter", () => onCellEnter(r, c));
      if (onCellLeave) cell.addEventListener("mouseleave", () => onCellLeave(r, c));
      container.appendChild(cell);
    }
  }
}

function cellAt(container, r, c) {
  return container.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
}

// Render the player's own board: show ships, hits, misses.
function renderOwnBoard(container, grid, ships) {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = cellAt(container, r, c);
      cell.className = "cell";
      const v = grid[r][c];
      if (v === SHIP) cell.classList.add("ship");
      else if (v === MISS) cell.classList.add("miss");
      else if (v === HIT) cell.classList.add("hit");
      else if (v === BLOCKED) cell.classList.add("blocked");
    }
  }
  markSunk(container, ships);
}

// Render the enemy board from the attacker's perspective: hide unhit ships.
function renderEnemyBoard(container, grid, ships) {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = cellAt(container, r, c);
      cell.className = "cell";
      const v = grid[r][c];
      if (v === MISS) {
        cell.classList.add("miss");
        cell.classList.add("fired");
      } else if (v === HIT) {
        cell.classList.add("hit");
        cell.classList.add("fired");
      } else if (v === BLOCKED) {
        cell.classList.add("blocked");
        cell.classList.add("fired");
      }
      // EMPTY and (unhit) SHIP both render as plain water.
    }
  }
  markSunk(container, ships);
}

function markSunk(container, ships) {
  for (const ship of ships) {
    if (ship.hits >= ship.size) {
      for (const { r, c } of ship.cells) {
        const cell = cellAt(container, r, c);
        if (cell) {
          cell.classList.remove("hit");
          // Keep "fired" so sunk enemy cells stay non-clickable / cursor stays.
          cell.classList.add("sunk", "fired");
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * Setup phase UI
 * ------------------------------------------------------------------ */
function renderTray() {
  els.shipTray.innerHTML = "";
  SHIPS.forEach((def, idx) => {
    const placed = state.playerShips.some((s) => s.name === def.name);
    const item = document.createElement("div");
    item.className = "tray-ship";
    if (placed) item.classList.add("placed");
    if (state.selectedShipIndex === idx) item.classList.add("selected");

    const label = document.createElement("span");
    label.textContent = `${def.name} (${def.size})`;
    const pips = document.createElement("span");
    pips.className = "pips";
    for (let i = 0; i < def.size; i++) {
      const pip = document.createElement("span");
      pip.className = "pip";
      pips.appendChild(pip);
    }
    item.appendChild(label);
    item.appendChild(pips);

    if (!placed) {
      item.addEventListener("click", () => {
        state.selectedShipIndex = idx;
        renderTray();
      });
    }
    els.shipTray.appendChild(item);
  });

  els.startBtn.disabled = state.playerShips.length !== SHIPS.length;
}

function previewPlacement(r, c) {
  clearPreview();
  if (state.selectedShipIndex === null) return;
  const def = SHIPS[state.selectedShipIndex];
  const cells = shipCells(r, c, def.size, state.orientation);
  const valid = canPlace(state.playerBoard, cells);
  if (!cells) {
    // Out of bounds: highlight just the anchor cell as invalid.
    const anchor = cellAt(els.setupBoard, r, c);
    if (anchor) anchor.classList.add("invalid");
    return;
  }
  cells.forEach(({ r, c }) => {
    const cell = cellAt(els.setupBoard, r, c);
    cell.classList.add(valid ? "preview" : "invalid");
  });
}

function clearPreview() {
  els.setupBoard.querySelectorAll(".preview, .invalid").forEach((cell) => {
    cell.classList.remove("preview", "invalid");
  });
}

function handleSetupClick(r, c) {
  if (state.selectedShipIndex === null) {
    setMessage("Select a ship from the tray first.");
    return;
  }
  const def = SHIPS[state.selectedShipIndex];
  const ok = placeShip(
    state.playerBoard,
    state.playerShips,
    def,
    r,
    c,
    state.orientation
  );
  if (!ok) {
    setMessage("Can't place there — out of bounds or overlapping.");
    return;
  }
  state.selectedShipIndex = null;
  clearPreview();
  renderOwnBoard(els.setupBoard, state.playerBoard, state.playerShips);
  renderTray();
}

function setMessage(text) {
  els.message.textContent = text;
}

/* ------------------------------------------------------------------ *
 * Battle phase
 * ------------------------------------------------------------------ */
function startGame() {
  if (state.playerShips.length !== SHIPS.length) return;

  randomizeFleet(state.enemyBoard, state.enemyShips);

  state.phase = "battle";
  state.playerTurn = true;
  state.locked = false;

  els.setup.classList.add("hidden");
  els.battle.classList.remove("hidden");
  els.playAgainBtn.classList.add("hidden");

  buildBoard(els.enemyBoard, { onCellClick: handlePlayerShot });
  buildBoard(els.playerBoard);

  renderEnemyBoard(els.enemyBoard, state.enemyBoard, state.enemyShips);
  renderOwnBoard(els.playerBoard, state.playerBoard, state.playerShips);

  updateScore();
  setMessage("Your turn — fire at the enemy waters!");
}

function findShipAt(ships, r, c) {
  return ships.find((s) => s.cells.some((cell) => cell.r === r && cell.c === c));
}

// Apply a shot to a grid/ship list. Returns "miss" | "hit" | "sunk" | "repeat".
function applyShot(grid, ships, r, c) {
  const v = grid[r][c];
  if (v === MISS || v === HIT || v === BLOCKED) return "repeat";
  if (v === SHIP) {
    grid[r][c] = HIT;
    const ship = findShipAt(ships, r, c);
    ship.hits++;
    if (ship.hits >= ship.size) {
      blockAroundShip(grid, ship);
      return "sunk";
    }
    return "hit";
  }
  grid[r][c] = MISS;
  return "miss";
}

// Once a ship is sunk, reveal its surrounding ring (guaranteed empty by the
// no-touching placement rule) as BLOCKED so neither side wastes a shot there.
function blockAroundShip(grid, ship) {
  for (const { r, c } of ship.cells) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr;
        const cc = c + dc;
        // Also recolor any earlier miss in the ring — it is the same
        // guaranteed-empty water, so it should read as blocked, not a miss.
        if (inBounds(rr, cc) && (grid[rr][cc] === EMPTY || grid[rr][cc] === MISS)) {
          grid[rr][cc] = BLOCKED;
        }
      }
    }
  }
}

function shipsRemaining(ships) {
  return ships.filter((s) => s.hits < s.size).length;
}

function updateScore() {
  els.playerScore.textContent = `Enemy ships left: ${shipsRemaining(
    state.enemyShips
  )}`;
  els.enemyScore.textContent = `Your ships left: ${shipsRemaining(
    state.playerShips
  )}`;
}

function handlePlayerShot(r, c) {
  if (state.phase !== "battle" || !state.playerTurn || state.locked) return;

  const result = applyShot(state.enemyBoard, state.enemyShips, r, c);
  if (result === "repeat") {
    setMessage("You already fired there. Pick another cell.");
    return;
  }

  renderEnemyBoard(els.enemyBoard, state.enemyBoard, state.enemyShips);
  updateScore();

  if (result === "sunk") {
    const ship = findShipAt(state.enemyShips, r, c);
    setMessage(`Direct hit! You sank the enemy ${ship.name}! Fire again.`);
  } else if (result === "hit") {
    setMessage("Hit! Fire again.");
  } else {
    setMessage("Miss.");
  }

  if (shipsRemaining(state.enemyShips) === 0) {
    endGame(true);
    return;
  }

  // A hit (or sink) earns another shot; only a miss ends the player's turn.
  if (result === "miss") {
    state.playerTurn = false;
    state.locked = true;
    setTimeout(aiTurn, AI_MOVE_DELAY_MS);
  }
}

/* ------------------------------------------------------------------ *
 * AI opponent — hunt / target strategy
 * ------------------------------------------------------------------ */
function createAIState() {
  return {
    targets: [], // queued cells to try after a hit
    hits: [], // current run of hits on the ship being chased
  };
}

function aiTurn() {
  const { r, c } = chooseAIShot();
  const result = applyShot(state.playerBoard, state.playerShips, r, c);

  renderOwnBoard(els.playerBoard, state.playerBoard, state.playerShips);
  updateScore();

  if (result === "hit" || result === "sunk") {
    state.ai.hits.push({ r, c });
    if (result === "sunk") {
      const ship = findShipAt(state.playerShips, r, c);
      // Drop the sunk ship's cells from the hit run and start hunting fresh.
      state.ai.hits = state.ai.hits.filter(
        (h) => !ship.cells.some((cell) => cell.r === h.r && cell.c === h.c)
      );
      state.ai.targets = [];
      // Re-seed targets from any leftover hits on a still-floating ship.
      if (state.ai.hits.length > 0) {
        const last = state.ai.hits[state.ai.hits.length - 1];
        queueAdjacentTargets(last.r, last.c);
      }
      setMessage(`The enemy sank your ${ship.name}!`);
    } else {
      queueAdjacentTargets(r, c);
      setMessage("The enemy hit your ship!");
    }
  } else {
    setMessage("The enemy missed.");
  }

  if (shipsRemaining(state.playerShips) === 0) {
    endGame(false);
    return;
  }

  // A hit (or sink) earns the AI another shot; only a miss returns the turn.
  if (result === "miss") {
    state.playerTurn = true;
    state.locked = false;
  } else {
    setTimeout(aiTurn, AI_MOVE_DELAY_MS);
  }
}

function chooseAIShot() {
  // Target mode: pull from the queue, skipping already-fired cells.
  while (state.ai.targets.length > 0) {
    const t = state.ai.targets.shift();
    if (isFireable(state.playerBoard, t.r, t.c)) return t;
  }

  // Hunt mode: checkerboard parity to find ships efficiently.
  const candidates = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (isFireable(state.playerBoard, r, c) && (r + c) % 2 === 0) {
        candidates.push({ r, c });
      }
    }
  }
  // Fallback: any remaining cell (when parity cells are exhausted).
  if (candidates.length === 0) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (isFireable(state.playerBoard, r, c)) candidates.push({ r, c });
      }
    }
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function isFireable(grid, r, c) {
  if (!inBounds(r, c)) return false;
  const v = grid[r][c];
  return v !== MISS && v !== HIT && v !== BLOCKED;
}

function queueAdjacentTargets(r, c) {
  const hits = state.ai.hits;
  let neighbors;

  if (hits.length >= 2) {
    // We know the ship's orientation — extend along that line only and drop
    // any stale perpendicular targets queued from the very first hit.
    const sameRow = hits.every((h) => h.r === hits[0].r);
    if (sameRow) {
      const row = hits[0].r;
      const cols = hits.map((h) => h.c);
      const min = Math.min(...cols);
      const max = Math.max(...cols);
      neighbors = [
        { r: row, c: min - 1 },
        { r: row, c: max + 1 },
      ];
      state.ai.targets = state.ai.targets.filter((t) => t.r === row);
    } else {
      const col = hits[0].c;
      const rows = hits.map((h) => h.r);
      const min = Math.min(...rows);
      const max = Math.max(...rows);
      neighbors = [
        { r: min - 1, c: col },
        { r: max + 1, c: col },
      ];
      state.ai.targets = state.ai.targets.filter((t) => t.c === col);
    }
  } else {
    neighbors = [
      { r: r - 1, c },
      { r: r + 1, c },
      { r, c: c - 1 },
      { r, c: c + 1 },
    ];
  }

  for (const n of neighbors) {
    if (isFireable(state.playerBoard, n.r, n.c)) {
      // Avoid queuing duplicates.
      if (!state.ai.targets.some((t) => t.r === n.r && t.c === n.c)) {
        state.ai.targets.push(n);
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * End game
 * ------------------------------------------------------------------ */
function endGame(playerWon) {
  state.phase = "over";
  state.locked = true;
  state.playerTurn = false;
  setMessage(
    playerWon
      ? "Victory! You sank the entire enemy fleet. 🎉"
      : "Defeat. The enemy sank your fleet. 💥"
  );
  els.playAgainBtn.classList.remove("hidden");
}

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */
function resetToSetup() {
  state = createState();
  initSetup();
}

function initSetup() {
  els.battle.classList.add("hidden");
  els.setup.classList.remove("hidden");
  els.playAgainBtn.classList.add("hidden");

  buildBoard(els.setupBoard, {
    onCellClick: handleSetupClick,
    onCellEnter: previewPlacement,
    onCellLeave: clearPreview,
  });
  renderOwnBoard(els.setupBoard, state.playerBoard, state.playerShips);
  renderTray();
  els.orientationBtn.textContent =
    state.orientation === "H" ? "Orientation: Horizontal" : "Orientation: Vertical";
  setMessage("Place your fleet to begin.");
}

els.orientationBtn.addEventListener("click", () => {
  state.orientation = state.orientation === "H" ? "V" : "H";
  els.orientationBtn.textContent =
    state.orientation === "H" ? "Orientation: Horizontal" : "Orientation: Vertical";
});

els.randomBtn.addEventListener("click", () => {
  randomizeFleet(state.playerBoard, state.playerShips);
  state.selectedShipIndex = null;
  renderOwnBoard(els.setupBoard, state.playerBoard, state.playerShips);
  renderTray();
});

els.resetPlacementBtn.addEventListener("click", () => {
  state.playerBoard = makeGrid();
  state.playerShips = [];
  state.selectedShipIndex = null;
  renderOwnBoard(els.setupBoard, state.playerBoard, state.playerShips);
  renderTray();
});

els.startBtn.addEventListener("click", startGame);
els.playAgainBtn.addEventListener("click", resetToSetup);

// Boot.
initSetup();

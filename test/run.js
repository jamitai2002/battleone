"use strict";
const { sandbox } = require("./harness");
const T = sandbox.__test;

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("  ok  -", name); }
  else { fail++; console.log("FAIL  -", name); }
}

/* 1. Grid + geometry */
const g = T.makeGrid();
check("grid is 10x10", g.length === 10 && g.every((row) => row.length === 10));
check("shipCells horizontal in bounds", T.shipCells(0, 0, 5, "H").length === 5);
check("shipCells off right edge -> null", T.shipCells(0, 7, 5, "H") === null);
check("shipCells off bottom edge -> null", T.shipCells(7, 0, 5, "V") === null);

/* 2. Placement + overlap */
const ships = [];
check("place first ship ok", T.placeShip(g, ships, { name: "A", size: 3 }, 0, 0, "H"));
check("overlap rejected", !T.placeShip(g, ships, { name: "B", size: 3 }, 0, 0, "V"));
check("adjacent placement allowed", T.placeShip(g, ships, { name: "C", size: 2 }, 1, 0, "H"));

/* 3. Randomize produces full, non-overlapping fleet */
const rg = T.makeGrid();
const rships = [];
T.randomizeFleet(rg, rships);
check("randomize places all 5 ships", rships.length === 5);
const occupied = rg.flat().filter((v) => v === T.SHIP).length;
const expected = T.SHIPS.reduce((s, d) => s + d.size, 0);
check("randomize occupies exactly sum(sizes) cells (no overlap)", occupied === expected);

/* 4. applyShot results */
const sg = T.makeGrid();
const sships = [];
T.placeShip(sg, sships, { name: "Destroyer", size: 2 }, 5, 5, "H");
check("shot on empty = miss", T.applyShot(sg, sships, 0, 0) === "miss");
check("shot on ship = hit", T.applyShot(sg, sships, 5, 5) === "hit");
check("repeat shot detected", T.applyShot(sg, sships, 5, 5) === "repeat");
check("final shot = sunk", T.applyShot(sg, sships, 5, 6) === "sunk");
check("shipsRemaining drops to 0", T.shipsRemaining(sships) === 0);

/* 5. Full battle sim: player auto-fires whole board, should win */
T.state = T.createState();
// give player a valid fleet so startGame proceeds
T.randomizeFleet(T.state.playerBoard, T.state.playerShips);
T.startGame();
check("phase is battle after start", T.state.phase === "battle");
check("enemy fleet generated", T.state.enemyShips.length === 5);

// Player fires at every cell -> must sink all enemy ships and win.
outer:
for (let r = 0; r < 10; r++) {
  for (let c = 0; c < 10; c++) {
    if (T.state.phase !== "battle") break outer;
    T.state.playerTurn = true;
    T.state.locked = false;
    T.handlePlayerShot(r, c);
  }
}
check("player wins after firing all cells", T.state.phase === "over");

/* 6. AI never throws and always fires a valid cell across a full game */
T.state = T.createState();
T.randomizeFleet(T.state.playerBoard, T.state.playerShips);
T.startGame();
let aiShots = 0, aiError = null;
try {
  while (T.state.phase === "battle" && aiShots < 200) {
    const shot = T.chooseAIShot();
    check.__last = shot;
    if (!T.isFireable(T.state.playerBoard, shot.r, shot.c)) {
      throw new Error(`AI chose unfireable cell ${shot.r},${shot.c}`);
    }
    T.aiTurn();
    aiShots++;
  }
} catch (e) { aiError = e; }
check("AI completes a full game without errors", aiError === null);
check("AI sinks player fleet within 100 shots", aiShots <= 100 && T.state.phase === "over");

/* 7. Stress: 300 full games, AI must always terminate without errors and
 *    never fire an already-fired cell (covers touching-ship edge cases). */
let stressError = null;
let maxAiShots = 0;
try {
  for (let game = 0; game < 300; game++) {
    T.state = T.createState();
    T.randomizeFleet(T.state.playerBoard, T.state.playerShips);
    T.startGame();
    let shots = 0;
    while (T.state.phase === "battle" && shots < 200) {
      const s = T.chooseAIShot();
      if (!T.isFireable(T.state.playerBoard, s.r, s.c)) {
        throw new Error(`game ${game}: AI re-fired ${s.r},${s.c}`);
      }
      T.aiTurn();
      shots++;
    }
    if (T.state.phase !== "over") throw new Error(`game ${game}: did not finish`);
    maxAiShots = Math.max(maxAiShots, shots);
  }
} catch (e) { stressError = e; }
check("300-game AI stress: no errors, all finish", stressError === null);
console.log("   (worst-case AI shots to win:", maxAiShots + ")");

/* 8. Place-after-placed guard: tray ship cannot be double-placed */
T.state = T.createState();
const def0 = T.SHIPS[0];
check("place ship A once", T.placeShip(T.state.playerBoard, T.state.playerShips, def0, 0, 0, "H"));
const before = T.state.playerShips.length;
T.placeShip(T.state.playerBoard, T.state.playerShips, def0, 0, 0, "H"); // overlap -> rejected
check("overlapping re-place rejected (count unchanged)", T.state.playerShips.length === before);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

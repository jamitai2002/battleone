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
// Buffer rule: ships may not touch, including diagonally.
check("orthogonally adjacent placement rejected", !T.placeShip(g, ships, { name: "C", size: 2 }, 1, 0, "H"));
check("diagonally adjacent placement rejected", !T.placeShip(g, ships, { name: "D", size: 2 }, 1, 3, "H"));
check("placement with 1-square gap allowed", T.placeShip(g, ships, { name: "E", size: 2 }, 2, 0, "H"));

/* 3. Randomize produces full, non-overlapping fleet */
const rg = T.makeGrid();
const rships = [];
T.randomizeFleet(rg, rships);
check("randomize places all 5 ships", rships.length === 5);
const occupied = rg.flat().filter((v) => v === T.SHIP).length;
const expected = T.SHIPS.reduce((s, d) => s + d.size, 0);
check("randomize occupies exactly sum(sizes) cells (no overlap)", occupied === expected);

// Buffer integrity: no cell of one ship may be 8-adjacent to a different ship.
function buffersRespected(ships) {
  for (let i = 0; i < ships.length; i++) {
    for (let j = i + 1; j < ships.length; j++) {
      for (const a of ships[i].cells) {
        for (const b of ships[j].cells) {
          if (Math.abs(a.r - b.r) <= 1 && Math.abs(a.c - b.c) <= 1) return false;
        }
      }
    }
  }
  return true;
}
let buffersOk = true;
for (let i = 0; i < 200; i++) {
  const tg = T.makeGrid(); const ts = [];
  T.randomizeFleet(tg, ts);
  if (ts.length !== 5 || !buffersRespected(ts)) { buffersOk = false; break; }
}
check("randomize never lets ships touch (200 fleets, incl. diagonal)", buffersOk);

/* 4. applyShot results */
const sg = T.makeGrid();
const sships = [];
T.placeShip(sg, sships, { name: "Destroyer", size: 2 }, 5, 5, "H");
check("shot on empty = miss", T.applyShot(sg, sships, 0, 0) === "miss");
check("shot on ship = hit", T.applyShot(sg, sships, 5, 5) === "hit");
check("repeat shot detected", T.applyShot(sg, sships, 5, 5) === "repeat");
check("final shot = sunk", T.applyShot(sg, sships, 5, 6) === "sunk");
check("shipsRemaining drops to 0", T.shipsRemaining(sships) === 0);

/* 4b. Sinking a ship blocks its surrounding ring */
// Destroyer occupies (5,5)-(5,6). Its 8-neighbour ring should now be BLOCKED.
const ring = [
  [4, 4], [4, 5], [4, 6], [4, 7],
  [5, 4], [5, 7],
  [6, 4], [6, 5], [6, 6], [6, 7],
];
check("sunk ship blocks its full surrounding ring",
  ring.every(([r, c]) => sg[r][c] === T.BLOCKED));
check("ship cells themselves are HIT not BLOCKED",
  sg[5][5] === T.HIT && sg[5][6] === T.HIT);
check("blocked cells are not fireable", !T.isFireable(sg, 4, 5));
check("firing a blocked cell returns repeat", T.applyShot(sg, sships, 4, 5) === "repeat");
// A pre-existing miss inside the ring is recolored to BLOCKED on sink.
const mg = T.makeGrid();
const mships = [];
T.placeShip(mg, mships, { name: "Destroyer", size: 2 }, 5, 5, "H");
T.applyShot(mg, mships, 4, 5); // miss adjacent to ship
T.applyShot(mg, mships, 5, 5);
T.applyShot(mg, mships, 5, 6); // sink
check("existing miss inside a sunk ship's ring becomes blocked", mg[4][5] === T.BLOCKED);
// A miss outside the ring is untouched.
const og = T.makeGrid();
const oships = [];
T.placeShip(og, oships, { name: "Destroyer", size: 2 }, 5, 5, "H");
T.applyShot(og, oships, 0, 0); // miss far from ship
T.applyShot(og, oships, 5, 5);
T.applyShot(og, oships, 5, 6); // sink
check("miss outside the ring stays a miss", og[0][0] === T.MISS);

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

/* 8b. Repositioning a placed ship during setup */
T.state = T.createState();
T.state.phase = "setup";
// Place the Carrier (index 0), then pick it up and move it elsewhere.
T.state.selectedShipIndex = 0;
T.handleSetupClick(0, 0); // place Carrier at row 0
check("ship placed during setup", T.state.playerShips.some((s) => s.name === T.SHIPS[0].name));
check("placement clears selection", T.state.selectedShipIndex === null);
// Empty hand: clicking an occupied cell picks the ship back up.
T.handleSetupClick(0, 0);
check("clicking a placed ship picks it back up",
  !T.state.playerShips.some((s) => s.name === T.SHIPS[0].name) &&
  T.state.selectedShipIndex === 0);
check("picked-up ship's cells are cleared from the board",
  T.state.playerBoard[0][0] === T.EMPTY);
// Drop it in a new location.
T.handleSetupClick(5, 0);
const movedShip = T.state.playerShips.find((s) => s.name === T.SHIPS[0].name);
check("ship can be re-placed in a new spot",
  movedShip && movedShip.cells.every((c) => c.r === 5));

/* 9. Turn rules: keep firing on hit/sunk, lose turn only on a miss */
T.state = T.createState();
T.state.phase = "battle";
T.placeShip(T.state.enemyBoard, T.state.enemyShips, { name: "E", size: 3 }, 0, 0, "H");
T.placeShip(T.state.playerBoard, T.state.playerShips, { name: "P", size: 2 }, 9, 0, "H");
T.state.playerTurn = true;
T.state.locked = false;
T.handlePlayerShot(0, 0); // hit (ship not sunk)
check("player keeps turn after a hit", T.state.playerTurn === true && T.state.locked === false);
T.handlePlayerShot(5, 5); // miss
check("player loses turn after a miss", T.state.playerTurn === false && T.state.locked === true);

// AI keeps firing on a hit, yields on a miss.
T.state = T.createState();
T.state.phase = "battle";
T.placeShip(T.state.enemyBoard, T.state.enemyShips, { name: "E", size: 2 }, 9, 0, "H");
T.placeShip(T.state.playerBoard, T.state.playerShips, { name: "P", size: 3 }, 0, 0, "H");
T.state.playerTurn = false;
T.state.locked = true;
// Force the AI to fire at a known player-ship cell (a hit).
T.state.ai.targets = [{ r: 0, c: 0 }];
T.aiTurn();
check("AI keeps turn after a hit (still player-locked)",
  T.state.playerTurn === false && T.state.locked === true);
// Force the AI to fire at empty water (a miss).
T.state.ai.targets = [{ r: 5, c: 5 }];
T.aiTurn();
check("AI yields turn after a miss", T.state.playerTurn === true && T.state.locked === false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

# Bug Report

This document lists the notable bugs found while building and debugging the
Battleship game, and how each was fixed. Bugs were surfaced through a headless
test harness (`test/run.js`, 22 checks including a 300-game AI stress run) and
through manual play in the browser.

---

### Bug 1 — AI wasted shots on cells that couldn't belong to the target ship

**Symptom:** Once the AI scored two hits in a line (so the ship's orientation
was known), it kept firing at the *perpendicular* neighbours it had queued from
the very first hit. These cells can never be part of that ship, so the AI threw
away turns and felt much weaker than it should.

**Cause:** When the first hit landed, the AI queued all four neighbours
(up/down/left/right). After a second, collinear hit it added the correct
in-line extensions but never removed the now-impossible perpendicular cells
from the target queue.

**Fix:** In `queueAdjacentTargets`, once the orientation is known
(`hits.length >= 2`), the queue is filtered down to the ship's line:

```js
// horizontal run -> keep only same-row targets
state.ai.targets = state.ai.targets.filter((t) => t.r === row);
// vertical run   -> keep only same-col targets
state.ai.targets = state.ai.targets.filter((t) => t.c === col);
```

---

### Bug 2 — AI got confused when two ships were touching

**Symptom:** Ships are allowed to sit next to each other. When the AI sank a
ship whose hits sat adjacent to a *second*, still-floating ship, it cleared its
entire hit history and target queue — losing track of the damage it had already
done to the neighbour and reverting to slow random hunting.

**Cause:** On a `"sunk"` result the code did `state.ai.hits = []`
unconditionally, discarding hits that belonged to the adjacent surviving ship.

**Fix:** On a sink, only the sunk ship's own cells are removed from the hit run;
any leftover hits re-seed the target queue so the AI keeps chasing the wounded
neighbour:

```js
state.ai.hits = state.ai.hits.filter(
  (h) => !ship.cells.some((cell) => cell.r === h.r && cell.c === h.c)
);
if (state.ai.hits.length > 0) {
  const last = state.ai.hits[state.ai.hits.length - 1];
  queueAdjacentTargets(last.r, last.c);
}
```

A 300-game automated stress test now confirms the AI always finishes a game and
never fires at an already-targeted cell.

> Note: a later change (Bug 6) forbids ships from touching at all, so this
> situation can no longer arise in play — but the defensive fix is kept.

---

### Bug 3 — Sunk enemy cells became "clickable" again

**Symptom:** After an enemy ship was sunk, its cells showed the crosshair
cursor again and registered clicks (which did nothing but were confusing),
because the per-render reset wiped the `fired` marker from sunk cells.

**Cause:** `renderEnemyBoard` resets every cell's classes on each render and
re-adds `fired` only for `MISS`/`HIT` cells. `markSunk` then converted hit cells
to `sunk` *without* re-adding `fired`, so sunk cells looked interactive.

**Fix:** `markSunk` now keeps the `fired` class on sunk cells:

```js
cell.classList.add("sunk", "fired");
```

---

### Bug 4 — Out-of-bounds placement preview crashed / mismarked cells

**Symptom:** Hovering a ship near the right or bottom edge during setup could
reference grid cells outside the board.

**Cause:** `shipCells` returns `null` when a ship would extend off the board,
but the preview code initially assumed it always returned an array.

**Fix:** `previewPlacement` now handles the `null` case explicitly, highlighting
only the anchor cell as invalid, and `canPlace` treats `null` as "cannot
place". This keeps placement validation and preview in agreement.

---

### Bug 5 — A hit didn't earn another shot (turn ended after every shot)

**Symptom (reported):** "I hit my opponent just once and it instantly gave him a
turn back… if I hit a ship I should keep firing until I miss." Sinking a ship
also wrongly passed the turn.

**Cause:** Both `handlePlayerShot` and `aiTurn` handed the turn to the other side
after *every* resolved shot, regardless of whether it was a hit or a miss.

**Fix:** The turn now only passes on a **miss**. A hit or a sink lets the same
side fire again. This applies symmetrically to the player and the AI:

```js
// handlePlayerShot — only a miss ends the player's turn
if (result === "miss") {
  state.playerTurn = false;
  state.locked = true;
  setTimeout(aiTurn, 650);
}

// aiTurn — a hit/sink schedules another AI shot; a miss returns the turn
if (result === "miss") {
  state.playerTurn = true;
  state.locked = false;
} else {
  setTimeout(aiTurn, 650);
}
```

Regression tests assert "player keeps turn after a hit", "player loses turn
after a miss", and the equivalents for the AI.

---

### Bug 6 — Ships could be placed touching each other

**Symptom (reported):** Two ships could be placed directly adjacent (see the
screenshot in the report). Required rule: every ship must have at least one free
square around it on all sides, including diagonals.

**Cause:** `canPlace` only checked that the target cells were unoccupied; it did
not enforce any spacing, so ships could sit edge-to-edge or corner-to-corner.
This affected both manual placement and the random fleet generator.

**Fix:** `canPlace` now also rejects placement if any of the 8 neighbours of a
target cell already holds a ship, so a one-square buffer is guaranteed
everywhere. Because both manual placement and `randomizeFleet` go through
`canPlace`, the player's and the computer's fleets both obey the rule:

```js
for (let dr = -1; dr <= 1; dr++) {
  for (let dc = -1; dc <= 1; dc++) {
    const rr = r + dr, cc = c + dc;
    if (inBounds(rr, cc) && grid[rr][cc] === SHIP) return false;
  }
}
```

A test generates 200 random fleets and verifies no two ships are ever
8-adjacent.

---

### Enhancement — auto-block the ring around a sunk ship

**Request:** Because ships can never touch (Bug 6), every square surrounding a
ship is guaranteed to be empty water. When a ship is sunk those squares should
be revealed in **gray** and locked so neither side wastes a guess there.

**Implementation:** A new cell state `BLOCKED` was added. When `applyShot`
resolves to `"sunk"`, `blockAroundShip` flips every in-bounds `EMPTY` cell in the
ship's 8-neighbour ring to `BLOCKED` (existing misses are left untouched):

```js
if (ship.hits >= ship.size) {
  blockAroundShip(grid, ship); // EMPTY ring cells -> BLOCKED
  return "sunk";
}
```

`isFireable` and `applyShot` both treat `BLOCKED` like an already-resolved cell,
so the player can't click it and the AI never targets it. Both boards render
`BLOCKED` cells in gray. Tests verify the full ring is blocked, ship cells stay
`HIT`, blocked cells are not fireable, and pre-existing misses are preserved.

---

## How to run the tests

```bash
node test/run.js
```

No dependencies required — the harness stubs the small slice of the DOM that the
game uses so the real `game.js` logic runs unmodified under Node.

# Battleship — Jonathan Identified Fixes Applied

**Repository:** https://github.com/jamitai2002/battleone
**Live game:** https://jamitai2002.github.io/battleone/

---

## BUG #1: Turn Logic Error — Player Gets Opponent's Turn After Hit

**Description:**
When the player hits the opponent's ship, the game incorrectly gives the opponent
a turn back instead of allowing the player to continue playing. According to
Battleship rules, if a player hits, they should continue to have turns until they
miss.

**Fix Applied:**
The turn-handover logic was changed so the turn now passes **only on a miss**. A
hit (or a sink) lets the same side fire again. This was applied symmetrically to
both the player (`handlePlayerShot`) and the AI (`aiTurn`): after each resolved
shot we check the result, and only when it is `"miss"` do we switch sides. On a
`"hit"`/`"sunk"` the current side keeps the turn (the player's board stays
unlocked; the AI schedules another shot). Regression tests assert "player keeps
turn after a hit", "player loses turn after a miss", and the AI equivalents.

---

## BUG #2: Ship Placement Proximity Validation

**Description:**
Two ships can be placed too close together. According to the rules, ships cannot
be placed adjacent to each other. There must be at least one free square across
each edge of each ship.


**Fix Applied:**
The placement-validation function `canPlace` was strengthened to require a
one-square buffer around every ship. In addition to checking that the target
cells are empty, it now rejects the placement if **any of the 8 neighbours**
(orthogonal *and* diagonal) of a target cell already contains a ship. Because
both manual placement and the "Randomize" fleet generator validate through
`canPlace`, the rule is enforced for the player's fleet and the computer's fleet
alike. A test generates 200 random fleets and confirms no two ships are ever
adjacent (including diagonally).

---

## BUG #3: Game Speed — Opponent Plays Too Fast

**Description:**
The opponent's AI takes 3 shots instantly, making it difficult for the player to
follow the game. There should be at least a 2-second delay between each opponent
move to allow the player to see what's happening.

**Fix Applied:**
A single timing constant `AI_MOVE_DELAY_MS = 2000` was introduced and used for
every scheduled AI shot (`setTimeout(aiTurn, AI_MOVE_DELAY_MS)`), so the computer
now pauses a full 2 seconds before each move. (A secondary issue was that the
browser was serving a cached copy of the old code; cache-busting version query
strings were added to the CSS/JS includes so every client always loads the latest
build.)

---

## BUG #4: Inconsistent Delay After Hit

**Description:**
After the opponent hits a ship, the 2-second delay is not applied before taking
the next shot. The delay should be consistently applied between every move in the
opponent's turn sequence.

**Fix Applied:**
Because the AI now keeps firing after a hit (see Bug #1), each follow-up shot in a
streak is scheduled through the *same* `setTimeout(aiTurn, AI_MOVE_DELAY_MS)` call,
so the 2-second pause applies between **every** consecutive AI shot, not just the
first one. This was verified live with timing instrumentation: across a 5-shot hit
streak the measured gaps between shots were `2001 ms` each.

---

## BUG #5: Ship Elimination Visual Feedback

**Description:**
When an entire ship is sunk, the squares around it are not properly disabled or
visually marked. These squares should be displayed in a different color to
indicate they are blocked and cannot be used for future guesses by either player.

**Fix Applied:**
A new cell state, `BLOCKED`, was added. When a shot results in `"sunk"`, the
function `blockAroundShip` flips every in-bounds empty cell in the sunk ship's
8-neighbour ring to `BLOCKED` (any earlier "miss" inside that ring is recolored
too, since it is the same guaranteed-empty water). Both `isFireable` and
`applyShot` treat `BLOCKED` like an already-resolved cell, so the player cannot
click those squares and the AI never targets them. The blocked squares are
rendered in a distinct color on both boards. (Implemented first in black, then
changed to gray per the follow-up request.) Tests confirm the full ring is
blocked, the ship's own cells stay marked as hits, and blocked cells are not
fireable.

---

## BUG #6: Ship Placement — Cannot Modify After Placement

**Description:**
Once a ship is placed during the setup phase, it cannot be moved or adjusted. The
player should be able to move ships before submitting their final board
configuration.

**Fix Applied:**
A `pickUpShip` action was added so a placed ship can be repositioned before
pressing "Start Game". Clicking the ship on your board (when no ship is currently
"in hand"), or clicking its entry in the tray, clears the ship's cells from the
board, removes it from the fleet, and re-selects it so the next board click drops
it in the new location. Placed ships now show a pointer cursor to signal they are
clickable, and the on-screen hint explains the interaction. Tests cover the full
place → pick-up (cells cleared, fleet count drops, selection restored) →
re-place flow.

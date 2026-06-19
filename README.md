# Battleship

A simple, browser-based Battleship game — play against the computer. Built with
plain HTML, CSS, and JavaScript (no build step, no dependencies).

## Play

- **Live:** https://jamitai2002.github.io/battleone/
- **Local:** open `index.html` in a browser, or run a static server:
  ```bash
  python3 -m http.server 8000
  # then visit http://localhost:8000
  ```

## How to play

1. **Place your fleet.** Click a ship in the tray, then click your board to drop
   it. Use **Orientation** to rotate, **Randomize** to auto-place, or **Clear**
   to start over. Ships may not touch — leave at least one free square around
   each ship (diagonals included).
2. Click **Start Game** once all five ships are placed.
3. **Fire** by clicking cells on the *Enemy Waters* board. Red = hit, grey =
   miss, dark red = sunk, black = auto-revealed empty water around a sunk ship
   (locked — no one can fire there).
4. **Keep firing as long as you hit.** Your turn only ends when you miss — then
   the computer fires back under the same rule. Sink the whole enemy fleet
   before it sinks yours.

## The fleet

| Ship       | Size |
|------------|------|
| Carrier    | 5    |
| Battleship | 4    |
| Cruiser    | 3    |
| Submarine  | 3    |
| Destroyer  | 2    |

## The AI

The computer uses a classic **hunt / target** strategy:

- **Hunt:** fires on a checkerboard parity pattern (every shot is at most one
  cell from any ship), which finds ships faster than pure random.
- **Target:** after a hit, it probes the four neighbours; after a second hit it
  locks onto the ship's orientation and fires along that line until the ship is
  sunk.

## Project layout

```
index.html     markup + phases (setup / battle)
style.css      styling
game.js        all game logic and rendering
test/run.js    headless test suite (22 checks)
test/harness.js  minimal DOM stub so game.js runs under Node
BUGS.md        bugs found during development and their fixes
```

## Tests

```bash
node test/run.js
```

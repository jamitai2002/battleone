"use strict";
/*
 * Minimal DOM stub so game.js can be loaded under Node for logic testing.
 * We only implement the surface that game.js touches.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function makeClassList() {
  const set = new Set();
  return {
    set,
    add(...cs) { cs.forEach((c) => set.add(c)); },
    remove(...cs) { cs.forEach((c) => set.delete(c)); },
    contains(c) { return set.has(c); },
  };
}

function makeEl(tag = "div") {
  const el = {
    tagName: tag,
    children: [],
    dataset: {},
    _text: "",
    classList: makeClassList(),
    listeners: {},
    set className(v) {
      // emulate resetting classes
      this.classList.set.clear();
      String(v).split(/\s+/).filter(Boolean).forEach((c) => this.classList.set.add(c));
    },
    get className() { return [...this.classList.set].join(" "); },
    set textContent(v) { this._text = v; },
    get textContent() { return this._text; },
    set innerHTML(v) { if (v === "") this.children = []; },
    get innerHTML() { return ""; },
    set disabled(v) { this._disabled = v; },
    get disabled() { return this._disabled; },
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    querySelector(sel) {
      const m = sel.match(/data-r="(\d+)"\]\[.*data-c="(\d+)"/);
      if (m) {
        const r = m[1], c = m[2];
        return descendants(this).find(
          (d) => d.dataset && d.dataset.r === r && d.dataset.c === c
        ) || null;
      }
      return null;
    },
    querySelectorAll(sel) {
      const classes = (sel.match(/\.([\w-]+)/g) || []).map((s) => s.slice(1));
      return descendants(this).filter((d) =>
        d.classList && classes.some((cl) => d.classList.contains(cl))
      );
    },
  };
  return el;
}

function descendants(el, acc = []) {
  for (const ch of el.children || []) {
    acc.push(ch);
    descendants(ch, acc);
  }
  return acc;
}

const registry = {};
function reg(id) { return (registry[id] = makeEl()); }
[
  "setup", "battle", "ship-tray", "setup-board", "enemy-board", "player-board",
  "orientation-btn", "random-btn", "reset-placement-btn", "start-btn",
  "message", "player-score", "enemy-score", "play-again-btn",
].forEach(reg);

const document = {
  getElementById: (id) => registry[id],
  createElement: (tag) => makeEl(tag),
};

const sandbox = {
  document,
  Math,
  console,
  setTimeout: () => {}, // disable async AI scheduling; we drive AI manually
};
sandbox.window = sandbox;

const code = fs.readFileSync(path.join(__dirname, "..", "game.js"), "utf8");
// Expose internals (declared with const/let, not global props) for testing.
const epilogue = `
this.__test = {
  get state(){ return state; },
  set state(v){ state = v; },
  SHIPS, BOARD_SIZE, EMPTY, SHIP, MISS, HIT, BLOCKED,
  makeGrid, shipCells, canPlace, placeShip, randomizeFleet,
  applyShot, blockAroundShip, shipsRemaining, findShipAt,
  startGame, handlePlayerShot, aiTurn, chooseAIShot, queueAdjacentTargets,
  createState, isFireable,
};`;
vm.createContext(sandbox);
vm.runInContext(code + epilogue, sandbox);

module.exports = { sandbox, registry, descendants };

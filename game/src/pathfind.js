// Grid pathfinding for steering around walls: the screenshot autopilot and click-to-move
// both use it. A* over a 40 px grid; a cell is blocked when its centre comes within 20 px
// of a solid rectangle (a wall or a display case), so a path never hugs a wall. Pure
// functions of the solids list: no state, no randomness, the same input gives the same path.

const CELL = 40;
const COLS = 32;
const ROWS = 18;
const MARGIN = 20;

function cellBlocked(cx, cy, solids) {
  const x = cx * CELL + CELL / 2;
  const y = cy * CELL + CELL / 2;
  for (let index = 0; index < solids.length; index += 1) {
    const r = solids[index];
    if (x > r.x - MARGIN && x < r.x + r.w + MARGIN && y > r.y - MARGIN && y < r.y + r.h + MARGIN) return true;
  }
  return false;
}

function cellOf(point) {
  return {
    x: Math.max(0, Math.min(COLS - 1, Math.floor(point.x / CELL))),
    y: Math.max(0, Math.min(ROWS - 1, Math.floor(point.y / CELL))),
  };
}

/** The nearest free cell to a point (the point's own cell when it is free). */
function nearestFreeCell(point, solids) {
  const start = cellOf(point);
  if (!cellBlocked(start.x, start.y, solids)) return start;
  const seen = new Set([`${start.x},${start.y}`]);
  const queue = [start];
  while (queue.length > 0) {
    const cell = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { x: cell.x + dx, y: cell.y + dy };
      if (next.x < 0 || next.y < 0 || next.x >= COLS || next.y >= ROWS) continue;
      const key = `${next.x},${next.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!cellBlocked(next.x, next.y, solids)) return next;
      queue.push(next);
    }
  }
  return start;
}

function cellCentre(cell) {
  return { x: cell.x * CELL + CELL / 2, y: cell.y * CELL + CELL / 2 };
}

/**
 * A path from `from` to `to` as waypoints (cell centres), the start cell excluded. Empty
 * when already there; null when no route exists. The last waypoint is the nearest free cell
 * to `to`, so a target tucked against a wall still has a route to it.
 */
export function findPath(solids, from, to) {
  const start = nearestFreeCell(from, solids);
  const goal = nearestFreeCell(to, solids);
  if (start.x === goal.x && start.y === goal.y) return [];
  const key = (cell) => `${cell.x},${cell.y}`;
  const heuristic = (cell) => Math.abs(cell.x - goal.x) + Math.abs(cell.y - goal.y);
  const open = [{ cell: start, g: 0, f: heuristic(start), parent: null }];
  const bestG = new Map([[key(start), 0]]);
  const closed = new Set();
  const neighbours = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142],
  ];
  while (open.length > 0) {
    let bestIndex = 0;
    for (let index = 1; index < open.length; index += 1) {
      if (open[index].f < open[bestIndex].f) bestIndex = index;
    }
    const current = open.splice(bestIndex, 1)[0];
    const currentKey = key(current.cell);
    if (closed.has(currentKey)) continue;
    closed.add(currentKey);
    if (current.cell.x === goal.x && current.cell.y === goal.y) {
      const path = [];
      let node = current;
      while (node.parent !== null) {
        path.unshift(cellCentre(node.cell));
        node = node.parent;
      }
      return path;
    }
    for (const [dx, dy, cost] of neighbours) {
      const next = { x: current.cell.x + dx, y: current.cell.y + dy };
      if (next.x < 0 || next.y < 0 || next.x >= COLS || next.y >= ROWS) continue;
      if (cellBlocked(next.x, next.y, solids)) continue;
      // No cutting corners: a diagonal step needs both orthogonal neighbours free.
      if (dx !== 0 && dy !== 0) {
        if (cellBlocked(current.cell.x + dx, current.cell.y, solids)) continue;
        if (cellBlocked(current.cell.x, current.cell.y + dy, solids)) continue;
      }
      const nextKey = key(next);
      const g = current.g + cost;
      if (bestG.has(nextKey) && bestG.get(nextKey) <= g) continue;
      bestG.set(nextKey, g);
      open.push({ cell: next, g, f: g + heuristic(next), parent: current });
    }
  }
  return null;
}

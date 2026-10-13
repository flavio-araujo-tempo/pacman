const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const TILE = 32;
const BOARD_WIDTH = 19 * TILE;
const TUNNEL_Y = 9 * TILE;
const STEP = TILE / 4;

function createGame() {
    const ctx2d = new Proxy({}, { get: () => () => {}, set: () => true });
    const sandbox = {
        window: {},
        document: {
            getElementById: () => ({ getContext: () => ctx2d }),
            addEventListener: () => {},
        },
        Image: class {},
        setTimeout: () => 0,
        Math,
    };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'pacman.js'), 'utf8'), sandbox);
    vm.runInContext('loadMap()', sandbox);
    const get = (expr) => vm.runInContext(expr, sandbox);
    return {
        pacman: get('pacman'),
        move: () => get('move()'),
        up: () => get("pacman.updateDirection('U')"),
        down: () => get("pacman.updateDirection('D')"),
        left: () => get("pacman.direction = 'L'; pacman.updateVelocity()"),
        right: () => get("pacman.direction = 'R'; pacman.updateVelocity()"),
        reset: () => get('resetPositions()'),
        score: () => get('score'),
        lives: () => get('lives'),
        // freeze ghosts so they cannot interfere with pacman
        removeGhosts: () => get('ghosts.clear()'),
        freezeGhosts: () => get('for (const g of ghosts) { g.velocityX = 0; g.velocityY = 0; }'),
    };
}

function gameWithPacmanAt(x, y) {
    const game = createGame();
    game.freezeGhosts();
    game.pacman.x = x;
    game.pacman.y = y;
    return game;
}

test('pacman exiting through the left tunnel reappears on the right side', () => {
    const game = gameWithPacmanAt(-TILE + STEP, TUNNEL_Y);
    game.left();
    game.move();
    assert.strictEqual(game.pacman.x, BOARD_WIDTH - TILE);
});

test('pacman exiting through the right tunnel reappears on the left side', () => {
    const game = gameWithPacmanAt(BOARD_WIDTH - STEP, TUNNEL_Y);
    game.right();
    game.move();
    assert.strictEqual(game.pacman.x, 0);
});

test('pacman keeps moving left after wrapping from the left edge', () => {
    const game = gameWithPacmanAt(-TILE + STEP, TUNNEL_Y);
    game.left();
    game.move();
    assert.strictEqual(game.pacman.velocityX, -STEP);
});

test('pacman keeps moving right after wrapping from the right edge', () => {
    const game = gameWithPacmanAt(BOARD_WIDTH - STEP, TUNNEL_Y);
    game.right();
    game.move();
    assert.strictEqual(game.pacman.velocityX, STEP);
});

test('pacman stays on the tunnel row after wrapping', () => {
    const game = gameWithPacmanAt(-TILE + STEP, TUNNEL_Y);
    game.left();
    game.move();
    assert.strictEqual(game.pacman.y, TUNNEL_Y);
});

test('pacman does not wrap while still partially visible on the left', () => {
    const game = gameWithPacmanAt(-TILE + 2 * STEP, TUNNEL_Y);
    game.left();
    game.move();
    assert.strictEqual(game.pacman.x, -TILE + STEP);
});

test('pacman does not wrap while still partially visible on the right', () => {
    const game = gameWithPacmanAt(BOARD_WIDTH - 2 * STEP, TUNNEL_Y);
    game.right();
    game.move();
    assert.strictEqual(game.pacman.x, BOARD_WIDTH - STEP);
});

test('pacman at the left edge of the tunnel row moves off-board without wrapping yet', () => {
    const game = gameWithPacmanAt(0, TUNNEL_Y);
    game.left();
    game.move();
    assert.strictEqual(game.pacman.x, -STEP);
});

test('pacman cannot move up out of the tunnel opening while partially off-board', () => {
    const game = gameWithPacmanAt(-TILE / 2, TUNNEL_Y);
    game.left();
    game.up();
    game.move();
    assert.strictEqual(game.pacman.y, TUNNEL_Y);
});

test('pacman cannot move down out of the tunnel opening while partially off-board', () => {
    const game = gameWithPacmanAt(BOARD_WIDTH - TILE / 2, TUNNEL_Y);
    game.right();
    game.down();
    game.move();
    assert.strictEqual(game.pacman.y, TUNNEL_Y);
});

test('pacman cannot move up right after wrapping to the right side', () => {
    const game = gameWithPacmanAt(-TILE + STEP, TUNNEL_Y);
    game.left();
    game.move();
    game.up();
    game.move();
    assert.strictEqual(game.pacman.y, TUNNEL_Y);
});

test('pacman is blocked by the edge wall on a non-tunnel row', () => {
    const game = gameWithPacmanAt(TILE, TILE);
    game.left();
    for (let i = 0; i < 10; i++) game.move();
    assert.strictEqual(game.pacman.x, TILE);
});

test('pacman is blocked by the right edge wall on a non-tunnel row', () => {
    const game = gameWithPacmanAt(BOARD_WIDTH - 2 * TILE, TILE);
    game.right();
    for (let i = 0; i < 10; i++) game.move();
    assert.strictEqual(game.pacman.x, BOARD_WIDTH - 2 * TILE);
});

test('wrapping does not change the score', () => {
    const game = gameWithPacmanAt(-TILE + STEP, TUNNEL_Y);
    game.left();
    game.move();
    assert.strictEqual(game.score(), 0);
});

test('wrapping does not cost a life', () => {
    const game = gameWithPacmanAt(-TILE + STEP, TUNNEL_Y);
    game.left();
    game.move();
    assert.strictEqual(game.lives(), 3);
});

test('pacman can travel the whole tunnel row and come back to where it started', () => {
    const game = gameWithPacmanAt(0, TUNNEL_Y);
    game.removeGhosts();
    game.left();
    // 4 steps to leave the board and wrap to x=576, then 72 steps back to x=0
    for (let i = 0; i < 4 + (BOARD_WIDTH - TILE) / STEP; i++) game.move();
    assert.strictEqual(game.pacman.x, 0);
});

test('resetting positions after a wrap returns pacman to its start tile', () => {
    const game = gameWithPacmanAt(-TILE + STEP, TUNNEL_Y);
    game.left();
    game.move();
    game.reset();
    assert.deepStrictEqual([game.pacman.x, game.pacman.y], [game.pacman.startX, game.pacman.startY]);
});

test('resetting positions after a wrap stops pacman', () => {
    const game = gameWithPacmanAt(-TILE + STEP, TUNNEL_Y);
    game.left();
    game.move();
    game.reset();
    assert.deepStrictEqual([game.pacman.velocityX, game.pacman.velocityY], [0, 0]);
});

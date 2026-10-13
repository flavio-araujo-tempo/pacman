const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'pacman.js'), 'utf8');

function createGame() {
    const ctx = vm.createContext({
        window: {},
        document: { getElementById: () => ({}), addEventListener() {} },
        Image: class {},
        setTimeout() {},
        console,
    });
    vm.runInContext(source, ctx);
    vm.runInContext('loadMap()', ctx);
    const run = (code) => vm.runInContext(code, ctx);
    return {
        run,
        // place pacman at pixel position with a given direction, ghosts removed
        place(x, y, direction) {
            run(`ghosts.clear(); pacman.x = ${x}; pacman.y = ${y}; pacman.direction = '${direction}'; pacman.updateVelocity();`);
        },
        step(n = 1) { for (let i = 0; i < n; i++) run('move()'); },
        get x() { return run('pacman.x'); },
        get y() { return run('pacman.y'); },
        get score() { return run('score'); },
        get lives() { return run('lives'); },
        get velocityX() { return run('pacman.velocityX'); },
    };
}

const TUNNEL_Y = 9 * 32;
const BOARD_WIDTH = 19 * 32;

describe('pacman tunnel wrap-around', () => {
    let game;
    beforeEach(() => { game = createGame(); });

    it('reappears on the right side after exiting through the left tunnel', () => {
        game.place(-24, TUNNEL_Y, 'L');
        game.step(1); // x = -32, fully off board
        assert.strictEqual(game.x, BOARD_WIDTH - 32);
    });

    it('reappears on the left side after exiting through the right tunnel', () => {
        game.place(BOARD_WIDTH - 8, TUNNEL_Y, 'R');
        game.step(1); // x = 608
        assert.strictEqual(game.x, 0);
    });

    it('keeps moving left after wrapping from the left tunnel', () => {
        game.place(-24, TUNNEL_Y, 'L');
        game.step(2);
        assert.strictEqual(game.x, BOARD_WIDTH - 32 - 8);
    });

    it('keeps moving right after wrapping from the right tunnel', () => {
        game.place(BOARD_WIDTH - 8, TUNNEL_Y, 'R');
        game.step(2);
        assert.strictEqual(game.x, 8);
    });

    it('does not wrap while still partially on the board', () => {
        game.place(-8, TUNNEL_Y, 'L');
        game.step(1); // x = -16
        assert.strictEqual(game.x, -16);
    });

    it('does not wrap one step before leaving the board', () => {
        game.place(-8, TUNNEL_Y, 'L');
        game.step(2); // x = -24, still 8px visible
        assert.strictEqual(game.x, -24);
    });

    it('can cross the whole board through the tunnel from the middle', () => {
        game.place(9 * 32, TUNNEL_Y, 'L');
        // walk left until wrap happens
        let wrapped = false;
        for (let i = 0; i < 200 && !wrapped; i++) {
            const before = game.x;
            game.step(1);
            if (game.x > before) wrapped = true;
        }
        assert.ok(wrapped);
    });

    it('cannot leave the tunnel vertically while partially off the left edge', () => {
        game.place(-16, TUNNEL_Y, 'L');
        game.run("pacman.updateDirection('U')");
        game.step(1);
        assert.strictEqual(game.y, TUNNEL_Y);
    });

    it('cannot move down out of the tunnel right after wrapping', () => {
        game.place(-24, TUNNEL_Y, 'L');
        game.step(1);
        game.run("pacman.updateDirection('D')");
        game.step(1);
        assert.strictEqual(game.y, TUNNEL_Y);
    });

    it('is blocked by the edge wall on a non-tunnel row', () => {
        game.place(32, 32, 'L'); // row 1, x=32 next to wall at col 0
        game.step(10);
        assert.strictEqual(game.x, 32);
    });

    it('does not change score when wrapping', () => {
        game.place(-24, TUNNEL_Y, 'L');
        game.step(2);
        assert.strictEqual(game.score, 0);
    });

    it('does not change lives when wrapping', () => {
        game.place(-24, TUNNEL_Y, 'L');
        game.step(2);
        assert.strictEqual(game.lives, 3);
    });

    it('resets pacman to the start tile with no velocity after wrapping', () => {
        game.place(-24, TUNNEL_Y, 'L');
        game.step(1);
        game.run('resetPositions()');
        assert.deepStrictEqual([game.x, game.y, game.velocityX], [9 * 32, 15 * 32, 0]);
    });
});

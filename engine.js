(function (global) {
  'use strict';

  var LINES = Object.freeze([
    Object.freeze([0, 1, 2]), Object.freeze([3, 4, 5]), Object.freeze([6, 7, 8]),
    Object.freeze([0, 3, 6]), Object.freeze([1, 4, 7]), Object.freeze([2, 5, 8]),
    Object.freeze([0, 4, 8]), Object.freeze([2, 4, 6])
  ]);

  // Probability that the bot plays a perfect move, per difficulty.
  var OPTIMAL_CHANCE = Object.freeze({ easy: 0.2, medium: 0.65, hard: 1 });

  function opponent(mark) {
    return mark === 'X' ? 'O' : 'X';
  }

  function getWinner(board) {
    for (var i = 0; i < LINES.length; i++) {
      var a = LINES[i][0];
      var b = LINES[i][1];
      var c = LINES[i][2];
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return { mark: board[a], line: LINES[i].slice() };
      }
    }
    return null;
  }

  function emptyCells(board) {
    var out = [];
    for (var i = 0; i < board.length; i++) {
      if (board[i] === null) out.push(i);
    }
    return out;
  }

  function isFull(board) {
    return emptyCells(board).length === 0;
  }

  function minimax(board, turn, me, depth, alpha, beta) {
    var winner = getWinner(board);
    if (winner) return winner.mark === me ? 10 - depth : depth - 10;

    var empties = emptyCells(board);
    if (empties.length === 0) return 0;

    var maximizing = turn === me;
    var best = maximizing ? -Infinity : Infinity;

    for (var k = 0; k < empties.length; k++) {
      var idx = empties[k];
      board[idx] = turn;
      var score = minimax(board, opponent(turn), me, depth + 1, alpha, beta);
      board[idx] = null;

      if (maximizing) {
        if (score > best) best = score;
        if (best > alpha) alpha = best;
      } else {
        if (score < best) best = score;
        if (best < beta) beta = best;
      }
      if (beta <= alpha) break;
    }
    return best;
  }

  function bestMoves(board, mark) {
    var work = board.slice();
    var empties = emptyCells(work);
    var bestScore = -Infinity;
    var moves = [];

    for (var k = 0; k < empties.length; k++) {
      var idx = empties[k];
      work[idx] = mark;
      var score = minimax(work, opponent(mark), mark, 1, -Infinity, Infinity);
      work[idx] = null;
      if (score > bestScore) {
        bestScore = score;
        moves = [idx];
      } else if (score === bestScore) {
        moves.push(idx);
      }
    }
    return moves;
  }

  function pick(list, rng) {
    return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
  }

  function chooseMove(board, mark, difficulty, rng) {
    if (!Array.isArray(board) || board.length !== 9) {
      throw new Error('Board must be an array of 9 cells.');
    }
    if (mark !== 'X' && mark !== 'O') {
      throw new Error('Mark must be "X" or "O".');
    }
    var random = typeof rng === 'function' ? rng : Math.random;
    var empties = emptyCells(board);
    if (empties.length === 0) return -1;

    var chance = Object.prototype.hasOwnProperty.call(OPTIMAL_CHANCE, difficulty)
      ? OPTIMAL_CHANCE[difficulty]
      : OPTIMAL_CHANCE.medium;

    if (random() < chance) return pick(bestMoves(board, mark), random);
    return pick(empties, random);
  }

  global.TTTEngine = Object.freeze({
    LINES: LINES,
    getWinner: getWinner,
    isFull: isFull,
    emptyCells: emptyCells,
    opponent: opponent,
    chooseMove: chooseMove,
    bestMoves: bestMoves
  });
})(typeof window !== 'undefined' ? window : globalThis);

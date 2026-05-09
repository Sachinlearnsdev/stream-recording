export function createState() {
  return {
    startedAt: new Date().toISOString(),
    queue: [],
    recentMoves: [],
    pid: process.pid,
  };
}

export function addRecentMove(state, entry) {
  state.recentMoves.unshift({ ...entry, ts: new Date().toISOString() });
  while (state.recentMoves.length > 10) state.recentMoves.pop();
}

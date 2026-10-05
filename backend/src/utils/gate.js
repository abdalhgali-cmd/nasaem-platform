// A tiny concurrency gate: at most `concurrency` tasks run at once, at most
// `maxQueue` more wait (each for at most `maxWaitMs`); anything beyond that is
// rejected immediately instead of piling up in memory.
export function createGate({ concurrency = 1, maxQueue = 3, maxWaitMs = 20_000 } = {}) {
  let running = 0;
  const queue = [];

  const busy = (message) => Object.assign(new Error(message), { statusCode: 503, code: "GATE_BUSY", expose: true });

  function release() {
    running -= 1;
    const next = queue.shift();
    if (next) {
      clearTimeout(next.timer);
      running += 1;
      next.start();
    }
  }

  async function run(task) {
    if (running >= concurrency) {
      if (queue.length >= maxQueue) throw busy("The service is busy, please try again shortly");
      await new Promise((resolve, reject) => {
        const entry = { start: resolve };
        entry.timer = setTimeout(() => {
          queue.splice(queue.indexOf(entry), 1);
          reject(busy("The service is busy, please try again shortly"));
        }, maxWaitMs);
        queue.push(entry);
      });
    } else {
      running += 1;
    }
    try {
      return await task();
    } finally {
      release();
    }
  }

  return { run, stats: () => ({ running, queued: queue.length }) };
}

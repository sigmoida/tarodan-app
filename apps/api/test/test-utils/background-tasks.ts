const activeTasks = new Set<Promise<unknown>>();

export function trackE2EBackgroundTask<T>(task: Promise<T>): Promise<T> {
  activeTasks.add(task);
  void task.then(
    () => activeTasks.delete(task),
    () => activeTasks.delete(task),
  );
  return task;
}

export async function drainE2EBackgroundTasks(
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let idleTurns = 0;

  // Async event listeners register their tracked work on a later event-loop
  // turn. Require two consecutive idle turns before declaring the queue drained.
  while (idleTurns < 2) {
    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out waiting for ${activeTasks.size} E2E background task(s)`,
      );
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
    if (activeTasks.size === 0) {
      idleTurns++;
      continue;
    }
    idleTurns = 0;
    await Promise.allSettled([...activeTasks]);
  }
}

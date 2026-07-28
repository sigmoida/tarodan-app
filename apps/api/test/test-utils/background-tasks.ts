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

  while (activeTasks.size > 0) {
    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out waiting for ${activeTasks.size} E2E background task(s)`,
      );
    }
    await Promise.allSettled([...activeTasks]);
  }
}

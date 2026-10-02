/** Coalesce callers before starting, and retain one trailing run for changes in flight. */
export function createRefreshCoordinator(delayMs = 100) {
  type Waiter = { resolve: () => void; reject: (error: unknown) => void };
  type Job = { run: () => Promise<void>; timer?: ReturnType<typeof setTimeout>; running: boolean; dirty: boolean; waiters: Waiter[] };
  const jobs = new Map<string, Job>();
  async function execute(key: string, job: Job) {
    job.timer = undefined;
    job.running = true;
    try {
      do {
        job.dirty = false;
        await job.run();
      } while (job.dirty && jobs.get(key) === job);
      job.waiters.forEach(({ resolve }) => resolve());
    } catch (error) {
      job.waiters.forEach(({ reject }) => reject(error));
    } finally {
      if (jobs.get(key) === job) jobs.delete(key);
    }
  }
  return {
    request(key: string, run: () => Promise<void>) {
      let job = jobs.get(key);
      if (!job) {
        job = { run, running: false, dirty: false, waiters: [] };
        jobs.set(key, job);
        const pending = job;
        job.timer = setTimeout(() => { void execute(key, pending); }, delayMs);
      } else {
        job.run = run;
        if (job.running) job.dirty = true;
      }
      return new Promise<void>((resolve, reject) => job!.waiters.push({ resolve, reject }));
    },
    cancel() {
      for (const job of jobs.values()) {
        clearTimeout(job.timer);
        job.dirty = false;
        job.waiters.forEach(({ reject }) => reject(new Error("Synchronization cancelled")));
        job.waiters = [];
      }
      jobs.clear();
    },
  };
}

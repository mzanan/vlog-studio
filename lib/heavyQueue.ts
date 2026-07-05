let tail: Promise<void> = Promise.resolve();

export function runHeavy<T>(job: () => Promise<T>): Promise<T> {
  const settled = tail.then(job, job);
  tail = settled.then(
    () => undefined,
    () => undefined,
  );
  return settled;
}

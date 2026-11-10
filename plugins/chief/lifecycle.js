// Cordis may dispose an effect without awaiting its asynchronous teardown.
// Share initialization across overlapping registrations of this effect, and
// serialize a new generation behind the previous generation's complete cleanup.
// This shares the whole controller lifecycle, not just a mutable store lease.
export function createLifecycle(initialize, onError = () => {}) {
  let current
  let tail = Promise.resolve()
  return () => {
    if (!current) {
      const generation = { references: 0, stopped: false }
      generation.ready = tail.then(() => generation.stopped ? undefined : initialize(() => generation.stopped))
        .catch(error => { onError(error) })
      current = generation
    }
    const generation = current
    generation.references++
    let disposed = false
    return () => {
      if (disposed) return generation.closed ?? Promise.resolve()
      disposed = true
      if (--generation.references) return Promise.resolve()
      generation.stopped = true
      current = undefined
      generation.closed = generation.ready.then(cleanup => cleanup?.())
      // Observe teardown errors without poisoning future generations.
      tail = generation.closed.catch(error => { onError(error) })
      return generation.closed
    }
  }
}

// Stop admission synchronously, then drain already accepted controller work
// before closing its store. This includes host I/O inside dispatch/register.
export function createActivity() {
  let accepting = true
  const pending = new Set()
  return {
    run(work) {
      if (!accepting) return Promise.reject(new Error('Chief is stopping'))
      const operation = Promise.resolve().then(work)
      pending.add(operation)
      operation.then(() => pending.delete(operation), () => pending.delete(operation))
      return operation
    },
    async stop() {
      accepting = false
      await Promise.allSettled([...pending])
    },
  }
}

export function startPolling(work, onError, interval = 5000) {
  let stopped = false
  let timer
  let pending
  const poll = () => {
    pending = Promise.resolve().then(work).catch(onError).finally(() => {
      if (!stopped) timer = setTimeout(poll, interval)
    })
  }
  poll()
  return async () => { stopped = true; clearTimeout(timer); await pending }
}

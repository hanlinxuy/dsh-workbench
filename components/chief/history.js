// DSH 0.2.2 replaced inspect() with paged events(). Keep one fixed history cut
// while reading backwards so a completion arriving mid-read cannot mix pages.
export async function readSessionEvents(controller, sessionId, signal) {
  if (typeof controller.events !== 'function') return (await controller.inspect(sessionId, signal)).events
  const pages = []
  let throughSeq, beforeSeq
  for (;;) {
    const page = await controller.events({ address: { kind: 'session', sessionId }, maxMessages: 200, ...(throughSeq === undefined ? {} : { throughSeq }), ...(beforeSeq === undefined ? {} : { beforeSeq }) }, signal)
    throughSeq ??= page.cursor
    const events = page.records.map(record => record.event)
    pages.push(events)
    if (!page.hasMore) return pages.reverse().flat()
    const first = events[0]?.seq
    if (first === undefined || (beforeSeq !== undefined && first >= beforeSeq)) throw new Error('Session history pagination did not advance')
    beforeSeq = first
  }
}

// The request must be observed within its own DSH turn. Never infer a result
// from a later unrelated user turn or from a partial turn.
export function readResult(events, requestId) {
  let current
  let selected
  for (const event of events) {
    if (event.type === 'turn/start') current = { turn: event.data.turn, text: [] }
    if (event.type === 'user/message' && event.data.source?.rpcId === requestId && current) selected = current
    if (current && event.type === 'assistant/message') {
      current.text.push(...(event.data.message?.content ?? []).filter(c => c.type === 'text').map(c => c.text))
    }
    if (current && event.type === 'turn/end' && current === selected) {
      const reason = event.data.reason?.kind
      const text = current.text.join('\n\n')
      return { status: reason === 'completed' && text.trim() ? 'completed' : 'failed', text, reason: reason === 'completed' && !text.trim() ? 'empty_result' : reason, ...(event.time === undefined ? {} : {finishedAt:event.time}) }
    }
  }
  return undefined
}

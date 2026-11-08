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

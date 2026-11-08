// Pure state transitions for the independent Chief. Persistence and DSH I/O
// are owned by the host adapter; unknown submissions are never replayed here.
export function register(state, project) {
  if (state.projects.some(p => p.id === project.id || p.name === project.name)) throw new Error('Project already exists')
  state.projects.push({ ...project, owner: 'chief', seen: [], job: null })
}

export function take(project, messageId, at = Date.now(), reason = 'Desktop user message') {
  if (messageId && project.seen.includes(messageId)) return false
  if (messageId) project.seen.push(messageId)
  project.owner = 'user'
  project.controlChangedAt = at
  project.controlReason = reason
  return true
}

export function resume(project) {
  project.owner = 'chief'
  project.controlChangedAt = Date.now()
  project.controlReason = 'Explicit user resume'
}

export function dispatch(project, job) {
  if (project.owner !== 'chief') throw new Error('Project is under user control')
  if (project.job && ['submitting', 'running', 'unknown'].includes(project.job.status)) throw new Error('Project already has active work')
  project.job = { ...job, status: 'submitting', submittedAt: Date.now() }
}

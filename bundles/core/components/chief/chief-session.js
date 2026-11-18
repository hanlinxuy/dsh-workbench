// The fresh Web workspace can reuse a blank Chief with the default preset.
// Repair the bound session in place; never discard its history by minting an ID.
export async function restoreChiefPreset(ctx, sessionId, { allowMissing = false } = {}) {
  const resolved = await ctx.sessionController.resolveAgent(sessionId)
  if (resolved.error?.code === 'session/not-found' && allowMissing) return false
  if (resolved.error) throw resolved.error
  const agent = resolved.agent
  if (ctx.agentPresets.composedPreset(agent.ctx) === 'independent-chief') return true
  // This is a migration of the configured Chief only, not a general-purpose
  // preset switch. select() intentionally rejects sessions with existing turns.
  await ctx.agentPresets.recompose(agent.ctx, 'independent-chief')
  agent.session.append('agent-preset/selected', { agentPreset: 'independent-chief' })
  return true
}

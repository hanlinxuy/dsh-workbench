// Commands are handled by the DSH inputTriggers interface.
export function projectCommands({ roster, call, open, notify }) {
  const names = ['home', 'where', 'switch', 'resume', 'resolve']
  const tokenName = token => names.find(n => token === `/${n}`)
  const claim = (sessionId, name) => ({
    name, token: `/${name} `, hint: name === 'switch' || name === 'resume' || name === 'resolve' ? 'Project name' : '',
    async submit(args, _context, attachments) {
      if (attachments?.length) throw new Error('Project commands do not accept attachments')
      const result = await call('project-command', { sessionId, line: `/${name}${args ? ` ${args}` : ''}` })
      notify(result.message)
      if (result.navigate) await open(result.sessionId)
      return { kind: 'success' }
    },
  })
  return {
    trigger: '/', name: 'project-control', order: -100, showGroupTitle: false,
    async candidates(_session, req) {
      if (req?.position === 'inline') return []
      return names.filter(n => n.startsWith(req?.query ?? '')).map(n => ({ name: n, value: n, description: ({ home: 'Return to Chief', where: 'Current project and control', switch: 'Talk directly to a project', resume: 'Return project control to Chief', resolve: 'Acknowledge an uncertain task after checking DSH' })[n] }))
    },
    onPick(pick) { if (pick?.action !== 'drill' && names.includes(pick.candidate?.value)) return { claim: claim(pick.session.sessionId, pick.candidate.value) } },
    matchSpace(session, token) { const name = tokenName(token); if (name) return { claim: claim(session.sessionId, name) } },
    matchEnter(session, line, _signal, envelope) {
      const name = tokenName(line.trim().split(/\s/, 1)[0])
      if (!name) return
      if (!roster.getSnapshot().ready) throw new Error('Chief is loading; retry the command')
      if (envelope?.attachments) throw new Error('Project commands do not accept attachments')
      return { claim: claim(session.sessionId, name) }
    },
    async matchClaim(session, token) { const name = tokenName(token); if (name) return claim(session.sessionId, name) },
  }
}

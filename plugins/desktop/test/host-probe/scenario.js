import assert from 'node:assert/strict'
export async function scenario(call) {
  assert.match(await call({ action: 'version' }), /1\.2\.0/)
  let snapshot = JSON.parse(await call({ action: 'snapshot', app: 'WorkbenchDesktopFixture' }))
  let input = snapshot.data.tree.children.find(node => node.name === 'Test input')
  assert.ok(input?.ref_id)
  await call({ action: 'fill', ref: input.ref_id, value: 'DESKTOP_PLUGIN_OK' })
  snapshot = JSON.parse(await call({ action: 'snapshot', app: 'WorkbenchDesktopFixture' }))
  const button = snapshot.data.tree.children.find(node => node.name === 'Save test')
  await call({ action: 'click', ref: button.ref_id })
  const result = await call({ action: 'snapshot', app: 'WorkbenchDesktopFixture' })
  assert.match(result, /Saved: DESKTOP_PLUGIN_OK/)
  return { pass: true, checks: ['version', 'snapshot', 'fill', 'click', 'independent UI readback'] }
}

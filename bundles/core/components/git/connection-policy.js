import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Read at execution time: saving or revoking a permission takes effect without
// restarting DSH. No credentials leave this boundary.
export function connectionPolicy(profile) {
  return async hosts => {
    const value=await readFile(join(profile,'.workbench-private/connections.json'),'utf8').then(JSON.parse,error=>{if(error.code==='ENOENT')return null;throw error})
    const rows=value?.git?.filter(row=>hosts.includes(new URL(row.url).hostname)) ?? []
    if(!rows.length)return null
    // Duplicate platform entries must not broaden an existing deny.
    return {write:rows.every(r=>r.permissions?.write===true),push:rows.every(r=>r.permissions?.push===true)}
  }
}

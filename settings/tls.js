import * as tls from 'node:tls'
import {readFile} from 'node:fs/promises'
import {X509Certificate} from 'node:crypto'

// The host owns transport/proxy routing. Configure native Node trust, not a second HTTP client.
export async function configureTrust(config){
 if(config===undefined)return {configured:false,message:'当前沿用宿主 Node 信任。企业网关重签导致证书校验失败时，可合并系统根证书；仍失败请由管理员导入企业 CA，或设置 tls.trust.extraCaFile。'}
 if(config.onVerifyError!==undefined&&config.onVerifyError!=='fail')throw Error('TLS verification must fail on untrusted certificates')
 const trust=config.trust??{},sources=trust.sources??['system']
 if(!Array.isArray(sources)||sources.some(s=>!['system','file'].includes(s)))throw Error('TLS trust sources must be system/file')
 if(sources.includes('file')&&!trust.extraCaFile)throw Error('TLS file source requires extraCaFile')
 if(trust.extraCaFile&&!sources.includes('file'))throw Error('Declare file in TLS trust sources to use extraCaFile')
 const before=tls.getCACertificates('default'),bundled=tls.getCACertificates('bundled')
 const roots=[...before,...bundled,...tls.getCACertificates('extra')],counts={bundled:bundled.length,system:0,file:0}
 if(sources.includes('system')){const system=tls.getCACertificates('system');counts.system=system.length;roots.push(...system)}
 if(trust.extraCaFile){
  const pem=await readFile(trust.extraCaFile,'utf8').catch(()=>{throw Error(`Unable to read TLS CA file: ${trust.extraCaFile}`)})
  const certs=pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)
  if(!certs?.length)throw Error(`No certificates in TLS CA file: ${trust.extraCaFile}`)
  for(const cert of certs){new X509Certificate(cert);roots.push(cert)}
  counts.file=certs.length
 }
 tls.setDefaultCACertificates([...new Set(roots)])
 return {configured:true,sources:counts,certificates:new Set(roots).size,extraCaFile:trust.extraCaFile,onVerifyError:'fail',restore:()=>tls.setDefaultCACertificates(before),message:'Native Node trust configured. Existing pooled TLS connections may require a profile restart; Git and browser trust are configured separately.'}
}

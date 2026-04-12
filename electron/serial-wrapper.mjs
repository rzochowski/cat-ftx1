import { writeFileSync } from 'fs'
import { pathToFileURL } from 'url'

const LOG = path => {
  try { writeFileSync(
    (process.env.USERPROFILE || process.env.HOME) + '\\Desktop\\serial-server.log',
    new Date().toISOString() + ' ' + path + '\n',
    { flag: 'a' }
  )} catch {}
}

process.on('uncaughtException', (err) => {
  LOG('[uncaughtException] ' + err.message + '\n' + err.stack)
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  LOG('[unhandledRejection] ' + String(reason))
  process.exit(1)
})

const serverPath = process.env.SERIAL_SERVER_PATH
LOG('[wrapper] node=' + process.versions.node + ' electron=' + process.versions.electron)
LOG('[wrapper] SERIAL_SERVER_PATH=' + serverPath)

if (!serverPath) {
  LOG('[wrapper] ERROR: SERIAL_SERVER_PATH not set')
  process.exit(1)
}

try {
  await import(pathToFileURL(serverPath).href)
  LOG('[wrapper] import ok')
} catch (err) {
  LOG('[wrapper] import FAILED: ' + err.message + '\n' + err.stack)
  process.exit(1)
}

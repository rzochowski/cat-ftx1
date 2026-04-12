import { app, BrowserWindow, utilityProcess } from 'electron'
import { writeFileSync, mkdirSync } from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged
const LOG_PATH = path.join(os.homedir(), 'Desktop', 'serial-server.log')

function writeLog(msg) {
  try { writeFileSync(LOG_PATH, new Date().toISOString() + ' ' + msg + '\n', { flag: 'a' }) } catch {}
}

let serialProc, nuxtProc, win

function startServers() {
  const root = isDev ? path.join(__dirname, '..') : process.resourcesPath
  const serialScript = path.join(root, 'serial-server.mjs')

  writeLog('startServers() root=' + root)
  writeLog('serial script path=' + serialScript)

  const wrapperScript = isDev
    ? path.join(__dirname, 'serial-wrapper.mjs')
    : path.join(__dirname, 'serial-wrapper.mjs')

  writeLog('wrapper=' + wrapperScript + '  serial=' + serialScript)

  try {
    serialProc = utilityProcess.fork(wrapperScript, [], {
      env: { ...process.env, SERIAL_SERVER_PATH: serialScript }
    })
    serialProc.on('exit', code => writeLog('[main EXIT] code=' + code))
    serialProc.on('spawn', () => writeLog('[main SPAWN] ok'))
  } catch (err) {
    writeLog('[FORK ERROR] ' + err.message + '\n' + err.stack)
  }

  nuxtProc = utilityProcess.fork(
    path.join(root, '.output/server/index.mjs'),
    [],
    {
      env: {
        ...process.env,
        PORT: '3000',
        NUXT_SERIAL_SERVER_URL: 'http://127.0.0.1:3001',
        CAT_RESOURCES_PATH: root
      }
    }
  )
}

app.whenReady().then(() => {
  startServers()
  setTimeout(() => {
    win = new BrowserWindow({ width: 1400, height: 900 })
    win.loadURL('http://localhost:3000')
  }, 1500) // poczekaj na start serwerów
})

app.on('will-quit', () => {
  serialProc?.kill()
  nuxtProc?.kill()
})


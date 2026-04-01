#!/usr/bin/env node
/**
 * Standalone serial port server for FTX-1 CAT communication.
 * Runs as a separate Node.js process on port 3001 to avoid
 * V8 locking issues when native addons are used inside Nuxt 3 / Nitro dev server.
 *
 * Uses CAT Auto Information (AI1) so the transceiver pushes state changes
 * automatically. Only S-meter and slow radio parameters still need periodic polling.
 * State changes are broadcast to connected clients via Server-Sent Events (/events).
 */

import http from 'node:http'
import { EventEmitter } from 'node:events'
import { SerialPort } from 'serialport'
import { ReadlineParser } from '@serialport/parser-readline'

const PORT = 3001

// ──────────────────────────────────────────────────────────
// CAT decode maps
// ──────────────────────────────────────────────────────────

const MODE_MAP = {
  '0': '-', '1': 'LSB', '2': 'USB', '3': 'CW-U', '4': 'FM',
  '5': 'AM', '6': 'RTTY-L', '7': 'CW-L', '8': 'DATA-L', '9': 'RTTY-U',
  'A': 'DATA-FM', 'B': 'FM-N', 'C': 'DATA-U', 'D': 'AM-N', 'E': 'PSK',
  'F': 'DATA-FM-N', 'H': 'C4FM-DN', 'I': 'C4FM-VW',
}

const AGC_MAP = {
  '0': 'OFF', '1': 'FAST', '2': 'MID', '3': 'SLOW',
  '4': 'AUTO-F', '5': 'AUTO-M', '6': 'AUTO-S',
}

// ──────────────────────────────────────────────────────────
// SerialManager
// ──────────────────────────────────────────────────────────

class SerialManager extends EventEmitter {
  constructor() {
    super()
    this.port = null
    this.queue = []
    this.smeterTimer = null   // fast poll: SM0, SM1 every 500 ms
    this.paramsTimer = null   // slow poll: GT0, AG0, RG0, PC every 3 s
    this.state = {
      connected: false,
      port: null,
      baudRate: 38400,
      autoInfo: false,
      mainFreq: null, subFreq: null,
      mainMode: null, subMode: null,
      mainSmeter: null, subSmeter: null,
      txState: false, mox: false, split: false,
      agcMain: null, rfGainMain: null, afGainMain: null,
      agcSub: null, rfGainSub: null, afGainSub: null,
      powerLevel: null, radioInfo: null,
      amcLevel: null,
      micGain: null,
      speechProc: null,
      speechProcLevel: null,
      vox: null,
      voxGain: null,
      lastUpdate: Date.now(),
      error: null,
    }
  }

  getState() {
    return { ...this.state }
  }

  async listPorts() {
    return await SerialPort.list()
  }

  // ── Connect ────────────────────────────────────────────

  async connect(portPath, baudRate = 38400) {
    if (this.port?.isOpen) throw new Error('Already connected')

    return new Promise((resolve, reject) => {
      const sp = new SerialPort({
        path: portPath, baudRate: Number(baudRate),
        dataBits: 8, stopBits: 1, parity: 'none', autoOpen: false,
      })

      sp.open(async (err) => {
        if (err) { reject(new Error(`Cannot open ${portPath}: ${err.message}`)); return }

        const parser = new ReadlineParser({ delimiter: ';' })
        sp.pipe(parser)

        parser.on('data', (line) => {
          const t = line.trim()
          if (t.length >= 2) this._handleResponse(t)
        })

        sp.on('close', () => {
          this._stopSmeterPolling()
          this._stopParamsPolling()
          this.state.connected = false
          this.state.autoInfo = false
          this.state.error = 'Port closed'
          this.emit('stateChange', this.getState())
        })

        sp.on('error', (e) => {
          this.state.error = e.message
          this.emit('stateChange', this.getState())
        })

        this.port = sp
        this.state = {
          ...this.state,
          connected: true, port: portPath, baudRate: Number(baudRate),
          error: null, autoInfo: false,
        }

        // 1. One-time full sync to populate the initial state
        await this._initialSync()

        // 2. Enable Auto Information — transceiver will push changes automatically
        await this._enableAutoInfo()

        // 3. Start reduced polling: S-meter (real-time) + slow params
        //this._startSmeterPolling()
        //this._startParamsPolling()

        this.emit('stateChange', this.getState())
        resolve()
      })
    })
  }

  // ── Disconnect ─────────────────────────────────────────

  async disconnect() {
    this._stopSmeterPolling()
    this._stopParamsPolling()

    // Politely disable Auto Information before closing
    if (this.port?.isOpen) {
      try { await this.sendCommand('AI0', 500) } catch { /* ignore */ }
    }

    this._drainQueue(new Error('Disconnected'))
    if (this.port?.isOpen) {
      await new Promise((r) => this.port.close(() => r()))
    }
    this.port = null
    this.state = { ...this.state, connected: false, port: null, autoInfo: false }
    this.emit('stateChange', this.getState())
  }

  // ── Send a single CAT command and await the response ──

  async sendCommand(cmd, timeoutMs = 1500) {
    if (!this.port?.isOpen) throw new Error('Not connected')
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.queue = this.queue.filter(e => e !== entry)
        reject(new Error(`Timeout: ${cmd}`))
      }, timeoutMs)
      const entry = { cmd, resolve, reject, timer }
      this.queue.push(entry)
      this.port.write(cmd + ';', (err) => {
        if (err) {
          clearTimeout(timer)
          this.queue = this.queue.filter(e => e !== entry)
          reject(err)
        }
      })
    })
  }

  // ── Auto Information ───────────────────────────────────

  async _enableAutoInfo() {
    try {
      await this.sendCommand('AI1')
    } catch (e) {   
    
    }
    try {
      await this.sendCommand('AI')
      this.state.autoInfo = true
      console.log('[serial-server] Auto Information enabled (AI1)')
    } catch (e) {
      // AI might not be supported by firmware version — fall back gracefully
      console.warn('[serial-server] AI1 not acknowledged, falling back to polling only:', e.message)
      this.state.autoInfo = false
    }
  }

  // ── Initial full-state sync after connect ─────────────

  async _initialSync() {
    //
    const INIT_CMDS = ['FA', 'FB', 'MD0', 'MD1', 'TX', 'MX', 'ST', 'GT0', 'GT1', 'AG0', 'AG1', 'RG0', 'RG1', 'PC', 'RI0',
                       'AO', 'MG', 'PR0', 'PL', 'VX', 'VG']
    for (const cmd of INIT_CMDS) {
      if (!this.port?.isOpen) break
      try { await this.sendCommand(cmd, 800) } catch { /* non-fatal */ }
      await new Promise(r => setTimeout(r, 40))
    }
  }

  // ── S-meter polling (fast — 500 ms) ───────────────────
  // S-meter readings are never sent autonomously by AI mode.

  async _pollSmeter() {
    if (!this.port?.isOpen) return
    for (const cmd of ['SM0', 'SM1']) {
      if (!this.port?.isOpen) break
      try { await this.sendCommand(cmd, 500) } catch { /* non-fatal */ }
      await new Promise(r => setTimeout(r, 30))
    }
  }

  _startSmeterPolling() {
    if (this.smeterTimer) clearInterval(this.smeterTimer)
    this.smeterTimer = setInterval(() => this._pollSmeter(), 500)
  }

  _stopSmeterPolling() {
    if (this.smeterTimer) { clearInterval(this.smeterTimer); this.smeterTimer = null }
  }

  // ── Slow params polling (3 s) ─────────────────────────
  // AGC, RF/AF gain, power — not part of AI auto-reports.

  async _pollParams() {
    if (!this.port?.isOpen) return
    for (const cmd of ['GT0', 'AG0', 'RG0', 'PC', 'AO', 'MG', 'PR0', 'PL', 'VX', 'VG']) {
      if (!this.port?.isOpen) break
      try { await this.sendCommand(cmd, 800) } catch { /* non-fatal */ }
      await new Promise(r => setTimeout(r, 40))
    }
  }

  _startParamsPolling() {
    if (this.paramsTimer) clearInterval(this.paramsTimer)
    this.paramsTimer = setInterval(() => this._pollParams(), 3000)
  }

  _stopParamsPolling() {
    if (this.paramsTimer) { clearInterval(this.paramsTimer); this.paramsTimer = null }
  }

  // ── Incoming data dispatcher ───────────────────────────
  // Works for both solicited (queued) and unsolicited (AI) responses.

  _handleResponse(response) {
    if (response === '?') {
      const e = this.queue.shift()
      if (e) { clearTimeout(e.timer); e.reject(new Error('CAT error response')) }
      return
    }

    const prefix = response.substring(0, 2).toUpperCase()

    // If the head of the queue is expecting this prefix, resolve it.
    // Pass the original queued command so the parser can use it as a
    // discriminator fallback (e.g. SM0 vs SM1 — the FTX-1 always returns
    // '0' as the VFO byte regardless of which receiver was queried).
    if (this.queue.length > 0 && this.queue[0].cmd.substring(0, 2).toUpperCase() === prefix) {
      const e = this.queue.shift()
      clearTimeout(e.timer)
      this._parseResponse(prefix, response.substring(2), e.cmd)
      e.resolve(response)
      return
    }

    // Unsolicited AI response — no sourceCmd context available.
    this._parseResponse(prefix, response.substring(2))
  }

  // ── CAT response decoder ───────────────────────────────
  //
  // sourceCmd — the original command string from the queue (e.g. "SM1").
  // Used as a discriminator fallback when the radio's response payload
  // does not reliably encode the VFO byte (FTX-1 always returns '0' in
  // SM responses regardless of which receiver was queried).

  _parseResponse(cmd, params, sourceCmd = null) {
    switch (cmd) {
      case 'FA': this.state.mainFreq = parseInt(params, 10) || null; break
      case 'FB': this.state.subFreq = parseInt(params, 10) || null; break
      case 'MD':
        if (params[0] === '0') this.state.mainMode = MODE_MAP[params[1]?.toUpperCase()] ?? params[1] ?? null
        else if (params[0] === '1') this.state.subMode = MODE_MAP[params[1]?.toUpperCase()] ?? params[1] ?? null
        break
      case 'SM': {
        // The FTX-1 always encodes the VFO byte as '0' in the SM response body,
        // even when replying to an SM1 query. Use the third character of the
        // original queued command as the authoritative discriminator; fall back
        // to params[0] only for unsolicited AI frames (sourceCmd === null).
        const vfo = sourceCmd ? sourceCmd[2] : params[0]
        if (vfo === '0') this.state.mainSmeter = parseInt(params.substring(1), 10)
        else if (vfo === '1') this.state.subSmeter = parseInt(params.substring(1), 10)
        break
      }
      case 'TX': this.state.txState = params[0] === '1' || params[0] === '2'; break
      case 'MX': this.state.mox = params[0] === '1'; break
      case 'ST': this.state.split = params[0] === '1'; break
      case 'GT': {
          if (params[0] === '0') this.state.agcMain = AGC_MAP[params[1]] ?? params[1] ?? null; 
          else if (params[0] === '1') this.state.agcSub = AGC_MAP[params[1]] ?? params[1] ?? null; 
          break
      }
      case 'RG': {
          if (params[0] === '0') this.state.rfGainMain = parseInt(params.substring(1), 10); 
          else if (params[0] === '1') this.state.rfGainSub = parseInt(params.substring(1), 10); 
          break
      }
      case 'AG': {
          if (params[0] === '0') this.state.afGainMain = parseInt(params.substring(1), 10); 
          else if (params[0] === '1') this.state.afGainSub = parseInt(params.substring(1), 10); 
          break
      }
      case 'PC': this.state.powerLevel = parseInt(params.substring(1), 10) || null; break
      // ── TX audio / modulation parameters ──────────────
      // AO — AMC Output Level (001–100)
      case 'AO': this.state.amcLevel = parseInt(params, 10) || null; break
      // MG — Microphone Gain (000–100)
      case 'MG': this.state.micGain = parseInt(params, 10); break
      // PR — Speech Processor / Parametric EQ
      // Query PR0; → answer PR0x; where params[0]='0' (speech proc), params[1]: '1'=OFF '2'=ON
      case 'PR':
        if (params[0] === '0') this.state.speechProc = params[1] === '2'; break
      // PL — Speech Processor Level (000=OFF, 001–100)
      case 'PL': this.state.speechProcLevel = parseInt(params, 10); break
      // VX — VOX on/off (0=OFF, 1=ON)
      case 'VX': this.state.vox = params[0] === '1'; break
      // VG — VOX Gain (000–100)
      case 'VG': this.state.voxGain = parseInt(params, 10); break
      case 'RM': {
        if (params[0] === '1') this.state.mainSmeter = parseInt(params.substring(1, 4), 10)
        if (params[0] === '2') this.state.subSmeter = parseInt(params.substring(1, 4), 10)
        if (params[0] === '0') {
            this.state.mainSmeter = parseInt(params.substring(1, 4), 10)
            this.state.subSmeter = parseInt(params.substring(4, 8), 10)
        }
        break
      }
      case 'RI': {
        const p = params
        if (p.length >= 8) {
          this.state.radioInfo = {
            hiSwr: p[1] === '1', recording: p[2] === '1', playing: p[2] === '2',
            tx: p[3] === '1', txInhibit: p[3] === '2',
            tuning: p[5] === '1', scanning: p[6] === '1' || p[6] === '2',
            squelchOpen: p[7] === '1',
          }
          this.state.txState = p[3] === '1'
        }
        break
      }
      // IF (Info Frame) — sent automatically by AI mode on VFO/mode change
      case 'IF': {
        if (params.length >= 27) {
          const freq = parseInt(params.substring(5, 14), 10)
          if (freq > 0) this.state.mainFreq = freq
          const mode = params[21]?.toUpperCase()
          if (mode) this.state.mainMode = MODE_MAP[mode] ?? mode
          this.state.txState = params[26] === '1' || params[26] === '2'
        }
        break
      }
      // AI — acknowledgement of AI0/AI1 command
      case 'AI': this.state.autoInfo = params[0] === '1'; break
    }
    this.state.lastUpdate = Date.now()
    this.emit('stateChange', this.getState())
  }

  _drainQueue(err) {
    for (const e of this.queue) { clearTimeout(e.timer); e.reject(err) }
    this.queue = []
  }
}

// ──────────────────────────────────────────────────────────
// HTTP server helpers
// ──────────────────────────────────────────────────────────

const manager = new SerialManager()

/** Active SSE response streams — state changes are pushed to all of them. */
const sseClients = new Set()

manager.on('stateChange', (state) => {
  const payload = `data: ${JSON.stringify(state)}\n\n`
  for (const res of sseClients) {
    try { res.write(payload) } catch { sseClients.delete(res) }
  }
})

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => { data += chunk })
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}) }
      catch { reject(new Error('Invalid JSON')) }
    })
    req.on('error', reject)
  })
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

// ──────────────────────────────────────────────────────────
// HTTP server
// ──────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // CORS for local dev
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cache-Control')

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  const url = new URL(req.url, `http://localhost:${PORT}`)

  try {
    // ── GET /ports ──────────────────────────────────────
    if (url.pathname === '/ports' && req.method === 'GET') {
      const ports = await manager.listPorts()
      const sorted = ports.sort((a, b) =>
        (a.path.includes('/dev/cu.') ? -1 : 0) - (b.path.includes('/dev/cu.') ? -1 : 0)
      )
      return send(res, 200, { ports: sorted })
    }

    // ── GET /status ─────────────────────────────────────
    if (url.pathname === '/status' && req.method === 'GET') {
      return send(res, 200, manager.getState())
    }

    // ── GET /events  (Server-Sent Events) ───────────────
    // Client subscribes once; state changes are pushed as they happen.
    if (url.pathname === '/events' && req.method === 'GET') {
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.writeHead(200)

      // Send current state immediately so the client is not stale
      res.write(`data: ${JSON.stringify(manager.getState())}\n\n`)

      sseClients.add(res)
      console.log(`[serial-server] SSE client connected (total: ${sseClients.size})`)

      req.on('close', () => {
        sseClients.delete(res)
        console.log(`[serial-server] SSE client disconnected (total: ${sseClients.size})`)
      })
      return // keep response open — do NOT call send()
    }

    // ── POST /connect ───────────────────────────────────
    if (url.pathname === '/connect' && req.method === 'POST') {
      const body = await readBody(req)
      if (!body.port) return send(res, 400, { error: 'port is required' })
      await manager.connect(body.port, body.baudRate ?? 38400)
      return send(res, 200, { ok: true, state: manager.getState() })
    }

    // ── POST /disconnect ────────────────────────────────
    if (url.pathname === '/disconnect' && req.method === 'POST') {
      await manager.disconnect()
      return send(res, 200, { ok: true })
    }

    // ── POST /command ───────────────────────────────────
    if (url.pathname === '/command' && req.method === 'POST') {
      const body = await readBody(req)
      if (!body.command) return send(res, 400, { error: 'command is required' })
      const cmd = body.command.replace(/;+$/, '').trim()
      const response = await manager.sendCommand(cmd, 15000)
      return send(res, 200, { ok: true, response, state: manager.getState() })
    }

    // ── POST /preset ────────────────────────────────────
    if (url.pathname === '/preset' && req.method === 'POST') {
      const body = await readBody(req)
      if (!Array.isArray(body?.commands) || body.commands.length === 0) {
        return send(res, 400, { error: 'commands array is required' })
      }
      const results = []
      for (const raw of body.commands) {
        const cmd = String(raw).replace(/;+$/, '').trim()
        if (!cmd) continue
        try {
          const response = await manager.sendCommand(cmd, 1500)
          results.push({ command: cmd, response, ok: true })
        } catch (err) {
          results.push({ command: cmd, error: err.message, ok: false })
        }
        await new Promise(r => setTimeout(r, 100))
      }
      const anyFailed = results.some(r => !r.ok)
      return send(res, anyFailed ? 207 : 200, { ok: !anyFailed, results, state: manager.getState() })
    }

    send(res, 404, { error: 'Not found' })
  } catch (err) {
    send(res, 500, { error: err.message })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[serial-server] Listening on http://127.0.0.1:${PORT}`)
  console.log(`[serial-server] SSE endpoint: http://127.0.0.1:${PORT}/events`)
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  await manager.disconnect()
  server.close(() => process.exit(0))
})
process.on('SIGINT', async () => {
  await manager.disconnect()
  server.close(() => process.exit(0))
})

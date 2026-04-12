#!/usr/bin/env node
/**
 * Standalone serial port server for FTX-1 CAT communication.
 * Runs as a separate Node.js process on port 3001 to avoid
 * V8 locking issues when native addons are used inside Nuxt 3 / Nitro dev server.
 *
 * Uses CAT Auto Information (AI1) so the transceiver pushes state changes
 * automatically. 
 * State changes are broadcast to connected clients via Server-Sent Events (/events).
 */

import http from 'node:http'
import { EventEmitter } from 'node:events'
import { SerialPort } from 'serialport'
import { ReadlineParser } from '@serialport/parser-readline'

const PORT = 3001
const DEBUG = false

// ──────────────────────────────────────────────────────────
// CAT decode maps
// ──────────────────────────────────────────────────────────

const MODE_MAP = {
  '0': 'AMS', '1': 'LSB', '2': 'USB', '3': 'CW-U', '4': 'FM',
  '5': 'AM', '6': 'RTTY-L', '7': 'CW-L', '8': 'DATA-L', '9': 'RTTY-U',
  'A': 'DATA-FM', 'B': 'FM-N', 'C': 'DATA-U', 'D': 'AM-N', 'E': 'PSK',
  'F': 'DATA-FM-N', 'H': 'C4FM-DN', 'I': 'C4FM-VW',
}

const AGC_MAP = {
  '0': 'OFF', '1': 'FAST', '2': 'MID', '3': 'SLOW',
  '4': 'AUTO-F', '5': 'AUTO-M', '6': 'AUTO-S',
}

const FUNC_KNOB = {
  '0': '-', '1': 'D-LEVEL', '2': 'PEAK', '3': 'COLOR', '4': 'CONTRAST',
  '5': 'DIMMER', '6': '-', '7': 'MIC GAIN', '8': 'PROC LEVEL', '9': 'AMC LEVEL',
  'A': 'VOX GAIN', 'B': 'VOX DELAY', 'C': '-', 'D': 'RF POWER', 'E': 'MONI LEVEL',
  'F': 'CW SPEED', 'G': 'CW PITCH', 'H': 'BK-DELAY'
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
      txState: false, mox: false, split: false, lock: null,
      agcMain: null, rfGainMain: null, afGainMain: null, sqMain: null,
      agcSub: null, rfGainSub: null, afGainSub: null, sqSub: null,
      sqlRfMode: null,
      powerLevel: null, radioInfo: null,
      amcLevel: null,
      micGain: null,
      speechProc: null,
      speechProcLevel: null,
      funcKnob: null,
      vox: null,
      voxGain: null,
      txVfo: null,       
      rxMode: null,      
      mainSqlType: null, 
      subSqlType:  null, 
      // CN command: CTCSS tone index (0-49) and DCS code index (0-103)
      mainCtcssTone: null, subCtcssTone: null,
      mainDcsCode:   null, subDcsCode:   null,
      dnrMain: null,
      dnrSub: null,
      mainBandwidth: null, subBandwidth: null,   // SH index (0-based, mode-dependent)
      mainShift: null, subShift: null,            // IS value 0-4999 (2499 = center / 0 Hz)
      narrowMain: null, narrowSub: null,          // NA: true=ON, false=OFF
      rfAttenuator: false,
      preAmpHf: null,
      preAmpVhf: null,
      preAmpUhf: null,
      scopeSide: false,
      // SS — Band Scope settings
      scope: { mode: null, span: null, speed: null, level: null, att: null, color: null, marker: true },
      firmware: { main: null, display: null, sdr: null, dsp: null, spa1: null, fc80: null },
      antSelect: null,   // EX030704: 0=ANT1, 1=ANT2 (HF antenna select, SPA1 only)
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

        // 1. Identify radio — abort if not FTX-1
        try {
          const idResp = await this.sendCommand('ID', 2000)
          const idParams = idResp.substring(2)   // strip "ID" prefix
          if (idParams !== '0840') {
            const msg = `Unknown radio ID: ${idParams} (expected 0840)`
            console.error('[serial-server]', msg)
            this.state.error = msg
            this.emit('stateChange', this.getState())
            sp.close()
            reject(new Error(msg))
            return
          }
          console.log('[serial-server] Radio identified: FTX-1 (ID0840)')
        } catch (e) {
          const msg = `ID command failed: ${e.message}`
          console.error('[serial-server]', msg)
          this.state.error = msg
          this.emit('stateChange', this.getState())
          sp.close()
          reject(new Error(msg))
          return
        }

        // 2. Enable Auto Information — transceiver will push changes automatically
        await this._enableAutoInfo()

        // 3. Fire-and-forget initial sync (AI already active, no responses expected)
        await this._initialSync()

        //this.emit('stateChange', this.getState())
        //await
        this._initialSync2()

        this.emit('stateChange', this.getState())
        resolve()
      })
    })
  }

  // ── Disconnect ─────────────────────────────────────────

  async disconnect() {

    // Politely disable Auto Information before closing
    if (this.port?.isOpen) {
      try { await this.sendCommandNoWait('AI0') } catch { /* ignore */ }
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
    if (DEBUG) console.log(`[serial-to-send-wait] ${cmd}`)
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

  // ── Send a CAT command without waiting for a response (fire & forget) ──
  sendCommandNoWait(cmd) {
    if (!this.port?.isOpen) throw new Error('Not connected')
    if (DEBUG) console.log(`[serial-to-send-nowait] ${cmd}`)
    return new Promise((resolve, reject) => {
      this.port.write(cmd + ';', (err) => err ? reject(err) : resolve())
    })
  }

  // ── Auto Information ───────────────────────────────────
  async _enableAutoInfo() {
    try { await this.sendCommand('AI1') } catch (e) { /* ignore */ }
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
    // AI mode is already active — send queries fire-and-forget.
    // The transceiver will reply with unsolicited frames that _handleResponse will parse.
    const INIT_CMDS = ['FA', 'FB', 'MD0', 'MD1', 'TX', 'ST', 'GT0', 'GT1', 'AG0', 'AG1', 'RG0', 'RG1', 'PC', 'RI0', 'FR', 'FT', 'SS04' ]
    for (const cmd of INIT_CMDS) {
      if (!this.port?.isOpen) break
      try { await this.sendCommandNoWait(cmd) } catch { /* non-fatal */ }
      await new Promise(r => setTimeout(r, 40))
    }
  }

  // ── Initial full-state sync after connect ─────────────
  async _initialSync2() {
    // AI mode is already active — send queries fire-and-forget.
    // The transceiver will reply with unsolicited frames that _handleResponse will parse.
    const INIT_CMDS = ['NA0', 'NA1', 'AO', 'MG', 'PR0', 'PR1', 'PL', 'VX', 'VG', 'SF', 'CT0', 'CT1', 'CN00', 'CN01', 'CN10', 'CN11', 'RL0',
      'RL1', 'RA0', 'LK', 'SQ0', 'SQ1', 'SS05', 'SS00', 'SS03', 'SS06', 'PA0', 'PA1', 'PA2', 'VE0', 'VE1', 'VE2', 'VE3', 'VE4', 'VE5',
      'EX030704', 'SH0', 'IS0', 'EX030102']
    for (const cmd of INIT_CMDS) {
      if (!this.port?.isOpen) break
      try { await this.sendCommandNoWait(cmd) } catch { /* non-fatal */ }
      await new Promise(r => setTimeout(r, 40))
    }
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
    if (DEBUG) console.log(`[serial-received] ${response}`)

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
  // sourceCmd — the original command string from the queue (e.g. "SM1").
  _parseResponse(cmd, params, sourceCmd = null) {
    switch (cmd) {
      case 'FA': this.state.mainFreq = parseInt(params, 10) || null; break
      case 'FB': this.state.subFreq = parseInt(params, 10) || null; break
      // undocumented, switching the waterfall scope
      case 'FD': {
        this.state.scopeSide = params[0] === '1' ? 1 : 0;
        const CMDS = [`SS${this.state.scopeSide}5`, `SS${this.state.scopeSide}4`, `SS${this.state.scopeSide}0`, `SS${this.state.scopeSide}3`, `SS${this.state.scopeSide}6`];
        (async () => {
          for (const c of CMDS) {
            if (!this.port?.isOpen) break
            try { await this.sendCommandNoWait(c) } catch { /* non-fatal */ }
            await new Promise(r => setTimeout(r, 40))
          }
        })()
        break
      }
      // modulation (mode)
      case 'MD':
        if (params[0] === '0') {
          this.state.mainMode = MODE_MAP[params[1]?.toUpperCase()] ?? params[1] ?? null
          if ((this.state.mainMode === "FM-N")||(this.state.mainMode === "AM-N")||(this.state.mainMode === "DATA-FM-N")) this.state.narrowMain = 1
          if ((this.state.mainMode === "FM")||(this.state.mainMode === "AM")||(this.state.mainMode === "DATA-FM")) this.state.narrowMain = 0
        }
        else if (params[0] === '1') {
          this.state.subMode = MODE_MAP[params[1]?.toUpperCase()] ?? params[1] ?? null
          if ((this.state.subMode === "FM-N")||(this.state.subMode === "AM-N")||(this.state.subMode === "DATA-FM-N")) this.state.narrowSub = 1
          if ((this.state.subMode === "FM")||(this.state.subMode === "AM")||(this.state.subMode === "DATA-FM")) this.state.narrowSub = 0
        }
        break
      // S-meter (not used, RM instead)
      case 'SM': {
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
      case 'SQ': {
          if (params[0] === '0') this.state.sqMain = parseInt(params.substring(1), 10)
          else if (params[0] === '1') this.state.sqSub = parseInt(params.substring(1), 10)
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
        if (params[0] === '1') this.state.speechProc = params[1] === '1'; break
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
      case 'RL': {
        if (params[0] === '0') {
          this.state.dnrMain = parseInt(params.substring(1, 3), 10)
          if (this.state.dnrMain==0) this.state.dnrMain="OFF"
        }
        if (params[0] === '1') {
          this.state.dnrSub = parseInt(params.substring(1, 3), 10)
          if (this.state.dnrSub==0) this.state.dnrSub="OFF"
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
      case 'IF': {
        if (params.length >= 27) {
          const freq = parseInt(params.substring(5, 14), 10)
          if (freq > 0) this.state.mainFreq = freq
          const mode = params[21]?.toUpperCase()
          if (mode) this.state.mainMode = MODE_MAP[mode] ?? mode
          //const sqlType = parseInt(params[23], 10)
          //this.state.mainSqlType = isNaN(sqlType) ? null : sqlType
        }
        break
      }
      case 'OI': {
        if (params.length >= 27) {
          const freq = parseInt(params.substring(5, 14), 10)
          if (freq > 0) this.state.subFreq = freq
          const mode = params[21]?.toUpperCase()
          if (mode) this.state.subMode = MODE_MAP[mode] ?? mode
          //const sqlType = parseInt(params[23], 10)
          //this.state.subSqlType = isNaN(sqlType) ? null : sqlType
        }
        break
      }
      case 'SF': {
         const mode = params[1]?.toUpperCase()
         if (mode) this.state.funcKnob = FUNC_KNOB[mode] ?? mode
         break
      }
      // VE — firmware version query: VEP1P2…; raw params stored as-is
      case 'VE':
        if (params.length >= 5) {
          const s = { ...this.state.firmware }
          if      (params[0] === '0') s.main  = params.substring(2, 6)
          else if (params[0] === '1') s.display = params.substring(2, 6)
          else if (params[0] === '2') s.sdr  = params.substring(2, 6)
          else if (params[0] === '3') s.dsp = params.substring(2, 6)
          else if (params[0] === '4') s.spa1  = params.substring(2, 6)
          else if (params[0] === '5') s.fc80  = params.substring(2, 6)
          this.state.firmware = s   // new object reference — delta will detect it
        }
        break
      case 'EX':
        if (params.startsWith('030704')) this.state.antSelect = params[6] === '1' ? 1 : 0
        else if (params.startsWith('030102')) this.state.sqlRfMode = parseInt(params[6], 10)
        break
      case 'RA': this.state.rfAttenuator = params[1] === '1' ? 1 : 0; break
      case 'PA': {
        const band = params[0]
        const val  = parseInt(params[1], 10)
        if (band === '0') this.state.preAmpHf  = isNaN(val) ? null : val   // 0=IPO,1=AMP1,2=AMP2
        else if (band === '1') this.state.preAmpVhf = val === 1
        else if (band === '2') this.state.preAmpUhf = val === 1
        break
      }
      // FT — which side is set as transmitter (0=MAIN, 1=SUB)
      case 'FT': this.state.txVfo = params[0] === '1' ? 1 : 0; break
      // FR — receiver mode: "00"=Dual receive, "01"=Single receive
      case 'FR': this.state.rxMode = params === '01' ? 'single' : 'dual'; break
      // CT — SQL TYPE: CTP1P2; P1=VFO(0/1), P2=type(0-5)
      // 0=OFF, 1=CTCSS ENC, 2=CTCSS ENC+DEC, 3=DCS, 4=PR FREQ, 5=REV TONE
      case 'CT': {
        const vfo = sourceCmd ? sourceCmd[2] : params[0]
        const sqlType = parseInt(params[1] ?? params[0], 10)
        if (vfo === '0') this.state.mainSqlType = isNaN(sqlType) ? null : sqlType
        else if (vfo === '1') this.state.subSqlType = isNaN(sqlType) ? null : sqlType
        break
      }
      // CN — CTCSS/DCS number: CNP1P2P3P3P3;
      // P1=VFO(0/1), P2=type(0=CTCSS/1=DCS), P3P3P3=3-digit index
      case 'CN': {
        const vfo  = params[0]
        const type = params[1]   // '0'=CTCSS, '1'=DCS
        const num  = parseInt(params.substring(2), 10)
        if (!isNaN(num)) {
          if (type === '0') {
            if (vfo === '0') this.state.mainCtcssTone = num
            else if (vfo === '1') this.state.subCtcssTone = num
          } else if (type === '1') {
            if (vfo === '0') this.state.mainDcsCode = num
            else if (vfo === '1') this.state.subDcsCode = num
          }
        }
        break
      }
      // SH — Filter bandwidth index: SH P1 P2; P1=VFO(0/1), P2=2-digit index
      case 'SH': {
        const vfo = sourceCmd ? sourceCmd[2] : params[0]
        const idx = parseInt(params.substring(2,4), 10)
        if (vfo === '0') this.state.mainBandwidth = isNaN(idx) ? null : idx
        else if (vfo === '1') this.state.subBandwidth = isNaN(idx) ? null : idx
        break
      }
      // IS — IF Shift: IS P1 P2P3P4P4P4P4; P1=VFO(0/1), P2=+/- P4=4-digit value 0000-1200 (0=center)
      case 'IS': {
        const vfo = params[0]
        const val = parseInt(params.substring(2), 10)
        if (vfo === '0') this.state.mainShift = isNaN(val) ? null : val
        else if (vfo === '1') this.state.subShift = isNaN(val) ? null : val
        break
      }
      // NA — Narrow mode: NA P1 P2; P1=VFO(0/1), P2=0(OFF)/1(ON)
      case 'NA': {
        const vfo = sourceCmd ? sourceCmd[2] : params[0]
        if (vfo === '0') this.state.narrowMain = params[1] === '1' ? 1 : 0;
        else if (vfo === '1') this.state.narrowSub = params[1] === '1' ? 1 : 0;
        break
      }
      // LK — Dial Lock (0=OFF, 1=ON)
      case 'LK': this.state.lock = params[0] === '1'; break
      // SS — Band Scope settings; FTX-1 sends one sub-parameter per frame.
      case 'SS': {
        if (params.length >= 3) {
          const s = { ...this.state.scope }
          if      (params[1] === '0') s.speed  = parseInt(params[2], 10)
          else if (params[1] === '2') s.marker = params[2] === '1'        // 0=OFF, 1=ON
          else if (params[1] === '3') s.color  = parseInt(params[2], 16)  // hex 0–A
          else if (params[1] === '4') s.level = parseInt(params.substring(2, 6), 10)
          else if (params[1] === '5') s.span  = parseInt(params[2], 10)
          else if (params[1] === '6') s.mode  = parseInt(params[2], 10)
          else if (params[1] === '7') s.att   = parseInt(params[2], 10)
          this.state.scope = s   // new object reference — delta will detect it
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

/**
 * Last state that was broadcast to SSE clients.
 * Used to compute per-field deltas so only changed data is transmitted.
 */
let lastBroadcastState = null

/**
 * Returns an object containing only the fields that differ between prev and next.
 * Object-typed fields (e.g. radioInfo) are compared with JSON.stringify.
 */
function computeDelta(prev, next) {
  const delta = {}
  for (const key of Object.keys(next)) {
    const a = prev[key]
    const b = next[key]
    if (a === b) continue
    if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
      if (JSON.stringify(a) === JSON.stringify(b)) continue
    }
    delta[key] = b
  }
  return delta
}

manager.on('stateChange', (newState) => {
  if (sseClients.size === 0) {
    // No clients — keep lastBroadcastState in sync so the first
    // delta after a client connects is correct.
    lastBroadcastState = { ...newState }
    return
  }

  let payload
  if (!lastBroadcastState) {
    // First ever emission — send full state
    payload = `data: ${JSON.stringify(newState)}\n\n`
  } else {
    const delta = computeDelta(lastBroadcastState, newState)
    if (Object.keys(delta).length === 0) return  // nothing changed, skip
    // Mark as delta so the client knows to merge rather than replace
    payload = `data: ${JSON.stringify({ _delta: true, ...delta })}\n\n`
  }

  lastBroadcastState = { ...newState }

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

      // Send full current state immediately — client uses this as its baseline.
      // Synchronise lastBroadcastState so subsequent deltas are relative
      // to exactly what this client (and any others) just received.
      const snapshot = manager.getState()
      res.write(`data: ${JSON.stringify(snapshot)}\n\n`)
      lastBroadcastState = { ...snapshot }

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
      await manager.sendCommandNoWait(cmd)
      // Some commands do not generate AI unsolicited notifications.
      // For those, follow up with a read query after a short delay so the
      // response is parsed as an unsolicited frame, state is updated, and
      // an SSE delta is broadcast to all connected clients.
      const prefix = cmd.substring(0, 2).toUpperCase()
      // SS has no VFO byte — query is just 'SS'.
      // SQ / AG / RG include a VFO byte at position [2] — query is e.g. 'SQ0', 'AG1'.
      let followUpQuery = null
      if (prefix === 'SS' && cmd.length > 2) {
        followUpQuery = 'SS' + cmd.substring(2, 4)
      } else if (['RG'].includes(prefix) && cmd.length > 3) {
        followUpQuery = prefix + cmd[2]   // e.g. 'SQ0', 'AG1', 'RG0'
      } else if (prefix === 'PA' && cmd.length > 2) {
        //followUpQuery = 'PA' + cmd[2]     // e.g. 'PA0', 'PA1', 'PA2'
      }
      if (followUpQuery) {
        setTimeout(() => manager.sendCommandNoWait(followUpQuery).catch(() => {}), 150)
      }
      return send(res, 200, { ok: true, state: manager.getState() })
    }

    // ── POST /preset ────────────────────────────────────
    if (url.pathname === '/preset' && req.method === 'POST') {
      const body = await readBody(req)
      if (!Array.isArray(body?.commands) || body.commands.length === 0) {
        return send(res, 400, { error: 'commands array is required' })
      }
      const noWait = manager.state.autoInfo === true
      const results = []
      for (const raw of body.commands) {
        const cmd = String(raw).replace(/;+$/, '').trim()
        if (!cmd) continue
        try {
          if (noWait) {
            await manager.sendCommandNoWait(cmd)
            results.push({ command: cmd, ok: true })
          } else {
            const response = await manager.sendCommand(cmd, 1500)
            results.push({ command: cmd, response, ok: true })
          }
        } catch (err) {
          results.push({ command: cmd, error: err.message, ok: false })
        }
        await new Promise(r => setTimeout(r, 60))
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

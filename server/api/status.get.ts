export default defineEventHandler(async () => {
  const { serialServerUrl } = useRuntimeConfig()
  try {
    return await $fetch(`${serialServerUrl}/status`)
  } catch {
    // Serial server not running — return disconnected state
    return {
      connected: false, port: null, baudRate: 38400,
      mainFreq: null, subFreq: null, mainMode: null, subMode: null,
      mainSmeter: null, subSmeter: null, txState: false, mox: false,
      split: false, agcMain: null, rfGainMain: null, afGainMain: null,
      powerLevel: null, radioInfo: null, lastUpdate: Date.now(),
      error: 'Serial server unavailable',
    }
  }
})

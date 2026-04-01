import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export interface Preset {
  id: string
  label: string
  color?: string
  icon?: string
  description?: string
  commands: string[]
}

export interface PresetsConfig {
  presets: Preset[]
}

export default defineEventHandler((): PresetsConfig => {
  try {
    const configPath = resolve(process.cwd(), 'cat-presets.json')
    const raw = readFileSync(configPath, 'utf-8')
    const config = JSON.parse(raw) as PresetsConfig
    if (!Array.isArray(config.presets)) {
      throw new Error('presets field must be an array')
    }
    return config
  } catch (err: any) {
    throw createError({
      statusCode: 500,
      message: `Cannot read cat-presets.json: ${err.message}`,
    })
  }
})

export interface CommandResult {
  command: string
  response?: string
  error?: string
  ok: boolean
}

export interface PresetExecuteResult {
  ok: boolean
  results: CommandResult[]
  state: object
}

export default defineEventHandler(async (event): Promise<PresetExecuteResult> => {
  const { serialServerUrl } = useRuntimeConfig()
  const body = await readBody(event)

  if (!Array.isArray(body?.commands) || body.commands.length === 0) {
    throw createError({ statusCode: 400, message: 'commands array is required' })
  }

  try {
    return await $fetch<PresetExecuteResult>(`${serialServerUrl}/preset`, {
      method: 'POST',
      body: { commands: body.commands },
    })
  } catch (e: any) {
    throw createError({
      statusCode: e.status ?? 500,
      message: e.data?.error ?? e.message,
    })
  }
})

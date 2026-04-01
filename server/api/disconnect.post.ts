export default defineEventHandler(async () => {
  const { serialServerUrl } = useRuntimeConfig()
  try {
    return await $fetch(`${serialServerUrl}/disconnect`, { method: 'POST' })
  } catch (e: any) {
    throw createError({ statusCode: e.status ?? 500, message: e.data?.error ?? e.message })
  }
})

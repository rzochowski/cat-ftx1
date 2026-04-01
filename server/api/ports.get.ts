export default defineEventHandler(async () => {
  const { serialServerUrl } = useRuntimeConfig()
  try {
    return await $fetch(`${serialServerUrl}/ports`)
  } catch {
    throw createError({ statusCode: 503, message: 'Serial server unavailable. Make sure serial-server.mjs is running.' })
  }
})

export default defineNuxtConfig({
  devtools: { enabled: false },
  ssr: false,
  runtimeConfig: {
    serialServerUrl: 'http://127.0.0.1:3001',
    public: {
      // Exposed to the browser — used for the SSE EventSource connection
      serialEventsUrl: 'http://127.0.0.1:3001/events',
    },
  },
})

import Echo from 'laravel-echo'
import Pusher from 'pusher-js'

window.Pusher = Pusher

console.log('Echo boot start')

const echo = new Echo({
  broadcaster: 'reverb',
  key: import.meta.env.VITE_REVERB_APP_KEY,
  wsHost: import.meta.env.VITE_REVERB_HOST,
  wsPort: Number(import.meta.env.VITE_REVERB_PORT ?? 80),
  wssPort: Number(import.meta.env.VITE_REVERB_PORT ?? 443),
  forceTLS: (import.meta.env.VITE_REVERB_SCHEME ?? 'https') === 'https',
  enabledTransports: ['ws', 'wss'],
})

const pusher = echo.connector?.pusher

if (pusher) {
  pusher.connection.bind('state_change', (states) => {
    console.log('Reverb state change:', states)
  })

  pusher.connection.bind('connected', () => {
    console.log('Reverb connected')
  })

  pusher.connection.bind('error', (err) => {
    console.error('Reverb connection error:', err)
  })
}

window.Echo = echo

console.log('Echo booted', {
  key: import.meta.env.VITE_REVERB_APP_KEY,
  host: import.meta.env.VITE_REVERB_HOST,
  port: import.meta.env.VITE_REVERB_PORT,
  scheme: import.meta.env.VITE_REVERB_SCHEME,
  echo: window.Echo,
})
import Echo from 'laravel-echo'
import Pusher from 'pusher-js'

window.Pusher = Pusher

const echo = new Echo({
  broadcaster: 'pusher',
  key: import.meta.env.VITE_PUSHER_APP_KEY,
  cluster: 'mt1',
  wsHost: import.meta.env.VITE_PUSHER_HOST ?? '127.0.0.1',
  wsPort: Number(import.meta.env.VITE_PUSHER_PORT ?? 6001),
  wssPort: Number(import.meta.env.VITE_PUSHER_PORT ?? 6001),
  forceTLS: false,
  enabledTransports: ['ws'],
  disableStats: true,
})

window.Echo = echo  // add this line

export default echo
# Agsabay App

Ridepooling web app with driver and passenger flows, built with Vue 3 + Vite. It uses Leaflet for maps, Laravel Echo + Pusher for realtime updates, and ships as a PWA.

**Tech Stack**
- Vue 3 (Composition API)
- Vite + Vite PWA
- Leaflet (OpenStreetMap tiles)
- Laravel Echo + Pusher JS
- Sentry (optional)

**Requirements**
- Node.js `^20.19.0 || >=22.12.0` (see `package.json`)
- npm (or compatible package manager)

**Install**
```bash
npm install
```

**Run (Dev)**
```bash
npm run dev
```

**Build**
```bash
npm run build
```

**Preview Production Build**
```bash
npm run preview
```

**Environment Variables**
Create a `.env.local` (or `.env`) at the repo root. Vite only exposes variables prefixed with `VITE_`.

Example:
```bash
VITE_API_BASE_URL=https://agsabay-server.test
VITE_API_KEY=your-api-key
VITE_SENTRY_DSN=
VITE_PUSHER_APP_KEY=local
VITE_PUSHER_HOST=127.0.0.1
VITE_PUSHER_PORT=6001
VITE_DRIVER_LOCATION_MIN_INTERVAL_MS=8000
VITE_DRIVER_LOCATION_MIN_DISTANCE_M=20
VITE_DRIVER_LOCATION_MAX_ACCURACY_M=50
VITE_DRIVER_LOCATION_MAX_STALE_MS=30000
```

Variable reference:
- `VITE_API_BASE_URL` (required): Base URL for the backend API. Used by `src/services/api.js`.
- `VITE_API_KEY` (optional): If set, sent as `X-Api-Key` on all API requests.
- `VITE_SENTRY_DSN` (optional): Enables Sentry error reporting in `src/main.js`, `src/services/api.js`, and apps.
- `VITE_PUSHER_APP_KEY` (required for realtime): Key for Pusher/Echo. Used in `src/services/echo.js`.
- `VITE_PUSHER_HOST` (optional): WebSocket host for Echo. Defaults to `127.0.0.1`.
- `VITE_PUSHER_PORT` (optional): WebSocket port for Echo. Defaults to `6001`.
- `VITE_DRIVER_LOCATION_MIN_INTERVAL_MS` (optional): Minimum ms between location updates from the driver app. Default `8000`.
- `VITE_DRIVER_LOCATION_MIN_DISTANCE_M` (optional): Minimum meters moved before sending a new update. Default `20`.
- `VITE_DRIVER_LOCATION_MAX_ACCURACY_M` (optional): Ignore GPS fixes with accuracy worse than this (meters). Default `50`.
- `VITE_DRIVER_LOCATION_MAX_STALE_MS` (optional): Treat GPS as stale after this long (ms). Default `30000`.

**Backend Expectations**
API endpoints used by the client (see `src/services/api.js`):
- `POST /api/drivers/register`
- `POST /api/drivers/{driverId}/duty`
- `POST /api/drivers/{driverId}/location`
- `POST /api/drivers/{driverId}/dropoff/{passengerId}`
- `POST /api/passengers/request`
- `POST /api/passengers/confirm-boarding`
- `DELETE /api/passengers/request` (payload contains `session_token`)

Realtime channels and events (see `src/services/echo.js`, `src/components/driver/DriverApp.vue`, `src/components/passenger/PassengerApp.vue`):
- Channel `driver.{driverId}` with events `passenger.nearby`, `passenger.boarded`, `passenger.dropped`
- Channel `passenger.{sessionToken}` with events `match.found`, `passenger.dropped`

**Project Structure**
- `src/main.js` bootstraps Vue, Leaflet assets, Sentry, and PWA registration.
- `src/services/api.js` wraps Axios with API base URL + API key header and Sentry error capture.
- `src/services/echo.js` configures Laravel Echo + Pusher for websocket updates.
- `src/components/driver/DriverApp.vue` driver UI, GPS tracking, and realtime events.
- `src/components/passenger/PassengerApp.vue` passenger UI, map picking, and realtime events.
- `simulator/` contains standalone HTML simulators.

**Simulators**
- `simulator/tricycle_simulator-driver-location-click.html` — click the map to post driver location updates; update `API_BASE` and `API_KEY` inside the file for your environment.
- `simulator/tricycle_simulator-detour-model-beam3-best.html` — local-only algorithm sandbox for detour/matching behavior.

**Dependencies (What They Do)**
Runtime dependencies (`dependencies` in `package.json`):
- `@sentry/vue`: Error monitoring and performance tracing (optional, enabled with `VITE_SENTRY_DSN`).
- `axios`: HTTP client for backend API calls.
- `laravel-echo`: Realtime client for Laravel broadcasting.
- `leaflet`: Interactive maps.
- `pusher-js`: WebSocket transport used by Echo.
- `uuid`: Generates passenger session tokens.
- `vue`: UI framework.
- `vuex`: App state store (currently minimal).

Dev dependencies (`devDependencies` in `package.json`):
- `@vitejs/plugin-vue`: Vue SFC support for Vite.
- `vite`: Dev server and build tool.
- `vite-plugin-pwa`: PWA service worker + manifest integration.
- `vite-plugin-vue-devtools`: Vue DevTools integration for Vite.

**PWA Notes**
- Service worker registration runs on startup (`src/main.js`).
- `vite-plugin-pwa` is configured with `autoUpdate` and enabled in dev.
- If you see stale assets, clear site data or unregister the service worker in your browser.

**Common Issues**
- Missing realtime updates: verify `VITE_PUSHER_*` values and that your Echo server is reachable.
- API errors: confirm `VITE_API_BASE_URL` and `VITE_API_KEY` are correct.
- GPS not updating: ensure browser location permissions are granted.
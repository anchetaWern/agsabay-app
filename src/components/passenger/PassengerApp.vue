<template>
  <div style="width: 100%; display: flex; flex-direction: column; gap: 16px;">
    <ToastStack :toasts="toasts" @dismiss="dismissToast" />

    <div class="card" style="display: flex; justify-content: space-between; align-items: center;">
      <div>
        <p style="margin: 0; font-size: 14px; color: #6b7280;">Passenger mode</p>
        <strong>AgSabay</strong>
      </div>
      <button class="btn btn-secondary" style="width: auto;" @click="$emit('logout')">
        Change role
      </button>
    </div>

    <div v-show="screen === 'map'" class="card" style="display: grid; gap: 12px;">
      <div>
        <p style="margin: 0; font-size: 14px; color: #6b7280;">Step</p>
        <h3 style="margin: 4px 0 0;">{{ stepLabel }}</h3>
      </div>
      <div id="map" style="height: 320px; border-radius: 12px; overflow: hidden;"></div>
      <button class="btn btn-secondary" @click="useCurrentLocation">Use my current location</button>
      <button
        v-if="pickup && destination"
        class="btn btn-primary"
        :disabled="loading"
        @click="handleRequestRide"
      >
        {{ loading ? 'Requesting...' : 'Find a Tricycle' }}
      </button>
      <button class="btn btn-outline" @click="resetAll">Start over</button>
    </div>

    <div v-if="screen === 'waiting'" class="card" style="display: grid; gap: 16px; text-align: center;">
      <div>
        <div class="spinner"></div>
        <h3 style="margin: 12px 0 0;">Looking for tricycles...</h3>
      </div>
      <div>
        <div class="ttl-bar">
          <div class="ttl-bar__fill" :style="{ width: ttlPercent + '%' }"></div>
        </div>
        <p style="margin: 8px 0 0; color: #6b7280;">{{ ttlSeconds }} seconds remaining</p>
      </div>
      <button class="btn btn-danger" @click="handleCancel">Cancel</button>
    </div>

    <div v-if="screen === 'waiting'" class="card" style="display: grid; gap: 12px;">
      <h3 style="margin: 0;">Matches</h3>
      <p v-if="matches.length === 0" style="margin: 0; color: #6b7280;">No matches yet. Keep waiting...</p>
      <div v-for="match in matches" :key="match.plate_number" class="card match-card" style="box-shadow: none; border: 1px solid #e5e7eb;">
        <div class="match-card__ttl" aria-hidden="true">
          <svg class="ttl-ring" viewBox="0 0 36 36">
            <circle class="ttl-ring__bg" cx="18" cy="18" r="15.5" />
            <circle
              class="ttl-ring__fg"
              cx="18"
              cy="18"
              r="15.5"
              :style="getMatchRingStyle(match)"
            />
          </svg>
        </div>
        <h4 style="margin: 0 0 8px;">{{ match.plate_number }}</h4>
        <p style="margin: 0 0 12px; color: #6b7280;">Seats available: {{ match.seats_available }}</p>
        <button class="btn btn-success" @click="handleConfirm(match)">I'm on board</button>
      </div>
      <button class="btn btn-outline" :disabled="loading" @click="handleRequestRide">
        {{ loading ? 'Requesting...' : 'Re-hail' }}
      </button>
    </div>

    <div v-if="screen === 'onboard'" class="card" style="display: grid; gap: 12px; text-align: center;">
      <h3 style="margin: 0;">You're on board [{{ boardedPlate  }}]! Enjoy your ride.</h3>
    </div>

    <!-- SCREEN 5 — Dropped off -->
    <div v-if="screen === 'dropped'">
      <div class="page" style="justify-content: center; align-items: center; text-align: center;">
        <div style="font-size: 64px;">🏁</div>
        <h2 style="margin-top: 16px;">You've arrived!</h2>
        <p style="color:#FFF; font-size:14px; margin-top: 8px;">
          Thank you for riding with {{ boardedPlate }}.
        </p>
        <button class="btn btn-outline" style="margin-top: 32px;" @click="handleDone">
          Done
        </button>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import * as Sentry from '@sentry/vue'
import L from 'leaflet'
import { v4 as uuidv4 } from 'uuid'
import { useGps } from '../../composables/useGps'
import { useAlertSound } from '../../composables/useAlertSound'
import echo from '../../services/echo'
import { requestRide, cancelRequest, confirmBoarding } from '../../services/api'
import ToastStack from '../common/ToastStack.vue'

const DRIVER_MATCH_TIMEOUT = 180000; // 180000; // 3 minute

const screen = ref('map')
const pickup = ref(null)
const destination = ref(null)
const error = ref('')
const loading = ref(false)
const matches = ref([])
const ttlSeconds = ref(300)
const nowMs = ref(Date.now())
const toasts = ref([])

const { getCurrentPosition } = useGps()
const { unlockAudio, playBell } = useAlertSound()

const captureError = (err, context = {}) => {
  if (!import.meta.env.VITE_SENTRY_DSN) return
  Sentry.captureException(err, {
    tags: { source: 'passenger-app' },
    extra: context,
  })
}

let map = null
let pickupMarker = null
let destinationMarker = null
let ttlTimer = null
let matchTtlTimer = null
let channel = null
let droppedTimer = null
let toastId = 0

const TOAST_DURATION_MS = 5000

const showToast = (message, type = 'danger') => {
  if (!message) return
  const id = toastId++
  toasts.value = [...toasts.value, { id, message, type }]
  setTimeout(() => {
    dismissToast(id)
  }, TOAST_DURATION_MS)
}

const dismissToast = (id) => {
  toasts.value = toasts.value.filter((toast) => toast.id !== id)
}

const handleAudioUnlock = async () => {
  const ok = await unlockAudio()
  if (!ok) {
    showToast('Audio alerts blocked by browser. Tap again to enable.', 'info')
  }
}

const setError = (message) => {
  error.value = message
  if (message) showToast(message)
}

const clearError = () => {
  error.value = ''
}

const boardedPlate = ref(null)

const sessionToken = ref(localStorage.getItem('pax_session') || uuidv4())
if (!localStorage.getItem('pax_session')) {
  localStorage.setItem('pax_session', sessionToken.value)
}

const stepLabel = computed(() => {
  if (!pickup.value) return 'Tap your pickup location'
  if (!destination.value) return 'Now tap your destination'
  return 'Ready to request'
})

const ttlPercent = computed(() => (ttlSeconds.value / 300) * 100)

const getApiErrorMessage = (err, fallback) => {
  if (!err) return fallback
  const message =
    err?.response?.data?.error ||
    err?.message
  return typeof message === 'string' && message.trim() ? message : fallback
}

const initMap = () => {
  map = L.map('map').setView([16.615893, 120.316668], 15)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    updateWhenIdle: true,
    updateWhenZooming: false,
    keepBuffer: 1,
  }).addTo(map)

  map.on('click', (event) => {
    if (!pickup.value) {
      setPickup(event.latlng)
    } else if (!destination.value) {
      setDestination(event.latlng)
    }
  })
}

const makeIcon = (label, color) =>
  L.divIcon({
    html: `<div style="background:${color};color:#fff;border-radius:999px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700;">${label}</div>`,
    className: '',
    iconSize: [28, 28],
  })

const setPickup = (latlng) => {
  pickup.value = { lat: latlng.lat, lng: latlng.lng }
  if (pickupMarker) {
    pickupMarker.setLatLng(latlng)
  } else {
    pickupMarker = L.marker(latlng, { icon: makeIcon('P', '#16a34a') }).addTo(map)
  }
  fitBoundsIfReady()
}

const setDestination = (latlng) => {
  destination.value = { lat: latlng.lat, lng: latlng.lng }
  if (destinationMarker) {
    destinationMarker.setLatLng(latlng)
  } else {
    destinationMarker = L.marker(latlng, { icon: makeIcon('D', '#dc2626') }).addTo(map)
  }
  fitBoundsIfReady()
}

const fitBoundsIfReady = () => {
  if (pickup.value && destination.value) {
    const bounds = L.latLngBounds(
      [pickup.value.lat, pickup.value.lng],
      [destination.value.lat, destination.value.lng],
    )
    map.fitBounds(bounds, { padding: [40, 40] })
  }
}

const resetMarkers = () => {
  pickup.value = null
  destination.value = null
  clearError()
  if (pickupMarker) {
    map.removeLayer(pickupMarker)
    pickupMarker = null
  }
  if (destinationMarker) {
    map.removeLayer(destinationMarker)
    destinationMarker = null
  }
}

const useCurrentLocation = async () => {
  try {
    const position = await getCurrentPosition()
    const latlng = L.latLng(position.lat, position.lng)
    setPickup(latlng)
    map.setView(latlng, 16)
  } catch (err) {
    captureError(err, { action: 'use_current_location' })
    setError('Could not access your GPS.')
  }
}

const handleRequestRide = async () => {
  if (!pickup.value || !destination.value) return
  loading.value = true
  clearError()
  try {
    await handleAudioUnlock()
    handleCancel()

    await requestRide({
      session_token: sessionToken.value,
      pickup_lat: pickup.value.lat,
      pickup_lng: pickup.value.lng,
      destination_lat: destination.value.lat,
      destination_lng: destination.value.lng,
    })
    screen.value = 'waiting'
    startTtl()
  } catch (err) {
    captureError(err, {
      action: 'request_ride',
      session_token: sessionToken.value,
      pickup: pickup.value,
      destination: destination.value,
    })
    setError('Unable to request a ride.')
  } finally {
    loading.value = false
  }
}

const startTtl = () => {
  ttlSeconds.value = 300
  if (ttlTimer) clearInterval(ttlTimer)
  ttlTimer = setInterval(() => {
    ttlSeconds.value -= 1
    if (ttlSeconds.value <= 0) {
      clearInterval(ttlTimer)
      ttlTimer = null
      screen.value = 'map'
    }
  }, 1000)
}

const startMatchTtl = () => {
  if (matchTtlTimer) clearInterval(matchTtlTimer)
  matchTtlTimer = setInterval(() => {
    nowMs.value = Date.now()
  }, 1000)
}

const getMatchRemainingPercent = (match) => {
  if (!match.expiresAt) return 0
  const remaining = Math.max(match.expiresAt - nowMs.value, 0)
  return Math.min((remaining / DRIVER_MATCH_TIMEOUT) * 100, 100)
}

const getMatchRingStyle = (match) => {
  const percent = getMatchRemainingPercent(match)
  const circumference = 2 * Math.PI * 15.5
  const offset = circumference - (percent / 100) * circumference
  return {
    strokeDasharray: `${circumference}`,
    strokeDashoffset: `${offset}`,
  }
}

const handleCancel = async () => {
  try {
    await cancelRequest(sessionToken.value)
  } catch (err) {
    captureError(err, { action: 'cancel_request', session_token: sessionToken.value })
    // Ignore cancel errors.
  }
  screen.value = 'map'

  if (ttlTimer) {
    clearInterval(ttlTimer)
    ttlTimer = null
  }
}

const handleConfirm = async (match) => {
  
  clearError()
  try {
    const position = await getCurrentPosition()
    
    boardedPlate.value = match.plate_number 

    await confirmBoarding({
      session_token: sessionToken.value,
      driver_id: match.driver_id,
      lat: position.lat,
      lng: position.lng,
    })
    screen.value = 'onboard'
    if (ttlTimer) {
      clearInterval(ttlTimer)
      ttlTimer = null
    }
  } catch (err) {
    captureError(err, {
      action: 'confirm_boarding',
      session_token: sessionToken.value,
      driver_id: match?.driver_id,
    })
    setError(getApiErrorMessage(
      err,
      'Could not confirm. Are you near the tricycle?',
    ))
  }
}

const handleDone = () => {

  resetAll()
  setTimeout(() => {
    window.location.reload();
  }, 3000)
}

const closeSockets = () => {
  if (!channel) return
  channel.stopListening('match.found')
  channel.stopListening('passenger.dropped')
  echo.leave(`passenger.${sessionToken.value}`)
  channel = null
}

const resetAll = () => {
  if (ttlTimer) {
    clearInterval(ttlTimer)
    ttlTimer = null
  }
  if (matchTtlTimer) {
    clearInterval(matchTtlTimer)
    matchTtlTimer = null
  }
  if (droppedTimer) {
    clearTimeout(droppedTimer)
    droppedTimer = null
  }

  closeSockets()

  screen.value = 'map'
  pickup.value = null
  destination.value = null
  clearError()
  loading.value = false
  matches.value = []
  ttlSeconds.value = 300
  boardedPlate.value = null
  resetMarkers()

  if (map) {
    map.remove()
    map = null
  }

  sessionToken.value = uuidv4()
  localStorage.setItem('pax_session', sessionToken.value)
  setupChannel()

  nextTick(() => {
    initMap()
  })
}

const setupChannel = () => {
  channel = echo.channel(`passenger.${sessionToken.value}`)
  channel.subscription.bind('match.found', (payload) => {
    const exists = matches.value.some((item) => item.plate_number === payload.plate_number)
    if (!exists) {
      matches.value.push({
        ...payload,
        expiresAt: Date.now() + DRIVER_MATCH_TIMEOUT,
      })
      if (payload?.plate_number) {
        const seats = typeof payload?.seats_available === 'number'
          ? ` (${payload.seats_available} seat${payload.seats_available === 1 ? '' : 's'} available)`
          : ''
        showToast(`New match found: ${payload.plate_number}${seats}`, 'info')
      } else {
        showToast('New match found', 'info')
      }
      playBell()
      if (navigator.vibrate) navigator.vibrate(150)
      if (!matchTtlTimer) {
        startMatchTtl()
      }

      // Auto-remove this match after 30 seconds if not boarded
      setTimeout(() => {
        matches.value = matches.value.filter(m => m.plate_number !== payload.plate_number)
        // If no matches left, ensure TTL is running while waiting
        if (matches.value.length === 0 && screen.value === 'waiting') {
          startTtl()
        }
        if (matches.value.length === 0 && matchTtlTimer) {
          clearInterval(matchTtlTimer)
          matchTtlTimer = null
        }
      }, DRIVER_MATCH_TIMEOUT)
    }
  })

  channel.subscription.bind('passenger.dropped', (payload) => {
    console.log('dropped passenger: ', payload);
    screen.value = 'dropped'
    closeSockets()
    if (droppedTimer) {
      clearTimeout(droppedTimer)
    }
    droppedTimer = setTimeout(() => {
      resetAll()
    }, 30000)
  })
  

}

onMounted(() => {
  initMap()
  setupChannel()
})

onBeforeUnmount(() => {
  if (ttlTimer) {
    clearInterval(ttlTimer)
  }
  if (matchTtlTimer) {
    clearInterval(matchTtlTimer)
  }
  if (droppedTimer) {
    clearTimeout(droppedTimer)
  }
  closeSockets()
  if (map) {
    map.remove()
  }
})

watch(screen, async (next) => {
  if (next === 'map' && map) {
    await nextTick()
    map.invalidateSize()
  }
})
</script>

<style scoped>
.spinner {
  width: 42px;
  height: 42px;
  border-radius: 999px;
  border: 4px solid #e5e7eb;
  border-top-color: var(--color-secondary);
  margin: 0 auto;
  animation: spin 1s linear infinite;
}

.ttl-bar {
  width: 100%;
  height: 10px;
  background: #e5e7eb;
  border-radius: 999px;
  overflow: hidden;
}

.ttl-bar__fill {
  height: 100%;
  background: var(--color-secondary);
  transition: width 1s linear;
}

.match-card {
  position: relative;
}

.match-card__ttl {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 26px;
  height: 26px;
  pointer-events: none;
}

.ttl-ring {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.ttl-ring__bg {
  fill: none;
  stroke: #e5e7eb;
  stroke-width: 3;
}

.ttl-ring__fg {
  fill: none;
  stroke: var(--color-secondary);
  stroke-width: 3;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.25s linear;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

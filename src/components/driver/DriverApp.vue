<template>
  <div style="width: 100%; display: flex; flex-direction: column; gap: 16px;">
    <ToastStack :toasts="toasts" @dismiss="dismissToast" />

    <div v-if="!driverId" class="card" style="display: grid; gap: 16px;">
      <div>
        <h2 style="margin: 0 0 8px;">Driver Registration</h2>
        <p style="margin: 0; color: #6b7280;">Enter your tricycle plate number.</p>
      </div>
      <input
        v-model="plateInput"
        @input="forceUppercase"
        placeholder="ABC-1234"
        style="font-size: 20px; padding: 12px 14px; border-radius: 12px; border: 1px solid #d1d5db;"
      />
      <button class="btn btn-primary" :disabled="loading" @click="handleRegister">
        {{ loading ? 'Saving...' : 'Continue' }}
      </button>
    </div>

    <template v-else>
      <div class="card" style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
        <div>
          <p style="margin: 0; font-size: 14px; color: #6b7280;">Plate Number</p>
          <h2 style="margin: 4px 0 0;">{{ driverPlate }}</h2>
        </div>
        <button class="btn btn-secondary" style="width: auto;" @click="$emit('logout')">
          Change role
        </button>
      </div>

      <div class="card" style="display: grid; gap: 12px;">
        <div>
          <p style="margin: 0; color: #6b7280;">Duty status</p>
          <h3 style="margin: 4px 0 0;">{{ isOnDuty ? 'On duty' : 'Off duty' }}</h3>
        </div>
        <p style="margin: 0;">Seats available: {{ seatsAvailableDisplay }}</p>
        <button
          class="btn"
          :class="isOnDuty ? 'btn-danger' : 'btn-success'"
          :disabled="loading"
          @click="toggleDuty"
        >
          {{ isOnDuty ? 'Go off duty' : 'Go on duty' }}
        </button>
      </div>

      <div class="card" style="display: flex; align-items: center; gap: 12px;">
        <span
          :style="{
            width: '10px',
            height: '10px',
            borderRadius: '999px',
            background: gpsIndicatorColor,
            display: 'inline-block',
          }"
        ></span>
        <div>
          <p style="margin: 0; font-weight: 600;">
            {{ gpsStatusText }}
          </p>
          <p v-if="accuracy" style="margin: 4px 0 0; color: #6b7280;">
            Accuracy: {{ Math.round(accuracy) }}m
          </p>
          <p v-if="lastFixAt" style="margin: 4px 0 0; color: #6b7280;">
            Last fix: {{ lastFixDisplay }}
          </p>
          <button
            v-if="isOnDuty && gpsError"
            class="btn btn-secondary"
            style="width: auto; margin-top: 8px;"
            @click="retryGps"
          >
            Retry GPS
          </button>
        </div>
      </div>

      <div class="card" style="display: grid; gap: 10px;">
        <div>
          <p style="margin: 0; color: #6b7280;">Detected location</p>
          <h3 style="margin: 4px 0 0;">Map preview</h3>
        </div>
        <div
          style="width: 100%; height: 220px; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb; background: #f8fafc; display: flex; align-items: center; justify-content: center;"
        >
          <iframe
            v-if="mapEmbedUrl"
            :src="mapEmbedUrl"
            style="width: 100%; height: 100%; border: 0;"
            loading="lazy"
            decoding="async"
            fetchpriority="low"
            referrerpolicy="no-referrer-when-downgrade"
          ></iframe>
          <p v-else style="margin: 0; color: #6b7280;">Waiting for a GPS fix…</p>
        </div>
        <p v-if="lat !== null && lng !== null" style="margin: 0; color: #6b7280;">
          {{ lat.toFixed(5) }}, {{ lng.toFixed(5) }}
        </p>
      </div>

      <div
        v-if="nearbyAlert"
        class="card"
        style="background: #eff6ff; border: 1px solid #bfdbfe; display: grid; gap: 8px;"
      >
        <strong>Passenger nearby!</strong>
        <p style="margin: 0; color: #1e3a8a;">This alert will auto-dismiss.</p>
      </div>

      <div class="card" style="display: grid; gap: 12px;">
        <h3 style="margin: 0;">Onboard passengers</h3>
        <p v-if="onboardPassengers.length === 0" style="margin: 0; color: #6b7280;">
          No onboard passengers yet.
        </p>
        <div v-for="passenger in onboardPassengers" :key="passenger.id" style="display: flex; justify-content: space-between; align-items: center;">
          <span>Passenger ID: #{{ passenger.id }}</span>
          <button class="btn btn-secondary" style="width: auto;" @click="handleDropoff(passenger.id)">
            Drop off
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import * as Sentry from '@sentry/vue'
import { useGps } from '../../composables/useGps'
import { useAlertSound } from '../../composables/useAlertSound'
import echo from '../../services/echo'
import { registerDriver, setDriverDuty, updateDriverLocation, dropoffPassenger } from '../../services/api.js'
import ToastStack from '../common/ToastStack.vue'

const envNumber = (key, fallback) => {
  const raw = import.meta.env[key]
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

const MIN_INTERVAL_MS = envNumber('VITE_DRIVER_LOCATION_MIN_INTERVAL_MS', 8000)
const MIN_DISTANCE_M = envNumber('VITE_DRIVER_LOCATION_MIN_DISTANCE_M', 20)
const MAX_ACCURACY_M = envNumber('VITE_DRIVER_LOCATION_MAX_ACCURACY_M', 50)
const MAX_STALE_MS = envNumber('VITE_DRIVER_LOCATION_MAX_STALE_MS', 30000)

const driverId = ref(localStorage.getItem('driver_id'))
const driverPlate = ref(localStorage.getItem('driver_plate') || '')
const plateInput = ref(driverPlate.value)
const isOnDuty = ref(false)
const seatsAvailable = ref(null)
const loading = ref(false)
const error = ref('')
const nearbyAlert = ref(null)
const onboardPassengers = ref([])
const toasts = ref([])
const { unlockAudio, playBell } = useAlertSound()

const captureError = (err, context = {}) => {
  if (!import.meta.env.VITE_SENTRY_DSN) return
  Sentry.captureException(err, {
    tags: { source: 'driver-app' },
    extra: context,
  })
}

const {
  lat,
  lng,
  accuracy,
  error: gpsError,
  status: gpsStatus,
  lastFixAt,
  startWatching,
  stopWatching,
} = useGps()

let alertTimeout = null
let channel = null
let toastId = 0
let lastSentAt = 0
let lastSentLatLng = null

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

const seatsAvailableDisplay = computed(() =>
  seatsAvailable.value === null ? '--' : seatsAvailable.value,
)

const gpsStatusText = computed(() => {
  if (!isOnDuty.value) return 'GPS idle'
  if (gpsStatus.value === 'error') return gpsError.value || 'GPS error'
  if (gpsStatus.value === 'acquiring') return 'Acquiring GPS...'
  if (gpsStatus.value === 'active') return 'GPS active'
  return 'Acquiring GPS...'
})

const gpsIndicatorColor = computed(() => {
  if (!isOnDuty.value) return '#9ca3af'
  if (gpsStatus.value === 'error') return '#f59e0b'
  if (gpsStatus.value === 'acquiring') return '#f59e0b'
  return '#16a34a'
})

const mapLat = ref(null)
const mapLng = ref(null)

const mapEmbedUrl = computed(() => {
  if (mapLat.value === null || mapLng.value === null) return ''
  const delta = 0.002
  const left = mapLng.value - delta
  const right = mapLng.value + delta
  const top = mapLat.value + delta
  const bottom = mapLat.value - delta
  return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${mapLat.value}%2C${mapLng.value}`
})

const lastFixDisplay = computed(() => {
  if (!lastFixAt.value) return ''
  return new Date(lastFixAt.value).toLocaleTimeString()
})

const forceUppercase = () => {
  plateInput.value = plateInput.value.toUpperCase()
}

const handleRegister = async () => {
  if (!plateInput.value) {
    setError('Plate number is required.')
    return
  }

  loading.value = true
  clearError()
  try {
    const response = await registerDriver(plateInput.value)
    const payload = response.data
    driverId.value = String(payload.driver_id)
    driverPlate.value = payload.plate_number
    localStorage.setItem('driver_id', driverId.value)
    localStorage.setItem('driver_plate', driverPlate.value)
  } catch (err) {
    captureError(err, { action: 'register_driver', plate_number: plateInput.value })
    setError('Unable to register driver.')
  } finally {
    loading.value = false
  }
}

const toRadians = (value) => (value * Math.PI) / 180

const distanceMeters = (lat1, lng1, lat2, lng2) => {
  const earthRadius = 6371000
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return earthRadius * c
}

const handleGpsUpdate = async ({ lat: nextLat, lng: nextLng }) => {
  if (!isOnDuty.value) return
  if (gpsStatus.value !== 'active') return
  if (!driverId.value) return
  if (mapLat.value === null || mapLng.value === null) {
    mapLat.value = nextLat
    mapLng.value = nextLng
  }
  const now = Date.now()
  const shouldForce = lastSentAt === 0 || now - lastSentAt >= MAX_STALE_MS
  if (!shouldForce) {
    if (now - lastSentAt < MIN_INTERVAL_MS) return
    if (accuracy.value !== null && accuracy.value > MAX_ACCURACY_M) return
    if (lastSentLatLng) {
      const moved = distanceMeters(
        lastSentLatLng.lat,
        lastSentLatLng.lng,
        nextLat,
        nextLng,
      )
      if (moved < MIN_DISTANCE_M) return
    }
  }
  try {
    const response = await updateDriverLocation(driverId.value, nextLat, nextLng)
    if (response.data && typeof response.data.seats_available !== 'undefined') {
      seatsAvailable.value = response.data.seats_available
    }
    lastSentAt = now
    lastSentLatLng = { lat: nextLat, lng: nextLng }
  } catch (err) {
    captureError(err, {
      action: 'update_driver_location',
      driver_id: driverId.value,
      lat: nextLat,
      lng: nextLng,
    })
    // Ignore GPS update errors for now.
  }
}

const startDuty = async () => {
  if (!driverId.value) return
  loading.value = true
  try {
    const response = await setDriverDuty(driverId.value, true)
    isOnDuty.value = response.data?.is_on_duty ?? true
    lastSentAt = 0
    lastSentLatLng = null
    mapLat.value = null
    mapLng.value = null
    startWatching(handleGpsUpdate)
  } catch (err) {
    captureError(err, { action: 'start_duty', driver_id: driverId.value })
    setError('Could not go on duty.')
  } finally {
    loading.value = false
  }
}

const stopDuty = async () => {
  if (!driverId.value) return
  loading.value = true
  try {
    const response = await setDriverDuty(driverId.value, false)
    isOnDuty.value = response.data?.is_on_duty ?? false
    stopWatching()
    lastSentAt = 0
    lastSentLatLng = null
    mapLat.value = null
    mapLng.value = null
  } catch (err) {
    captureError(err, { action: 'stop_duty', driver_id: driverId.value })
    setError('Could not go off duty.')
  } finally {
    loading.value = false
  }
}

const retryGps = () => {
  if (!isOnDuty.value) return
  startWatching(handleGpsUpdate)
}

const toggleDuty = () => {
  if (isOnDuty.value) {
    stopDuty()
  } else {
    handleAudioUnlock()
    startDuty()
  }
}

const showNearbyAlert = (payload) => {
  nearbyAlert.value = {
    passengerId: payload.passenger_id,
    destLabel: payload.dest_label,
  }

  if (alertTimeout) {
    clearTimeout(alertTimeout)
  }
  alertTimeout = setTimeout(() => {
    nearbyAlert.value = null
  }, 15000)
}

const handleDropoff = async (passengerId) => {
  if (!driverId.value) return
  try {
    await dropoffPassenger(driverId.value, passengerId)
    onboardPassengers.value = onboardPassengers.value.filter((p) => p.id !== passengerId)
  } catch (err) {
    captureError(err, {
      action: 'dropoff_passenger',
      driver_id: driverId.value,
      passenger_id: passengerId,
    })
    // Ignore for now.
  }
}

const setupChannel = () => {
  if (!driverId.value) return
  channel = echo.channel(`driver.${driverId.value}`)

  channel.subscription.bind('passenger.nearby', (payload) => {
    showNearbyAlert(payload)
    playBell()
    if (navigator.vibrate) navigator.vibrate(150)
    if (payload?.dest_label) {
      showToast(`Passenger nearby`, 'info')
    } else {
      showToast('Passenger nearby', 'info')
    }
  })

  channel.subscription.bind('passenger.boarded', (payload) => {
    const exists = onboardPassengers.value.find(p => p.id === payload.passenger_id)
    if (!exists) {
      onboardPassengers.value.push({
        id:         payload.passenger_id,
        dest_label: payload.dest_label,
      })
      const destLabel = payload?.dest_label ? ` — ${payload.dest_label}` : ''
      showToast(`Passenger #${payload.passenger_id} onboarded${destLabel}`, 'info')
    }
    seatsAvailable.value = payload.seats_available
    nearbyAlert.value = null
  })

  channel.subscription.bind('passenger.dropped', (payload) => {
    onboardPassengers.value = onboardPassengers.value.filter(
      p => p.id !== payload.passenger_id
    )
    seatsAvailable.value = payload.seats_available
    if (lat.value !== null && lng.value !== null) {
      mapLat.value = lat.value
      mapLng.value = lng.value
    }
    const destLabel = payload?.dest_label ? ` — ${payload.dest_label}` : ''
    showToast(`Passenger #${payload.passenger_id} dropped off${destLabel}`, 'info')
  })

}

onMounted(() => {
  setupChannel()
})


onBeforeUnmount(() => {
  stopWatching()
  if (channel) {
    channel.subscription.unbind('passenger.nearby')
    channel.subscription.unbind('passenger.boarded')
    channel.subscription.unbind('passenger.dropped')
    echo.leave(`driver.${driverId.value}`)
  }
  if (alertTimeout) clearTimeout(alertTimeout)
})
</script>

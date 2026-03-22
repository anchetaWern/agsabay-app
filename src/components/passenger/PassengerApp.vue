<template>
  <div style="width: 100%; display: flex; flex-direction: column; gap: 16px;">
    <div class="card" style="display: flex; justify-content: space-between; align-items: center;">
      <div>
        <p style="margin: 0; font-size: 14px; color: #6b7280;">Passenger mode</p>
        <strong>AgSabay</strong>
      </div>
      <button class="btn btn-secondary" style="width: auto;" @click="$emit('logout')">
        Change role
      </button>
    </div>

    <div v-if="screen === 'map'" class="card" style="display: grid; gap: 12px;">
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
      <button class="btn btn-secondary" @click="resetMarkers">Start over</button>
      <p v-if="error" style="margin: 0; color: #dc2626;">{{ error }}</p>
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

    <div v-if="screen === 'matches'" class="card" style="display: grid; gap: 12px;">
      <h3 style="margin: 0;">Matches</h3>
      <p v-if="matches.length === 0" style="margin: 0; color: #6b7280;">Waiting for matches...</p>
      <div v-for="match in matches" :key="match.plate_number" class="card" style="box-shadow: none; border: 1px solid #e5e7eb;">
        <h4 style="margin: 0 0 8px;">{{ match.plate_number }}</h4>
        <p style="margin: 0 0 12px; color: #6b7280;">Seats available: {{ match.seats_available }}</p>
        <button class="btn btn-success" @click="handleConfirm(match)">I'm on board</button>
      </div>
    </div>

    <div v-if="screen === 'onboard'" class="card" style="display: grid; gap: 12px; text-align: center;">
      <h3 style="margin: 0;">You're on board [{{ boardedPlate  }}]! Enjoy your ride.</h3>
      <button class="btn btn-primary" @click="handleDone">Done</button>
    </div>

    <!-- SCREEN 5 — Dropped off -->
    <div v-if="screen === 'dropped'">
      <div class="page" style="justify-content: center; align-items: center; text-align: center;">
        <div style="font-size: 64px;">🏁</div>
        <h2 style="margin-top: 16px;">You've arrived!</h2>
        <p style="color:#666; font-size:14px; margin-top: 8px;">
          Thank you for riding with {{ boardedPlate }}.
        </p>
        <button class="btn btn-secondary" style="margin-top: 32px;" @click="resetAll">
          Done
        </button>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import L from 'leaflet'
import { v4 as uuidv4 } from 'uuid'
import { useGps } from '../../composables/useGps'
import echo from '../../services/echo'
import { requestRide, cancelRequest, confirmBoarding } from '../../services/api'

const screen = ref('map')
const pickup = ref(null)
const destination = ref(null)
const error = ref('')
const loading = ref(false)
const matches = ref([])
const ttlSeconds = ref(300)

const { getCurrentPosition } = useGps()

let map = null
let pickupMarker = null
let destinationMarker = null
let ttlTimer = null
let channel = null

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

const initMap = () => {
  map = L.map('map').setView([15.9755, 120.5714], 15)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
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
  error.value = ''
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
    error.value = 'Could not access your GPS.'
  }
}

const handleRequestRide = async () => {
  if (!pickup.value || !destination.value) return
  loading.value = true
  error.value = ''
  try {
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
    error.value = 'Unable to request a ride.'
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

const handleCancel = async () => {
  try {
    await cancelRequest(sessionToken.value)
  } catch (err) {
    // Ignore cancel errors.
  }
  screen.value = 'map'
  if (ttlTimer) {
    clearInterval(ttlTimer)
    ttlTimer = null
  }
}

const handleConfirm = async (match) => {
  console.log('MATCY==: ', match);
  error.value = ''
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
    error.value = 'Could not confirm. Are you near the tricycle?'
  }
}

const handleDone = () => {
  screen.value = 'map'
  matches.value = []
  resetMarkers()
  refreshSession()
}

const refreshSession = () => {
  if (channel) {
    channel.stopListening('match.found')
    echo.leave(`passenger.${sessionToken.value}`)
  }
  sessionToken.value = uuidv4()
  localStorage.setItem('pax_session', sessionToken.value)
  setupChannel()
}

const setupChannel = () => {
  channel = echo.channel(`passenger.${sessionToken.value}`)
  channel.subscription.bind('match.found', (payload) => {
    const exists = matches.value.some((item) => item.plate_number === payload.plate_number)
    if (!exists) {
      matches.value.push(payload)
    }
    if (screen.value !== 'onboard') {
      screen.value = 'matches'
    }
  })

  channel.subscription.bind('passenger.dropped', (payload) => {
    console.log('dropped passenger: ', payload);
    screen.value = 'dropped'
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
  if (channel) {
    channel.stopListening('match.found')
    echo.leave(`passenger.${sessionToken.value}`)
  }
  if (map) {
    map.remove()
  }
})

watch(screen, (next) => {
  if (next === 'map' && map) {
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
  border-top-color: #1a56db;
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
  background: #1a56db;
  transition: width 1s linear;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

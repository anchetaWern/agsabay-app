<template>
  <div style="width: 100%; display: flex; flex-direction: column; gap: 16px;">
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
      <p v-if="error" style="margin: 0; color: #dc2626;">{{ error }}</p>
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
        </div>
      </div>

      <div
        v-if="nearbyAlert"
        class="card"
        style="background: #eff6ff; border: 1px solid #bfdbfe; display: grid; gap: 8px;"
      >
        <strong>Passenger nearby — going to {{ nearbyAlert.destLabel }}</strong>
        <p style="margin: 0; color: #1e3a8a;">This alert will auto-dismiss.</p>
      </div>

      <div class="card" style="display: grid; gap: 12px;">
        <h3 style="margin: 0;">Onboard passengers</h3>
        <p v-if="onboardPassengers.length === 0" style="margin: 0; color: #6b7280;">
          No onboard passengers yet.
        </p>
        <div v-for="passenger in onboardPassengers" :key="passenger.id" style="display: flex; justify-content: space-between; align-items: center;">
          <span>Passenger {{ passenger.id }}</span>
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
import { useGps } from '../../composables/useGps'
import echo from '../../services/echo'
import { registerDriver, setDriverDuty, updateDriverLocation, dropoffPassenger } from '../../services/api'

const driverId = ref(localStorage.getItem('driver_id'))
const driverPlate = ref(localStorage.getItem('driver_plate') || '')
const plateInput = ref(driverPlate.value)
const isOnDuty = ref(false)
const seatsAvailable = ref(null)
const loading = ref(false)
const error = ref('')
const nearbyAlert = ref(null)
const onboardPassengers = ref([])

const { lat, lng, accuracy, error: gpsError, startWatching, stopWatching } = useGps()

let alertTimeout = null
let channel = null

const seatsAvailableDisplay = computed(() =>
  seatsAvailable.value === null ? '--' : seatsAvailable.value,
)

const gpsStatusText = computed(() => {
  if (!isOnDuty.value) return 'GPS idle'
  if (gpsError.value) return gpsError.value
  if (!lat.value || !lng.value) return 'Acquiring GPS...'
  return 'GPS active'
})

const gpsIndicatorColor = computed(() => {
  if (!isOnDuty.value) return '#9ca3af'
  if (gpsError.value) return '#f59e0b'
  if (!lat.value || !lng.value) return '#f59e0b'
  return '#16a34a'
})

const forceUppercase = () => {
  plateInput.value = plateInput.value.toUpperCase()
}

const handleRegister = async () => {
  if (!plateInput.value) {
    error.value = 'Plate number is required.'
    return
  }

  loading.value = true
  error.value = ''
  try {
    const response = await registerDriver(plateInput.value)
    const payload = response.data
    driverId.value = String(payload.driver_id)
    driverPlate.value = payload.plate_number
    localStorage.setItem('driver_id', driverId.value)
    localStorage.setItem('driver_plate', driverPlate.value)
  } catch (err) {
    error.value = 'Unable to register driver.'
  } finally {
    loading.value = false
  }
}

const handleGpsUpdate = async ({ lat: nextLat, lng: nextLng }) => {
  if (!driverId.value) return
  try {
    const response = await updateDriverLocation(driverId.value, nextLat, nextLng)
    if (response.data && typeof response.data.seats_available !== 'undefined') {
      seatsAvailable.value = response.data.seats_available
    }
  } catch (err) {
    // Ignore GPS update errors for now.
  }
}

const startDuty = async () => {
  if (!driverId.value) return
  loading.value = true
  try {
    const response = await setDriverDuty(driverId.value, true)
    isOnDuty.value = response.data?.is_on_duty ?? true
    startWatching(handleGpsUpdate)
  } catch (err) {
    error.value = 'Could not go on duty.'
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
  } catch (err) {
    error.value = 'Could not go off duty.'
  } finally {
    loading.value = false
  }
}

const toggleDuty = () => {
  if (isOnDuty.value) {
    stopDuty()
  } else {
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
    // Ignore for now.
  }
}

const setupChannel = () => {
  if (!driverId.value) return
  channel = echo.channel(`driver.${driverId.value}`)
  channel.listen('.passenger.nearby', (payload) => {
    showNearbyAlert(payload)
  })
}

onMounted(() => {
  setupChannel()
})

onBeforeUnmount(() => {
  stopWatching()
  if (channel) {
    channel.stopListening('.passenger.nearby')
    echo.leave(`driver.${driverId.value}`)
  }
  if (alertTimeout) {
    clearTimeout(alertTimeout)
  }
})
</script>

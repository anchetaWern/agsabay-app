import { ref, onUnmounted } from 'vue'

export function useGps() {
  const lat = ref(null)
  const lng = ref(null)
  const accuracy = ref(null)
  const error = ref(null)
  const status = ref('idle')
  const lastFixAt = ref(null)
  let watchId = null
  let watchdogId = null

  const handleSuccess = (position) => {
    lat.value = position.coords.latitude
    lng.value = position.coords.longitude
    accuracy.value = position.coords.accuracy
    error.value = null
    status.value = 'active'
    lastFixAt.value = Date.now()
    scheduleWatchdog()
  }

  const handleError = (err) => {
    error.value = err.message || 'Unable to access GPS.'
    status.value = 'error'
    clearWatchdog()
    stopWatching(false)
  }

  const clearWatchdog = () => {
    if (watchdogId !== null) {
      clearTimeout(watchdogId)
      watchdogId = null
    }
  }

  const scheduleWatchdog = () => {
    clearWatchdog()
    watchdogId = setTimeout(() => {
      if (status.value === 'active' || status.value === 'acquiring') {
        error.value = 'GPS timed out. Please retry.'
        status.value = 'error'
        stopWatching(false)
      }
    }, 20000)
  }

  const getCurrentPosition = () =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        const message = 'Geolocation is not supported.'
        error.value = message
        status.value = 'error'
        reject(new Error(message))
        return
      }

      status.value = 'acquiring'
      navigator.geolocation.getCurrentPosition(
        (position) => {
          handleSuccess(position)
          resolve({ lat: lat.value, lng: lng.value })
        },
        (err) => {
          handleError(err)
          reject(err)
        },
        {
          enableHighAccuracy: true,
          maximumAge: 3000,
        },
      )
    })

  const startWatching = (callback) => {
    if (!navigator.geolocation) {
      error.value = 'Geolocation is not supported.'
      status.value = 'error'
      return
    }

    stopWatching()
    error.value = null
    status.value = 'acquiring'
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        handleSuccess(position)
        if (callback) {
          callback({ lat: lat.value, lng: lng.value })
        }
      },
      handleError,
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
      },
    )
    scheduleWatchdog()
  }

  const stopWatching = (resetStatus = true) => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId)
      watchId = null
    }
    clearWatchdog()
    if (resetStatus) {
      status.value = 'idle'
    }
  }

  onUnmounted(() => {
    stopWatching()
  })

  return {
    lat,
    lng,
    accuracy,
    error,
    status,
    lastFixAt,
    getCurrentPosition,
    startWatching,
    stopWatching,
  }
}

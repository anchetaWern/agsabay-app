import { ref, onUnmounted } from 'vue'

export function useGps() {
  const lat = ref(null)
  const lng = ref(null)
  const accuracy = ref(null)
  const error = ref(null)
  let watchId = null

  const handleSuccess = (position) => {
    lat.value = position.coords.latitude
    lng.value = position.coords.longitude
    accuracy.value = position.coords.accuracy
    error.value = null
  }

  const handleError = (err) => {
    error.value = err.message || 'Unable to access GPS.'
  }

  const getCurrentPosition = () =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        const message = 'Geolocation is not supported.'
        error.value = message
        reject(new Error(message))
        return
      }

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
      return
    }

    stopWatching()
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
  }

  const stopWatching = () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId)
      watchId = null
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
    getCurrentPosition,
    startWatching,
    stopWatching,
  }
}

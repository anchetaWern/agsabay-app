import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
})

api.interceptors.request.use((config) => {
  const apiKey = import.meta.env.VITE_API_KEY
  if (apiKey) {
    config.headers = {
      ...config.headers,
      'X-Api-Key': apiKey,
    }
  }
  return config
})

export const registerDriver = (plateNumber) =>
  api.post('/api/drivers/register', { plate_number: plateNumber })

export const setDriverDuty = (driverId, onDuty) =>
  api.post(`/api/drivers/${driverId}/duty`, { on_duty: onDuty })

export const updateDriverLocation = (driverId, lat, lng) =>
  api.post(`/api/drivers/${driverId}/location`, { lat, lng })

export const dropoffPassenger = (driverId, passengerId) =>
  api.post(`/api/drivers/${driverId}/dropoff/${passengerId}`)

export const requestRide = (payload) => api.post('/api/passengers/request', payload)

export const confirmBoarding = (payload) =>
  api.post('/api/passengers/confirm-boarding', payload)

export const cancelRequest = (sessionToken) =>
  api.delete('/api/passengers/request', { data: { session_token: sessionToken } })

export default api

<template>
  <div class="page">
    <RolePicker v-if="!role" @select="handleSelect" />
    <DriverApp v-else-if="role === 'driver'" @logout="handleLogout" />
    <PassengerApp v-else @logout="handleLogout" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import RolePicker from './components/RolePicker.vue'
import DriverApp from './components/driver/DriverApp.vue'
import PassengerApp from './components/passenger/PassengerApp.vue'

const role = ref(null)

onMounted(() => {
  role.value = localStorage.getItem('role')
})

const handleSelect = (selectedRole) => {
  role.value = selectedRole
  localStorage.setItem('role', selectedRole)
}

const handleLogout = () => {
  role.value = null
  localStorage.removeItem('role')
}
</script>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #f3f4f6;
  color: #111827;
}

.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 16px 40px;
  max-width: 480px;
  margin: 0 auto;
  width: 100%;
}

.btn {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 14px 18px;
  border-radius: 12px;
  border: none;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}

.btn:active {
  transform: scale(0.98);
}

.btn-primary {
  background: #1a56db;
  color: #fff;
}

.btn-success {
  background: #16a34a;
  color: #fff;
}

.btn-danger {
  background: #dc2626;
  color: #fff;
}

.btn-secondary {
  background: #fff;
  color: #111827;
  border: 1px solid #d1d5db;
}

.card {
  width: 100%;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
  padding: 20px;
}
</style>

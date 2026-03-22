<template>
  <div class="card" style="text-align: center; display: grid; gap: 16px;">
    <div>
      <h1 style="margin: 0; font-size: 28px;">AgSabay</h1>
      <p style="margin: 8px 0 0; color: #6b7280;">Carpool matching for tricycles</p>
    </div>
    <button class="btn btn-primary" @click="$emit('select', 'driver')">I am a Driver</button>
    <button class="btn btn-secondary" @click="$emit('select', 'passenger')">I need a Ride</button>
  </div>
</template>

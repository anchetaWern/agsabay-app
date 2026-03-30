<template>
  <teleport to="body">
    <div class="toast-stack" aria-live="assertive" aria-atomic="true">
      <div v-for="toast in toasts" :key="toast.id" class="toast">
        <span class="toast__message">{{ toast.message }}</span>
        <button
          class="toast__close"
          type="button"
          @click="$emit('dismiss', toast.id)"
          aria-label="Dismiss"
        >
          x
        </button>
      </div>
    </div>
  </teleport>
</template>

<script setup>
defineProps({
  toasts: {
    type: Array,
    required: true,
  },
})

defineEmits(['dismiss'])
</script>

<style scoped>
.toast-stack {
  position: fixed;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  width: min(92vw, 420px);
  display: grid;
  gap: 8px;
  z-index: 10000;
  pointer-events: none;
}

.toast {
  pointer-events: auto;
  background: #b91c1c;
  color: #fff;
  border-radius: 12px;
  padding: 12px 14px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.35);
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.toast__message {
  flex: 1;
  font-size: 14px;
  line-height: 1.4;
}

.toast__close {
  background: transparent;
  border: none;
  color: #e5e7eb;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}
</style>

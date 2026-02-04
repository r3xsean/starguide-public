<script setup lang="ts">
import { computed } from 'vue';
import type { SyncStatus } from '../composables/useCloudSync';

interface Props {
  status: SyncStatus;
  lastSyncAt?: Date | null;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

const props = withDefaults(defineProps<Props>(), {
  lastSyncAt: null,
  showLabel: true,
  size: 'md',
});

const statusLabel = computed(() => {
  switch (props.status) {
    case 'syncing':
      return 'Syncing';
    case 'synced':
      return 'Synced';
    case 'error':
      return 'Error';
    default:
      return 'Ready';
  }
});

const lastSyncDisplay = computed(() => {
  if (!props.lastSyncAt) return '';

  const now = new Date();
  const diff = now.getTime() - props.lastSyncAt.getTime();

  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

  return props.lastSyncAt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
});
</script>

<template>
  <div class="sync-indicator" :class="[status, size]">
    <div class="indicator-dot">
      <svg
        v-if="status === 'syncing'"
        class="spin"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
      >
        <path d="M21 12a9 9 0 11-6.219-8.56" />
      </svg>
      <svg
        v-else-if="status === 'synced'"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fill-rule="evenodd"
          d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
          clip-rule="evenodd"
        />
      </svg>
      <svg
        v-else-if="status === 'error'"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fill-rule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
          clip-rule="evenodd"
        />
      </svg>
      <div v-else class="idle-dot"></div>
    </div>

    <div v-if="showLabel" class="indicator-text">
      <span class="status-label">{{ statusLabel }}</span>
      <span v-if="lastSyncDisplay && status === 'synced'" class="sync-time">
        {{ lastSyncDisplay }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.sync-indicator {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.sync-indicator.sm {
  gap: 0.375rem;
}

/* ==================
   DOT/ICON
   ================== */

.indicator-dot {
  display: flex;
  align-items: center;
  justify-content: center;
}

.sync-indicator.md .indicator-dot {
  width: 18px;
  height: 18px;
}

.sync-indicator.sm .indicator-dot {
  width: 14px;
  height: 14px;
}

.indicator-dot svg {
  width: 100%;
  height: 100%;
}

.idle-dot {
  width: 8px;
  height: 8px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 50%;
}

.sync-indicator.sm .idle-dot {
  width: 6px;
  height: 6px;
}

/* Status Colors */
.sync-indicator.syncing .indicator-dot svg {
  color: #f99307;
}

.sync-indicator.synced .indicator-dot svg {
  color: #22c55e;
}

.sync-indicator.error .indicator-dot svg {
  color: #ef4444;
}

.sync-indicator.idle .indicator-dot svg {
  color: rgba(255, 255, 255, 0.4);
}

/* Spin animation */
.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* ==================
   TEXT
   ================== */

.indicator-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.status-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
}

.sync-indicator.sm .status-label {
  font-size: 0.75rem;
}

.sync-indicator.syncing .status-label {
  color: #f99307;
}

.sync-indicator.synced .status-label {
  color: #22c55e;
}

.sync-indicator.error .status-label {
  color: #ef4444;
}

.sync-time {
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.4);
}

.sync-indicator.sm .sync-time {
  font-size: 0.625rem;
}
</style>

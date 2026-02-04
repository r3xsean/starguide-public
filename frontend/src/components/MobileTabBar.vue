<script setup lang="ts">
type ViewMode = 'characters' | 'best-teams' | 'pull-advisor' | 'banner-advisor' | 'profile' | 'admin' | 'roster';

interface Props {
  viewMode: ViewMode;
  isLoggedIn?: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'change-view': [ViewMode];
}>();

const tabs = [
  {
    id: 'characters',
    icon: '👤',
    label: 'Chars',
    view: 'characters' as ViewMode,
  },
  {
    id: 'best-teams',
    icon: '◇',
    label: 'Teams',
    view: 'best-teams' as ViewMode,
  },
  {
    id: 'pull-advisor',
    icon: '◎',
    label: 'Pull',
    view: 'pull-advisor' as ViewMode,
  },
  {
    id: 'banner-advisor',
    icon: '✦',
    label: 'Banner',
    view: 'banner-advisor' as ViewMode,
  },
  {
    id: 'profile',
    icon: '⬡',
    label: 'Profile',
    view: 'profile' as ViewMode,
  },
];
</script>

<template>
  <nav class="mobile-tab-bar safe-area-bottom">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      class="tab-item touch-target"
      :class="{ 'tab-active': props.viewMode === tab.view }"
      @click="emit('change-view', tab.view)"
    >
      <span class="tab-icon">{{ tab.icon }}</span>
      <span class="tab-label">{{ tab.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
.mobile-tab-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 64px;
  display: flex;
  justify-content: space-around;
  align-items: center;
  background: rgba(10, 10, 26, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  z-index: 9000;
}

.tab-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  flex: 1;
  max-width: 80px;
  padding: 0.4rem 0.25rem;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab-item:active {
  transform: scale(0.95);
}

.tab-active {
  color: var(--color-stellar-500);
}

.tab-active .tab-icon {
  filter: drop-shadow(0 0 8px rgba(249, 147, 7, 0.6));
}

.tab-icon {
  font-size: 1.25rem;
  line-height: 1;
  transition: filter 0.2s ease;
}

.tab-label {
  font-family: var(--font-body);
  font-size: 0.5625rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
</style>

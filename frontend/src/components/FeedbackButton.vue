<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

interface Props {
  tooltip?: string;
  size?: 'sm' | 'md';
  label?: string;
}

withDefaults(defineProps<Props>(), {
  tooltip: 'Report an issue',
  size: 'sm',
  label: undefined,
});

const emit = defineEmits<{
  click: [];
}>();

// Tooltip state
const showTooltip = ref(false);
const tooltipPosition = ref<{ x: number; y: number; position: 'above' | 'below' }>({ x: 0, y: 0, position: 'above' });
const tooltipLockedByClick = ref(false);
const buttonRef = ref<HTMLButtonElement | null>(null);

// Detect touch device
const isTouchDevice = ref(false);

// Attention animation state
const playAttention = ref(false);
const isVisible = ref(false);
let attentionTimer: ReturnType<typeof setTimeout> | null = null;
let observer: IntersectionObserver | null = null;

function clearAttentionTimer() {
  if (attentionTimer) {
    clearTimeout(attentionTimer);
    attentionTimer = null;
  }
}

function scheduleAttentionAnimation(isRepeat = false) {
  // Don't schedule if not visible
  if (!isVisible.value) return;

  clearAttentionTimer();

  // Initial: 3-8 seconds, Repeat: 15-30 seconds
  const delay = isRepeat
    ? 15000 + Math.random() * 15000
    : 3000 + Math.random() * 5000;

  attentionTimer = setTimeout(() => {
    // Double-check still visible before animating
    if (!isVisible.value) return;

    playAttention.value = true;
    // Reset after animation completes to allow re-triggering
    setTimeout(() => {
      playAttention.value = false;
      // Schedule next animation with longer interval
      scheduleAttentionAnimation(true);
    }, 600);
  }, delay);
}

function handleVisibilityChange(entries: IntersectionObserverEntry[]) {
  const entry = entries[0];
  if (!entry) return;

  isVisible.value = entry.isIntersecting;

  if (entry.isIntersecting) {
    // Became visible - start animation timer
    scheduleAttentionAnimation();
  } else {
    // Went out of view - cancel pending animation
    clearAttentionTimer();
    playAttention.value = false;
  }
}

onMounted(() => {
  isTouchDevice.value = window.matchMedia('(hover: none)').matches;
  window.addEventListener('scroll', hideTooltip, true);

  // Set up intersection observer to detect visibility
  if (buttonRef.value) {
    observer = new IntersectionObserver(handleVisibilityChange, {
      threshold: 0.5, // At least 50% visible
    });
    observer.observe(buttonRef.value);
  }
});

onUnmounted(() => {
  window.removeEventListener('scroll', hideTooltip, true);
  clearAttentionTimer();
  if (observer) {
    observer.disconnect();
  }
});

function calculatePosition(target: HTMLElement): { x: number; y: number; position: 'above' | 'below' } {
  const rect = target.getBoundingClientRect();
  const tooltipHeight = 40;
  const tooltipWidth = 160;

  let x = rect.left + rect.width / 2;
  const minX = tooltipWidth / 2 + 8;
  const maxX = window.innerWidth - tooltipWidth / 2 - 8;
  x = Math.max(minX, Math.min(maxX, x));

  const spaceAbove = rect.top;
  const spaceBelow = window.innerHeight - rect.bottom;
  const position: 'above' | 'below' = spaceAbove < tooltipHeight + 20 && spaceBelow > spaceAbove ? 'below' : 'above';
  const y = position === 'above' ? rect.top : rect.bottom;

  return { x, y, position };
}

function handleMouseEnter(e: Event) {
  if (isTouchDevice.value || tooltipLockedByClick.value) return;

  const target = e.currentTarget as HTMLElement;
  const pos = calculatePosition(target);
  tooltipPosition.value = pos;
  showTooltip.value = true;
}

function handleMouseLeave() {
  if (tooltipLockedByClick.value) return;
  showTooltip.value = false;
}

function handleTooltipTap(e: Event) {
  e.stopPropagation();

  if (!isTouchDevice.value) return; // Only for touch devices

  if (showTooltip.value) {
    hideTooltip();
  } else {
    const target = e.currentTarget as HTMLElement;
    const pos = calculatePosition(target);
    tooltipPosition.value = pos;
    showTooltip.value = true;
    tooltipLockedByClick.value = true;
  }
}

function hideTooltip() {
  showTooltip.value = false;
  tooltipLockedByClick.value = false;
}

function handleClick(e: Event) {
  e.stopPropagation();
  hideTooltip();
  emit('click');
}
</script>

<template>
  <button
    ref="buttonRef"
    class="feedback-btn"
    :class="[size, { 'has-label': label, 'attention': playAttention }]"
    @click="handleClick"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    @touchstart.passive="handleTooltipTap"
  >
    <svg
      class="flag-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
    <span v-if="label" class="btn-label">{{ label }}</span>
  </button>

  <!-- Teleported tooltip -->
  <Teleport to="body">
    <Transition name="tooltip-fade">
      <div
        v-if="showTooltip"
        class="feedback-tooltip"
        :class="tooltipPosition.position"
        :style="{ left: `${tooltipPosition.x}px`, top: `${tooltipPosition.y}px` }"
        @click.stop
      >
        {{ tooltip }}
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.feedback-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: rgba(255, 255, 255, 0.35);
  flex-shrink: 0;
}

.feedback-btn:hover {
  background: rgba(251, 146, 60, 0.1);
  border-color: rgba(251, 146, 60, 0.3);
  color: rgba(251, 146, 60, 0.9);
  transform: scale(1.05);
}

.feedback-btn:active {
  transform: scale(0.98);
}

/* Size variants */
.feedback-btn.sm {
  width: 24px;
  height: 24px;
  padding: 4px;
}

.feedback-btn.sm .flag-icon {
  width: 14px;
  height: 14px;
}

.feedback-btn.md {
  width: 28px;
  height: 28px;
  padding: 5px;
}

.feedback-btn.md .flag-icon {
  width: 16px;
  height: 16px;
}

/* With label */
.feedback-btn.has-label {
  width: auto;
  padding: 4px 10px 4px 8px;
  gap: 6px;
}

.feedback-btn.has-label.sm {
  height: 26px;
}

.feedback-btn.has-label.md {
  height: 30px;
}

.btn-label {
  font-size: 0.6875rem;
  font-weight: 500;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

/* Flag icon */
.flag-icon {
  transition: all 0.2s ease;
}

.feedback-btn:hover .flag-icon {
  animation: flag-wave 0.4s ease-in-out;
}

@keyframes flag-wave {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(-5deg); }
  75% { transform: rotate(5deg); }
}

/* Attention animation */
.feedback-btn.attention {
  animation: attention-pulse 0.6s ease-in-out;
}

@keyframes attention-pulse {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(251, 146, 60, 0);
  }
  30% {
    transform: scale(1.1);
    box-shadow: 0 0 8px 2px rgba(251, 146, 60, 0.4);
    border-color: rgba(251, 146, 60, 0.5);
    color: rgba(251, 146, 60, 0.8);
  }
  60% {
    transform: scale(1.05);
    box-shadow: 0 0 12px 4px rgba(251, 146, 60, 0.2);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(251, 146, 60, 0);
  }
}
</style>

<style>
/* Global styles for teleported tooltip */
.feedback-tooltip {
  position: fixed;
  background: rgba(15, 15, 35, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  padding: 0.375rem 0.625rem;
  font-size: 0.6875rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
  white-space: nowrap;
  z-index: 99999;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  pointer-events: none;
}

/* Position above (default) */
.feedback-tooltip.above {
  transform: translate(-50%, calc(-100% - 8px));
}

/* Position below */
.feedback-tooltip.below {
  transform: translate(-50%, 8px);
}

/* Tooltip transition */
.tooltip-fade-enter-active,
.tooltip-fade-leave-active {
  transition: opacity 0.15s ease-out, transform 0.15s ease-out;
}

.tooltip-fade-enter-from.above,
.tooltip-fade-leave-to.above {
  opacity: 0;
  transform: translate(-50%, calc(-100% - 4px));
}

.tooltip-fade-enter-from.below,
.tooltip-fade-leave-to.below {
  opacity: 0;
  transform: translate(-50%, 4px);
}
</style>

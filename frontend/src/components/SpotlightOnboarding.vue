<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import type { Character, UserRosterMap } from '../types';
import {
  registerModal,
  requestShow,
  shouldShow,
  markClosed,
  MODAL_CHECK_DELAY,
} from '../utils/modalQueue';

const MODAL_ID = 'onboarding' as const;

// ==================
// PROPS & EMITS
// ==================

interface Props {
  roster: UserRosterMap;
  characters: Character[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'change-view': [viewMode: 'characters' | 'best-teams' | 'pull-advisor' | 'banner-advisor'];
  'change-tab': [tab: 'teammates' | 'my-teams' | 'investment'];
}>();

// ==================
// TYPES
// ==================

interface OnboardingStep {
  id: string;
  target: string | null; // data-onboarding attribute value, null for centered
  title: string;
  description: string;
  icon: string;
  position: 'top' | 'bottom' | 'left' | 'right' | 'center';
  waitForInteraction?: boolean;
  interactionHint?: string;
  navigateTo?: 'characters' | 'best-teams' | 'pull-advisor' | 'banner-advisor';
  showProgress?: boolean;
  noOverlay?: boolean; // If true, hide the dark overlay and just show floating tooltip
}

// ==================
// STEPS CONFIGURATION
// ==================

const steps: OnboardingStep[] = [
  {
    id: 'welcome',
    target: null,
    title: 'Welcome to StarGuide',
    description: 'Your companion for building optimal teams in Honkai: Star Rail. Let me show you around the cosmos.',
    icon: '✦',
    position: 'center',
  },
  {
    id: 'roster-builder',
    target: 'character-grid',
    title: 'Add Your Roster',
    description: 'Right-click characters to mark them as owned (✓) or planning to pull (?). Add all the characters you have — the more you add, the better your team recommendations!',
    icon: '🎯',
    position: 'right',
    waitForInteraction: true,
    interactionHint: 'Right-click characters to add them...',
    showProgress: true,
  },
  {
    id: 'select-character',
    target: 'character-grid',
    title: 'Select a Character',
    description: 'Now click on any character to see their details and team recommendations.',
    icon: '👆',
    position: 'right',
    waitForInteraction: true,
    interactionHint: 'Click a character to continue...',
  },
  {
    id: 'character-header',
    target: 'character-header',
    title: 'Character Details',
    description: 'See element, path, role, and tier ratings for each game mode (MoC, Pure Fiction, Apocalyptic Shadow). The tier shown is averaged across modes.',
    icon: 'ℹ️',
    position: 'bottom',
  },
  {
    id: 'tabs',
    target: 'main-tabs',
    title: 'Character Tabs',
    description: 'Switch between Investment (eidolons & light cones), Teammates (recommended partners), and My Teams (auto-generated from your roster).',
    icon: '◈',
    position: 'bottom',
  },
  {
    id: 'teammates',
    target: 'teammates-section',
    title: 'Teammate Recommendations',
    description: 'View S/A/B/C/D rated teammates with explanations. S = Best in Slot, A = Great, down to D = Last Resort. Filter by what you own!',
    icon: '⭐',
    position: 'left',
  },
  {
    id: 'best-teams',
    target: 'best-teams-section',
    title: 'Pre-Built Teams',
    description: 'Curated team compositions with structure info (Hypercarry, Dual Carry, etc). Click any team to see the full breakdown and synergies.',
    icon: '🏆',
    position: 'left',
  },
  {
    id: 'view-modes',
    target: 'view-toggles',
    title: 'Top-Level Views',
    description: 'These buttons switch between different views. Let me show you each one!',
    icon: '🔧',
    position: 'right',
  },
  {
    id: 'best-teams-view',
    target: 'best-teams-header',
    title: 'Best Teams View',
    description: 'This view shows optimal team formations built from your owned characters. Teams are ranked by synergy and character tiers for each game mode.',
    icon: '◇',
    position: 'bottom',
    navigateTo: 'best-teams',
    noOverlay: true,
  },
  {
    id: 'best-teams-lock',
    target: 'best-teams-lock-tip',
    title: 'Lock Teams for MoC',
    description: 'Planning multiple teams for Memory of Chaos? Lock a team to reserve those characters, then see what other teams you can build with your remaining roster!',
    icon: '🔒',
    position: 'bottom',
    noOverlay: true,
  },
  {
    id: 'pull-advisor-view',
    target: 'pull-advisor-header',
    title: 'Pull Advisor View',
    description: 'Find characters that synergize with your roster. Higher ratings mean more of your characters want them!',
    icon: '◎',
    position: 'bottom',
    navigateTo: 'pull-advisor',
    noOverlay: true,
  },
  {
    id: 'pull-advisor-tabs',
    target: 'pull-advisor-subtabs',
    title: 'DPS vs Support Tabs',
    description: '"For Your DPS" shows supports your DPS characters want. "For Your Supports" shows DPS characters your supports can enable.',
    icon: '↔️',
    position: 'bottom',
    noOverlay: true,
  },
  {
    id: 'banner-advisor-view',
    target: 'banner-advisor-header',
    title: 'Banner Advisor View',
    description: 'Rate current and upcoming banners based on how well each character synergizes with YOUR roster. Grouped by DPS and Supports.',
    icon: '✦',
    position: 'bottom',
    navigateTo: 'banner-advisor',
    noOverlay: true,
  },
  {
    id: 'feedback',
    target: 'feedback-widget',
    title: 'Share Feedback',
    description: 'Found something wrong? Have a suggestion? Click the feedback button anytime to let us know. Your input shapes StarGuide!',
    icon: '💬',
    position: 'left',
  },
  {
    id: 'complete',
    target: null,
    title: 'Ready for Launch',
    description: 'You\'re all set! Start building teams by selecting characters from the sidebar. May your pulls be blessed. ✦',
    icon: '🚀',
    position: 'center',
  },
];

// ==================
// STATE
// ==================

const STORAGE_KEY = 'starguide_onboarding_complete';

const wantsToBeActive = ref(false);
const currentStepIndex = ref(0);
const targetRect = ref<DOMRect | null>(null);
const isAnimating = ref(false);
const showTooltip = ref(false);
const characterSelected = ref(false);
const isScrolling = ref(false);
let scrollTimeout: ReturnType<typeof setTimeout> | null = null;

// Combined visibility: wants to be active AND queue allows it
const isActive = computed(() => wantsToBeActive.value && shouldShow(MODAL_ID));

// ==================
// COMPUTED
// ==================

// Roster validation for roster-builder step
const ownedCharacters = computed(() => {
  return props.characters.filter(c => {
    const investment = props.roster.get(c.id);
    return investment?.ownership === 'owned' || investment?.ownership === 'concept';
  });
});

const hasDPS = computed(() => {
  return ownedCharacters.value.some(c =>
    c.roles.includes('DPS') || c.roles.includes('Support DPS')
  );
});

const hasViableRoster = computed(() => {
  return ownedCharacters.value.length >= 4 && hasDPS.value;
});

const currentStep = computed(() => steps[currentStepIndex.value] as OnboardingStep);
const isFirstStep = computed(() => currentStepIndex.value === 0);
const isLastStep = computed(() => currentStepIndex.value === steps.length - 1);
const canProceed = computed(() => {
  if (currentStep.value.waitForInteraction) {
    // Different checks for different interactive steps
    if (currentStep.value.id === 'roster-builder') {
      return hasViableRoster.value;
    }
    if (currentStep.value.id === 'select-character') {
      return characterSelected.value;
    }
    return false;
  }
  return true;
});

// Spotlight clip path calculation
const spotlightStyle = computed(() => {
  if (!targetRect.value || currentStep.value.target === null) {
    return {
      clipPath: 'none',
      background: 'rgba(3, 3, 12, 0.92)',
      transition: 'none',
    };
  }

  const rect = targetRect.value;
  const padding = 12;

  // Don't clamp - allow negative values so cutout moves off-screen properly
  const top = rect.top - padding;
  const left = rect.left - padding;
  const width = rect.width + padding * 2;
  const height = rect.height + padding * 2;

  return {
    clipPath: `polygon(
      0% 0%, 0% 100%,
      ${left}px 100%,
      ${left}px ${top}px,
      ${left + width}px ${top}px,
      ${left + width}px ${top + height}px,
      ${left}px ${top + height}px,
      ${left}px 100%,
      100% 100%, 100% 0%
    )`,
    background: 'rgba(3, 3, 12, 0.92)',
    transition: isScrolling.value ? 'none' : 'clip-path 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
  };
});

// Spotlight glow position
const glowStyle = computed(() => {
  if (!targetRect.value || currentStep.value.target === null) {
    return { display: 'none' };
  }

  const rect = targetRect.value;
  const padding = 16;

  return {
    display: 'block',
    top: `${rect.top - padding}px`,
    left: `${rect.left - padding}px`,
    width: `${rect.width + padding * 2}px`,
    height: `${rect.height + padding * 2}px`,
    transition: isScrolling.value ? 'none' : 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
  };
});

// Tooltip position
const tooltipStyle = computed(() => {
  const step = currentStep.value;
  const tooltipWidth = 380;
  const tooltipHeight = 320; // approximate
  const viewportPadding = 24;
  const tooltipOffset = 20;

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // For noOverlay steps, always position in top-right corner
  if (step.noOverlay) {
    return {
      top: `${viewportPadding}px`,
      right: `${viewportPadding}px`,
      left: 'auto',
    };
  }

  if (step.position === 'center' || !targetRect.value) {
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    };
  }

  const rect = targetRect.value;

  let top: number;
  let left: number;

  switch (step.position) {
    case 'right':
      top = rect.top;
      left = rect.right + tooltipOffset;
      break;
    case 'left':
      top = rect.top;
      left = rect.left - tooltipWidth - tooltipOffset;
      break;
    case 'bottom':
      top = rect.bottom + tooltipOffset;
      left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
      break;
    case 'top':
      top = rect.top - tooltipHeight - tooltipOffset;
      left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
      break;
    default:
      top = viewportPadding;
      left = viewportPadding;
  }

  // Always clamp to viewport with padding on all sides
  left = Math.max(viewportPadding, Math.min(left, vw - tooltipWidth - viewportPadding));
  top = Math.max(viewportPadding, Math.min(top, vh - tooltipHeight - viewportPadding));

  return {
    top: `${top}px`,
    left: `${left}px`,
  };
});

// ==================
// METHODS
// ==================

const updateTargetRect = async (shouldScroll = true) => {
  const step = currentStep.value;

  if (!step.target) {
    targetRect.value = null;
    return;
  }

  // Disable transitions during the entire update process
  isScrolling.value = true;

  // Clear the rect first to force a clean update when switching areas
  targetRect.value = null;
  await nextTick();

  // Try to find element with retries (in case DOM isn't ready yet)
  let element: Element | null = null;
  for (let i = 0; i < 10; i++) {
    element = document.querySelector(`[data-onboarding="${step.target}"]`);
    if (element) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  if (element) {
    // Get element position relative to viewport
    let rect = element.getBoundingClientRect();

    // Set the rect
    targetRect.value = rect;
    await nextTick();

    // Check if element is visible in viewport
    const padding = 50;
    const isInView = rect.top >= padding &&
                     rect.bottom <= (window.innerHeight - padding);

    if (!isInView && shouldScroll) {
      // Scroll to top of element with some padding
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
        inline: 'nearest'
      });

      // Poll the element position during scroll animation
      const startTime = Date.now();
      const scrollDuration = 600;

      await new Promise<void>(resolve => {
        const pollPosition = () => {
          const el = document.querySelector(`[data-onboarding="${step.target}"]`);
          if (el) {
            targetRect.value = el.getBoundingClientRect();
          }

          if (Date.now() - startTime < scrollDuration) {
            requestAnimationFrame(pollPosition);
          } else {
            resolve();
          }
        };
        requestAnimationFrame(pollPosition);
      });
    }

    // Get final rect
    const finalElement = document.querySelector(`[data-onboarding="${step.target}"]`);
    if (finalElement) {
      targetRect.value = finalElement.getBoundingClientRect();
    }
  } else {
    console.warn(`Onboarding: Element not found for target "${step.target}"`);
    targetRect.value = null;
  }

  // Small delay before re-enabling transitions
  await new Promise(resolve => setTimeout(resolve, 50));
  isScrolling.value = false;
};

const animateToStep = async (index: number) => {
  if (isAnimating.value) return;

  isAnimating.value = true;
  showTooltip.value = false;

  // Wait for tooltip to fade out
  await new Promise(resolve => setTimeout(resolve, 200));

  const nextStepData = steps[index];

  // Handle view navigation BEFORE changing step index
  if (nextStepData?.navigateTo) {
    emit('change-view', nextStepData.navigateTo);
    // Wait for view to render
    await new Promise(resolve => setTimeout(resolve, 400));
  }

  currentStepIndex.value = index;

  // Wait for next frame to get new target
  await nextTick();

  // Wait for updateTargetRect to complete (includes scrolling)
  await updateTargetRect();

  // Small additional wait for spotlight animation to settle
  await new Promise(resolve => setTimeout(resolve, 100));

  showTooltip.value = true;
  isAnimating.value = false;
};

const nextStep = () => {
  if (!canProceed.value) return;

  if (isLastStep.value) {
    complete();
  } else {
    animateToStep(currentStepIndex.value + 1);
  }
};

const prevStep = () => {
  if (!isFirstStep.value) {
    animateToStep(currentStepIndex.value - 1);
  }
};

const skip = () => {
  complete();
};

const complete = () => {
  showTooltip.value = false;
  // Navigate back to characters view so user can start adding to roster
  emit('change-view', 'characters');
  setTimeout(() => {
    wantsToBeActive.value = false;
    markClosed(MODAL_ID);
    localStorage.setItem(STORAGE_KEY, 'true');
  }, 300);
};

const restart = () => {
  localStorage.removeItem(STORAGE_KEY);
  characterSelected.value = false;
  currentStepIndex.value = 0;
  // Force navigation to home/characters view for onboarding
  emit('change-view', 'characters');
  wantsToBeActive.value = true;
  requestShow(MODAL_ID);
  nextTick(() => {
    updateTargetRect();
    showTooltip.value = true;
  });
};

// Check if character was selected (for step 4)
const handleCharacterSelection = () => {
  if (currentStep.value.id === 'select-character') {
    characterSelected.value = true;
    // Switch to teammates tab so the onboarding can highlight it
    emit('change-tab', 'teammates');
    // Auto-advance after selection
    setTimeout(() => {
      nextStep();
    }, 500);
  }
};

// Handle keyboard
const handleKeydown = (e: KeyboardEvent) => {
  if (!isActive.value) return;

  switch (e.key) {
    case 'ArrowRight':
    case 'Enter':
      nextStep();
      break;
    case 'ArrowLeft':
      prevStep();
      break;
    case 'Escape':
      skip();
      break;
  }
};

// Handle resize
const handleResize = () => {
  if (isActive.value) {
    updateTargetRect();
  }
};

// Handle scroll - update spotlight position immediately using rAF
let rafId: number | null = null;

const handleScroll = () => {
  // Always update spotlight during scroll, even during animation
  if (isActive.value && currentStep.value.target) {
    // Set scrolling state to disable CSS transition
    isScrolling.value = true;

    // Cancel any pending rAF
    if (rafId) cancelAnimationFrame(rafId);

    // Use requestAnimationFrame for smooth updates
    rafId = requestAnimationFrame(() => {
      const element = document.querySelector(`[data-onboarding="${currentStep.value.target}"]`);
      if (element) {
        targetRect.value = element.getBoundingClientRect();
      }
    });

    // Reset scrolling state after scroll ends
    if (scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      isScrolling.value = false;
    }, 100);
  }
};

// Watch for character selection in the app
const setupCharacterObserver = () => {
  // Listen for clicks on character cards
  const observer = new MutationObserver(() => {
    const selected = document.querySelector('.character-view');
    if (selected && currentStep.value.id === 'select-character') {
      handleCharacterSelection();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  return observer;
};


// ==================
// LIFECYCLE
// ==================

let resizeObserver: ResizeObserver | null = null;
let mutationObserver: MutationObserver | null = null;

onMounted(() => {
  // Register with modal queue
  registerModal(MODAL_ID);

  // Check if should show onboarding (only for first-time users on desktop)
  const completed = localStorage.getItem(STORAGE_KEY);
  const isMobile = window.innerWidth < 768;

  // Disable onboarding on mobile for now
  if (!completed && !isMobile) {
    setTimeout(() => {
      // Force navigation to home/characters view for onboarding
      emit('change-view', 'characters');
      wantsToBeActive.value = true;
      requestShow(MODAL_ID);
      nextTick(() => {
        updateTargetRect();
        showTooltip.value = true;
      });
    }, MODAL_CHECK_DELAY);
  }

  // Setup listeners
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('resize', handleResize);
  window.addEventListener('scroll', handleScroll, true); // capture phase to catch all scrolls

  // Setup mutation observer for character selection
  mutationObserver = setupCharacterObserver();

  // Setup resize observer for target elements
  resizeObserver = new ResizeObserver(() => {
    if (isActive.value) {
      updateTargetRect();
    }
  });
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('scroll', handleScroll, true);
  resizeObserver?.disconnect();
  mutationObserver?.disconnect();
  if (rafId) cancelAnimationFrame(rafId);
  if (scrollTimeout) clearTimeout(scrollTimeout);
});

// Watch for step changes to update position
watch(currentStepIndex, () => {
  updateTargetRect();
});

// Expose restart for external trigger
defineExpose({ restart });
</script>

<template>
  <Teleport to="body">
    <Transition name="overlay-fade">
      <div
        v-if="isActive"
        class="spotlight-overlay"
        :class="{
          'allow-interaction': currentStep.waitForInteraction && (!canProceed || currentStep.id === 'roster-builder'),
          'no-overlay-mode': currentStep.noOverlay
        }"
      >
        <!-- Dark overlay with spotlight cutout (hidden when noOverlay) -->
        <div
          v-if="!currentStep.noOverlay"
          class="overlay-backdrop"
          :class="{ 'no-transition': isScrolling }"
          :style="spotlightStyle"
        >
          <!-- Animated stars in background -->
          <div class="stars-container">
            <div v-for="i in 50" :key="i" class="star" :style="{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${2 + Math.random() * 2}s`,
            }"></div>
          </div>
        </div>

        <!-- Spotlight glow ring (hidden when noOverlay) -->
        <div
          v-if="targetRect && currentStep.target && !currentStep.noOverlay"
          class="spotlight-glow"
          :class="{ 'no-transition': isScrolling }"
          :style="glowStyle"
        >
          <div class="glow-ring"></div>
          <div class="glow-pulse"></div>
        </div>

        <!-- Tooltip -->
        <Transition name="tooltip-fade">
          <div
            v-if="showTooltip"
            class="spotlight-tooltip"
            :style="tooltipStyle"
            :class="[`position-${currentStep.position}`]"
          >
            <!-- Decorative corner accents -->
            <div class="tooltip-corner top-left"></div>
            <div class="tooltip-corner top-right"></div>
            <div class="tooltip-corner bottom-left"></div>
            <div class="tooltip-corner bottom-right"></div>

            <!-- Content -->
            <div class="tooltip-content">
              <!-- Icon -->
              <div class="tooltip-icon">
                <span>{{ currentStep.icon }}</span>
              </div>

              <!-- Text -->
              <h3 class="tooltip-title">{{ currentStep.title }}</h3>
              <p class="tooltip-description">{{ currentStep.description }}</p>

              <!-- Interaction hint -->
              <div v-if="currentStep.waitForInteraction && !canProceed" class="interaction-hint">
                <span class="hint-pulse"></span>
                {{ currentStep.interactionHint }}
              </div>

              <!-- Roster progress indicator for roster-builder step -->
              <div v-if="currentStep.showProgress && currentStep.id === 'roster-builder'" class="roster-progress">
                <div class="progress-item">
                  <span class="progress-count" :class="{ 'complete': ownedCharacters.length >= 4 }">
                    {{ ownedCharacters.length }}
                  </span>
                  <span class="progress-label">characters added</span>
                  <span v-if="ownedCharacters.length >= 4" class="check-mark">✓</span>
                </div>
                <div class="progress-item">
                  <span class="progress-label">DPS:</span>
                  <span :class="hasDPS ? 'status-yes' : 'status-no'">
                    {{ hasDPS ? 'Yes ✓' : 'Need 1' }}
                  </span>
                </div>
                <div v-if="!hasViableRoster" class="progress-hint">
                  (minimum: 4 characters including 1 DPS)
                </div>
              </div>

              <!-- Progress -->
              <div class="tooltip-progress">
                <div
                  v-for="(_, index) in steps"
                  :key="index"
                  class="progress-dot"
                  :class="{
                    'active': index === currentStepIndex,
                    'completed': index < currentStepIndex,
                  }"
                ></div>
              </div>

              <!-- Navigation -->
              <div class="tooltip-nav">
                <button
                  v-if="!isFirstStep"
                  class="nav-btn nav-back"
                  @click="prevStep"
                >
                  ← Back
                </button>
                <div v-else class="nav-spacer"></div>

                <button
                  class="nav-btn nav-next"
                  :class="{ 'waiting': !canProceed }"
                  :disabled="!canProceed"
                  @click="nextStep"
                >
                  {{ isLastStep ? 'Get Started' : 'Next →' }}
                </button>
              </div>
            </div>

            <!-- Skip button -->
            <button class="skip-btn" @click="skip">
              Skip tutorial
            </button>
          </div>
        </Transition>

        <!-- Step counter -->
        <div class="step-counter">
          Step {{ currentStepIndex + 1 }} of {{ steps.length }}
        </div>

        <!-- Keyboard hints -->
        <div class="keyboard-hints">
          <span><kbd>←</kbd> <kbd>→</kbd> Navigate</span>
          <span><kbd>Esc</kbd> Skip</span>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ==================
   OVERLAY
   ================== */

.spotlight-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  pointer-events: auto;
}

/* When interaction is required, allow clicking through the entire overlay */
.spotlight-overlay.allow-interaction {
  pointer-events: none;
}

/* But keep tooltip and controls clickable */
.spotlight-overlay.allow-interaction .spotlight-tooltip,
.spotlight-overlay.allow-interaction .step-counter,
.spotlight-overlay.allow-interaction .keyboard-hints {
  pointer-events: auto;
}

/* No overlay mode - allow full interaction, just show floating tooltip */
.spotlight-overlay.no-overlay-mode {
  pointer-events: none;
}

.spotlight-overlay.no-overlay-mode .spotlight-tooltip,
.spotlight-overlay.no-overlay-mode .step-counter,
.spotlight-overlay.no-overlay-mode .keyboard-hints {
  pointer-events: auto;
}

.overlay-backdrop {
  position: absolute;
  inset: 0;
  transition: clip-path 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.overlay-backdrop.no-transition {
  transition: none !important;
}

/* Stars animation */
.stars-container {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.star {
  position: absolute;
  width: 2px;
  height: 2px;
  background: white;
  border-radius: 50%;
  opacity: 0;
  animation: twinkle 3s ease-in-out infinite;
}

@keyframes twinkle {
  0%, 100% { opacity: 0; transform: scale(0.5); }
  50% { opacity: 0.7; transform: scale(1); }
}

/* ==================
   SPOTLIGHT GLOW
   ================== */

.spotlight-glow {
  position: fixed;
  pointer-events: none;
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 10001;
}

.spotlight-glow.no-transition {
  transition: none !important;
}

.glow-ring {
  position: absolute;
  inset: -4px;
  border-radius: 20px;
  border: 2px solid rgba(249, 147, 7, 0.6);
  box-shadow:
    0 0 20px rgba(249, 147, 7, 0.4),
    0 0 40px rgba(249, 147, 7, 0.2),
    inset 0 0 20px rgba(249, 147, 7, 0.1);
  animation: glowPulse 2s ease-in-out infinite;
}

.glow-pulse {
  position: absolute;
  inset: -8px;
  border-radius: 24px;
  border: 1px solid rgba(249, 147, 7, 0.3);
  animation: ringExpand 2s ease-out infinite;
}

@keyframes glowPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

@keyframes ringExpand {
  0% {
    transform: scale(1);
    opacity: 0.6;
  }
  100% {
    transform: scale(1.15);
    opacity: 0;
  }
}

/* ==================
   TOOLTIP
   ================== */

.spotlight-tooltip {
  position: fixed;
  width: 380px;
  max-width: calc(100vw - 40px);
  background: linear-gradient(135deg, rgba(20, 20, 45, 0.98) 0%, rgba(10, 10, 30, 0.98) 100%);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(249, 147, 7, 0.3);
  border-radius: 20px;
  padding: 28px;
  z-index: 10002;
  box-shadow:
    0 25px 50px rgba(0, 0, 0, 0.5),
    0 0 100px rgba(249, 147, 7, 0.1);
}

/* Corner accents */
.tooltip-corner {
  position: absolute;
  width: 20px;
  height: 20px;
  border-color: rgba(249, 147, 7, 0.5);
  border-style: solid;
  border-width: 0;
}

.tooltip-corner.top-left {
  top: -1px;
  left: -1px;
  border-top-width: 2px;
  border-left-width: 2px;
  border-top-left-radius: 20px;
}

.tooltip-corner.top-right {
  top: -1px;
  right: -1px;
  border-top-width: 2px;
  border-right-width: 2px;
  border-top-right-radius: 20px;
}

.tooltip-corner.bottom-left {
  bottom: -1px;
  left: -1px;
  border-bottom-width: 2px;
  border-left-width: 2px;
  border-bottom-left-radius: 20px;
}

.tooltip-corner.bottom-right {
  bottom: -1px;
  right: -1px;
  border-bottom-width: 2px;
  border-right-width: 2px;
  border-bottom-right-radius: 20px;
}

.tooltip-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.tooltip-icon {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  background: linear-gradient(135deg, rgba(249, 147, 7, 0.2) 0%, rgba(249, 147, 7, 0.1) 100%);
  border: 1px solid rgba(249, 147, 7, 0.3);
  border-radius: 16px;
  margin-bottom: 20px;
  animation: iconFloat 3s ease-in-out infinite;
}

@keyframes iconFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}

.tooltip-title {
  font-family: 'Exo 2', 'Orbitron', sans-serif;
  font-size: 1.5rem;
  font-weight: 700;
  color: white;
  margin: 0 0 12px 0;
  text-shadow: 0 2px 10px rgba(249, 147, 7, 0.3);
}

.tooltip-description {
  font-size: 0.95rem;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.8);
  margin: 0 0 20px 0;
}

/* Interaction hint */
.interaction-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: rgba(249, 147, 7, 0.15);
  border: 1px solid rgba(249, 147, 7, 0.3);
  border-radius: 10px;
  font-size: 0.85rem;
  color: #f99307;
  margin-bottom: 16px;
}

.hint-pulse {
  width: 8px;
  height: 8px;
  background: #f99307;
  border-radius: 50%;
  animation: hintPulse 1.5s ease-in-out infinite;
}

@keyframes hintPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.2); }
}

/* Roster progress indicator */
.roster-progress {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.75rem;
  margin-bottom: 1rem;
}

.roster-progress .progress-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.roster-progress .progress-count {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.6);
  min-width: 2.5rem;
}

.roster-progress .progress-count.complete {
  color: #f99307;
}

.roster-progress .progress-label {
  color: rgba(255, 255, 255, 0.6);
}

.roster-progress .check-mark {
  color: #22c55e;
  font-weight: bold;
}

.roster-progress .status-yes {
  color: #22c55e;
  font-weight: 600;
}

.roster-progress .status-no {
  color: #f97316;
  font-weight: 600;
}

.roster-progress .progress-hint {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
  font-style: italic;
}

/* Progress dots */
.tooltip-progress {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
}

.progress-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  transition: all 0.3s ease;
}

.progress-dot.completed {
  background: rgba(249, 147, 7, 0.6);
}

.progress-dot.active {
  background: #f99307;
  box-shadow: 0 0 10px rgba(249, 147, 7, 0.6);
  transform: scale(1.3);
}

/* Navigation */
.tooltip-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  gap: 12px;
}

.nav-spacer {
  flex: 1;
}

.nav-btn {
  padding: 12px 24px;
  border-radius: 12px;
  font-family: 'Exo 2', sans-serif;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  border: none;
}

.nav-back {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.nav-back:hover {
  background: rgba(255, 255, 255, 0.15);
  color: white;
}

.nav-next {
  background: linear-gradient(135deg, #f99307 0%, #dd6d02 100%);
  color: white;
  flex: 1;
  max-width: 200px;
  box-shadow: 0 4px 15px rgba(249, 147, 7, 0.3);
}

.nav-next:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(249, 147, 7, 0.4);
}

.nav-next.waiting {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.4);
  box-shadow: none;
  cursor: not-allowed;
}

.nav-next:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Skip button */
.skip-btn {
  position: absolute;
  top: -40px;
  right: 0;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  font-size: 0.8rem;
  cursor: pointer;
  padding: 8px 12px;
  transition: color 0.3s;
}

.skip-btn:hover {
  color: rgba(255, 255, 255, 0.8);
}

/* ==================
   STEP COUNTER
   ================== */

.step-counter {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(20, 20, 45, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 8px 20px;
  border-radius: 20px;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.6);
  z-index: 10002;
}

/* ==================
   KEYBOARD HINTS
   ================== */

.keyboard-hints {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 24px;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
  z-index: 10002;
}

.keyboard-hints kbd {
  display: inline-block;
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.7rem;
}

/* ==================
   TRANSITIONS
   ================== */

.overlay-fade-enter-active {
  transition: opacity 0.5s ease;
}

.overlay-fade-leave-active {
  transition: opacity 0.3s ease;
}

.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}

.tooltip-fade-enter-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  transition-delay: 0.2s;
}

.tooltip-fade-leave-active {
  transition: all 0.2s ease;
}

.tooltip-fade-enter-from {
  opacity: 0;
  transform: translateY(20px);
}

.tooltip-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.position-center .tooltip-fade-enter-from {
  transform: translate(-50%, -50%) scale(0.9);
}

.position-center .tooltip-fade-leave-to {
  transform: translate(-50%, -50%) scale(0.95);
}

/* ==================
   RESPONSIVE
   ================== */

@media (max-width: 768px) {
  .spotlight-tooltip {
    width: calc(100vw - 32px);
    left: 16px !important;
    right: 16px !important;
    transform: none !important;
    bottom: 100px;
    top: auto !important;
    padding: 20px;
    max-height: calc(100vh - 180px);
    overflow-y: auto;
  }

  .keyboard-hints {
    display: none;
  }

  .tooltip-nav {
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .nav-btn {
    padding: 10px 16px;
    font-size: 0.8rem;
  }
}
</style>

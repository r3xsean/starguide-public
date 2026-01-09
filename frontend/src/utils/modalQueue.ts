/**
 * Modal Queue System
 *
 * Manages the sequencing of modals to ensure they don't overlap.
 * Each modal registers with a priority, and the queue ensures only
 * one modal shows at a time, in priority order.
 *
 * Priority order (lower number = higher priority):
 * 0. AuthModal - sign in/up for first-time visitors (highest priority)
 * 1. FeedbackNotification - user's feedback was addressed
 * 2. ChangelogModal - what's new since last visit
 * 3. SpotlightOnboarding - tutorial for new users
 * 4. SurveyModal - surveys, least urgent
 *
 * TESTING MODE:
 * Enable via localStorage: localStorage.setItem('starguide_modal_testing', 'true')
 * Or URL parameter: ?modal_testing=true
 * Disable: localStorage.removeItem('starguide_modal_testing')
 */

import { ref, computed } from 'vue';

/**
 * Check if modal testing mode is enabled.
 * Can be set via localStorage or URL parameter.
 */
export function isModalTestingEnabled(): boolean {
  // Check URL parameter first
  if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('modal_testing') === 'true') {
      return true;
    }
  }
  // Check localStorage
  return localStorage.getItem('starguide_modal_testing') === 'true';
}

export type ModalId = 'auth' | 'feedback-notification' | 'changelog' | 'onboarding' | 'survey';

interface QueuedModal {
  id: ModalId;
  priority: number;
  isReady: boolean;  // Modal has determined it should show
  isActive: boolean; // Modal is currently visible
}

// Priority mapping (lower = higher priority)
const MODAL_PRIORITIES: Record<ModalId, number> = {
  'auth': 0,
  'feedback-notification': 1,
  'changelog': 2,
  'onboarding': 3,
  'survey': 4,
};

// Reactive state
const modals = ref<Map<ModalId, QueuedModal>>(new Map());

// Computed: which modal should currently be visible
const activeModalId = computed((): ModalId | null => {
  const readyModals = Array.from(modals.value.values())
    .filter(m => m.isReady)
    .sort((a, b) => a.priority - b.priority);

  return readyModals[0]?.id ?? null;
});

/**
 * Register a modal with the queue.
 * Call this in onMounted.
 */
export function registerModal(id: ModalId): void {
  if (!modals.value.has(id)) {
    modals.value.set(id, {
      id,
      priority: MODAL_PRIORITIES[id],
      isReady: false,
      isActive: false,
    });
  }
}

/**
 * Mark a modal as ready to show.
 * The queue will determine if it should actually be visible.
 */
export function requestShow(id: ModalId): boolean {
  const modal = modals.value.get(id);
  if (modal) {
    modal.isReady = true;
    // Return whether this modal should be visible
    return activeModalId.value === id;
  }
  return false;
}

/**
 * Check if a modal should currently be visible.
 * Call this reactively to determine visibility.
 */
export function shouldShow(id: ModalId): boolean {
  const modal = modals.value.get(id);
  return modal?.isReady === true && activeModalId.value === id;
}

/**
 * Mark a modal as closed/completed.
 * This allows the next modal in the queue to show.
 */
export function markClosed(id: ModalId): void {
  const modal = modals.value.get(id);
  if (modal) {
    modal.isReady = false;
    modal.isActive = false;
  }
}

/**
 * Get a reactive computed for whether a specific modal should show.
 * Use this in your component's setup.
 */
export function useModalVisibility(id: ModalId) {
  return computed(() => shouldShow(id));
}

/**
 * Delay before checking modal queue (initial app load)
 */
export const MODAL_CHECK_DELAY = 1000;

/**
 * Delay between modal close and next modal opening
 */
export const MODAL_TRANSITION_DELAY = 400;

// Export reactive state for debugging
export { activeModalId, modals };

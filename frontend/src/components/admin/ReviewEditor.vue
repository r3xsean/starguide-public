<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { supabase } from '../../lib/supabase';
import { useAdminAuth } from '../../composables/useAdminAuth';
import { useAuth } from '../../composables/useAuth';
import type { Character } from '../../types';
import {
  type SectionDiff,
  computeAllSectionDiffs,
  formatCharacterName,
} from '../../utils/diffUtils';
import DiffDisplay from './DiffDisplay.vue';

// ==================
// TYPES
// ==================

type EditStatus = 'pending' | 'approved' | 'rejected' | 'deployed';

interface UserProfile {
  username: string;
  display_name: string | null;
}

interface CharacterEdit {
  id: number;
  character_id: string;
  character_data: Character | null;
  field_changes: Record<string, unknown> | null;
  status: EditStatus;
  change_summary: string | null;
  fields_changed: string[] | null;
  created_at: string;
  reviewed_at: string | null;
  reviewer_id: string | null;
  github_commit_sha: string | null;
  review_notes: string | null;
  editor_id: string;
  editor_name?: string;
  editor_profile: UserProfile | null;
  reviewer_profile: UserProfile | null;
}

interface BidirectionalSuggestion {
  id: number;
  edit_id: number;
  source_character_id: string;
  target_character_id: string;
  suggested_rating: string | null;
  suggested_reason: string | null;
  target_role: string | null;
  status: 'pending' | 'accepted' | 'skipped';
  created_at: string;
}

// ==================
// PROPS
// ==================

const props = defineProps<{
  editId?: string;
}>();

// ==================
// STATE
// ==================

const router = useRouter();
const route = useRoute();
const { isLoading: isAuthLoading } = useAdminAuth();
const { user } = useAuth();

const edit = ref<CharacterEdit | null>(null);
const originalData = ref<Character | null>(null);
const bidirectionalSuggestions = ref<BidirectionalSuggestion[]>([]);
const isLoading = ref(true);
const error = ref<string | null>(null);
const reviewNotes = ref('');
const isSubmitting = ref(false);
const submitError = ref<string | null>(null);
const submitSuccess = ref<{ message: string; prNumber?: number; prUrl?: string; commitSha?: string } | null>(null);

// Confirmation modal state
const showApproveModal = ref(false);
const showRejectModal = ref(false);

// ==================
// COMPUTED
// ==================

const editIdNum = computed(() => {
  const id = props.editId || route.params.editId;
  return typeof id === 'string' ? parseInt(id, 10) : null;
});

const characterName = computed(() => {
  if (!edit.value) return '';
  return originalData.value?.name || edit.value.character_id;
});

const characterIcon = computed(() => {
  if (!edit.value) return '/icons/placeholder.webp';
  return `/icons/${edit.value.character_id}.webp`;
});

const relativeTime = computed(() => {
  if (!edit.value) return '';
  return getRelativeTime(edit.value.created_at);
});

const statusConfig = computed(() => {
  if (!edit.value) return { label: '', class: '' };
  return getStatusConfig(edit.value.status);
});

const canApprove = computed(() => {
  return edit.value?.status === 'pending' && !isSubmitting.value;
});

const canReject = computed(() => {
  return edit.value?.status === 'pending' && !isSubmitting.value;
});

const sectionDiffs = computed((): SectionDiff[] => {
  if (!edit.value || !originalData.value) return [];

  // If field_changes exists, apply them to original to create proposed version
  if (edit.value.field_changes && Object.keys(edit.value.field_changes).length > 0) {
    const proposed = applyFieldChanges(originalData.value, edit.value.field_changes);
    return computeAllSectionDiffs(originalData.value, proposed);
  }

  // Legacy: full character_data diff
  if (edit.value.character_data) {
    return computeAllSectionDiffs(originalData.value, edit.value.character_data);
  }

  return [];
});

/**
 * Apply field changes to a character object to create a proposed version.
 */
function applyFieldChanges(
  original: Character,
  fieldChanges: Record<string, unknown>
): Character {
  // Deep clone the original
  const proposed = JSON.parse(JSON.stringify(original)) as Character;

  // Apply each field change
  for (const [path, value] of Object.entries(fieldChanges)) {
    setValueAtPath(proposed, path, value);
  }

  return proposed;
}

/**
 * Set a value at a dot-separated path in an object.
 */
function setValueAtPath(obj: unknown, path: string, value: unknown): void {
  const parts = path.split('.');
  if (parts.length === 0) return;

  let current = obj as Record<string, unknown>;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    // Handle array indices
    if (/^\d+$/.test(part)) {
      const index = parseInt(part, 10);
      if (!Array.isArray(current)) return;
      if (current[index] === undefined) {
        (current as unknown[])[index] = {};
      }
      current = current[index] as Record<string, unknown>;
    } else {
      if (!(part in current) || current[part] === null || current[part] === undefined) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }
  }

  const lastPart = parts[parts.length - 1]!;
  current[lastPart] = value;
}

// ==================
// DATA LOADING
// ==================

async function fetchEdit() {
  if (!editIdNum.value) {
    error.value = 'Invalid edit ID';
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  error.value = null;

  try {
    // Fetch the edit without relationship joins
    const { data, error: fetchError } = await supabase
      .from('character_edits')
      .select(`
        id,
        character_id,
        character_data,
        field_changes,
        status,
        change_summary,
        fields_changed,
        created_at,
        reviewed_at,
        reviewer_id,
        github_commit_sha,
        review_notes,
        editor_id
      `)
      .eq('id', editIdNum.value)
      .single();

    if (fetchError) {
      throw new Error(fetchError.message);
    }

    if (!data) {
      throw new Error('Edit not found');
    }

    // Fetch user profiles for editor and reviewer
    const userIds = [data.editor_id, data.reviewer_id].filter(Boolean) as string[];
    let profilesMap: Map<string, UserProfile> = new Map();

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, username, display_name')
        .in('id', userIds);

      if (profiles) {
        profiles.forEach(p => {
          profilesMap.set(p.id, { username: p.username, display_name: p.display_name });
        });
      }
    }

    edit.value = {
      ...data,
      editor_profile: profilesMap.get(data.editor_id) || null,
      reviewer_profile: data.reviewer_id ? profilesMap.get(data.reviewer_id) || null : null,
    } as CharacterEdit;
    reviewNotes.value = edit.value.review_notes || '';

    // Load original character data from GitHub main branch
    await fetchOriginalCharacter(data.character_id);

    // Fetch bidirectional suggestions
    await fetchBidirectionalSuggestions();
  } catch (err) {
    console.error('Failed to fetch edit:', err);
    error.value = err instanceof Error ? err.message : 'Failed to load edit';
  } finally {
    isLoading.value = false;
  }
}

async function fetchBidirectionalSuggestions() {
  if (!editIdNum.value) return;

  try {
    const { data, error: fetchError } = await supabase
      .from('bidirectional_suggestions')
      .select('*')
      .eq('edit_id', editIdNum.value);

    if (fetchError) {
      console.error('Failed to fetch suggestions:', fetchError);
      return;
    }

    bidirectionalSuggestions.value = (data as BidirectionalSuggestion[]) || [];
  } catch (err) {
    console.error('Failed to fetch bidirectional suggestions:', err);
  }
}

async function fetchOriginalCharacter(characterId: string) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.warn('Not authenticated, cannot fetch character from GitHub');
      originalData.value = null;
      return;
    }

    const response = await fetch(`/api/get-character?id=${characterId}`, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    const result = await response.json();

    if (!response.ok) {
      console.warn(`Failed to fetch character from GitHub: ${result.error}`);
      originalData.value = null;
      return;
    }

    originalData.value = result.character as Character;
  } catch (err) {
    console.error('Failed to fetch original character:', err);
    originalData.value = null;
  }
}

// ==================
// ACTIONS
// ==================

async function handleApprove() {
  if (!edit.value || !user.value) return;

  isSubmitting.value = true;
  submitError.value = null;
  submitSuccess.value = null;

  try {
    // Update edit status to approved
    const { error: updateError } = await supabase
      .from('character_edits')
      .update({
        status: 'approved',
        reviewer_id: user.value.id,
        reviewed_at: new Date().toISOString(),
        review_notes: reviewNotes.value || null,
      })
      .eq('id', edit.value.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    // Call the deploy API to commit changes to GitHub
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No active session');
    }

    const response = await fetch('/api/approve-edit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ editId: edit.value.id }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to deploy changes');
    }

    submitSuccess.value = {
      message: result.message || 'Changes committed successfully',
      commitSha: result.commitSha,
    };

    // Refresh the edit data
    await fetchEdit();
    showApproveModal.value = false;
  } catch (err) {
    console.error('Approve error:', err);
    submitError.value = err instanceof Error ? err.message : 'Failed to approve edit';
  } finally {
    isSubmitting.value = false;
  }
}

async function handleReject() {
  if (!edit.value || !user.value) return;

  if (!reviewNotes.value.trim()) {
    submitError.value = 'Please provide a reason for rejection';
    return;
  }

  isSubmitting.value = true;
  submitError.value = null;
  submitSuccess.value = null;

  try {
    const { error: updateError } = await supabase
      .from('character_edits')
      .update({
        status: 'rejected',
        reviewer_id: user.value.id,
        reviewed_at: new Date().toISOString(),
        review_notes: reviewNotes.value,
      })
      .eq('id', edit.value.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    submitSuccess.value = { message: 'Edit rejected' };
    showRejectModal.value = false;

    // Redirect back to queue after short delay
    setTimeout(() => {
      router.push('/admin/review');
    }, 1500);
  } catch (err) {
    console.error('Reject error:', err);
    submitError.value = err instanceof Error ? err.message : 'Failed to reject edit';
  } finally {
    isSubmitting.value = false;
  }
}

function goBack() {
  router.push('/admin/review');
}

// ==================
// HELPERS
// ==================

function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString();
}

function getStatusConfig(status: EditStatus): { label: string; class: string } {
  const configs: Record<EditStatus, { label: string; class: string }> = {
    pending: { label: 'Pending Review', class: 'status-pending' },
    approved: { label: 'Approved', class: 'status-approved' },
    rejected: { label: 'Rejected', class: 'status-rejected' },
    deployed: { label: 'Deployed', class: 'status-deployed' },
  };
  return configs[status];
}

function getSuggestionTargetName(charId: string): string {
  return formatCharacterName(charId);
}

// ==================
// LIFECYCLE
// ==================

onMounted(() => {
  fetchEdit();
});

watch(() => route.params.editId, () => {
  fetchEdit();
});
</script>

<template>
  <div class="review-editor">
    <!-- Back Button -->
    <button class="back-btn" @click="goBack">
      <svg viewBox="0 0 20 20" fill="currentColor">
        <path
          fill-rule="evenodd"
          d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
          clip-rule="evenodd"
        />
      </svg>
      Back to Queue
    </button>

    <!-- Loading State -->
    <div v-if="isLoading || isAuthLoading" class="loading-state">
      <div class="loading-spinner"></div>
      <span class="loading-text">Loading edit...</span>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="error-state">
      <svg viewBox="0 0 20 20" fill="currentColor" class="error-icon">
        <path
          fill-rule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
          clip-rule="evenodd"
        />
      </svg>
      <span class="error-text">{{ error }}</span>
      <button class="retry-btn" @click="fetchEdit">Retry</button>
    </div>

    <!-- Main Content -->
    <template v-else-if="edit">
      <!-- Header Section -->
      <div class="edit-header">
        <div class="header-main">
          <div class="character-icon-wrapper">
            <img
              :src="characterIcon"
              :alt="characterName"
              class="character-icon"
              @error="($event.target as HTMLImageElement).src = '/icons/placeholder.webp'"
            />
          </div>
          <div class="header-info">
            <h1 class="header-title">Reviewing: {{ characterName }}</h1>
            <div class="header-meta">
              <span>Submitted by: <strong>{{ edit.editor_profile?.display_name || edit.editor_profile?.username || 'Unknown user' }}</strong></span>
              <span class="meta-separator">-</span>
              <span>{{ relativeTime }}</span>
            </div>
          </div>
        </div>
        <span :class="['status-badge', 'status-badge-large', statusConfig.class]">
          {{ statusConfig.label }}
        </span>
      </div>

      <!-- Success Message -->
      <div v-if="submitSuccess" class="success-message">
        <svg viewBox="0 0 20 20" fill="currentColor" class="success-icon">
          <path
            fill-rule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            clip-rule="evenodd"
          />
        </svg>
        <div class="success-content">
          <span class="success-text">{{ submitSuccess.message }}</span>
          <span v-if="submitSuccess.commitSha" class="commit-sha">
            Commit: {{ submitSuccess.commitSha.slice(0, 7) }}
          </span>
        </div>
      </div>

      <!-- Error Message -->
      <div v-if="submitError" class="submit-error">
        <svg viewBox="0 0 20 20" fill="currentColor" class="error-icon-sm">
          <path
            fill-rule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
            clip-rule="evenodd"
          />
        </svg>
        <span>{{ submitError }}</span>
      </div>

      <!-- Change Summary Section -->
      <section class="content-section">
        <h2 class="section-title">Change Summary</h2>
        <div class="summary-box">
          {{ edit.change_summary || 'No summary provided' }}
        </div>
      </section>

      <!-- Changes Section -->
      <section class="content-section">
        <h2 class="section-title">Changes</h2>
        <DiffDisplay
          :sections="sectionDiffs"
          mode="expanded"
        />
      </section>

      <!-- Bidirectional Suggestions Section -->
      <section v-if="bidirectionalSuggestions.length > 0" class="content-section">
        <h2 class="section-title">Bidirectional Suggestions ({{ bidirectionalSuggestions.length }})</h2>
        <div class="suggestions-list">
          <div
            v-for="suggestion in bidirectionalSuggestions"
            :key="suggestion.id"
            class="suggestion-item"
          >
            <span class="suggestion-bullet">-</span>
            <span class="suggestion-text">
              Add <strong>{{ getSuggestionTargetName(suggestion.source_character_id) }}</strong>
              <span v-if="suggestion.suggested_rating">({{ suggestion.suggested_rating }})</span>
              to <strong>{{ getSuggestionTargetName(suggestion.target_character_id) }}</strong>'s
              {{ suggestion.target_role || 'teammates' }} list
            </span>
          </div>
        </div>
        <p class="suggestions-note">
          Note: Bidirectional suggestions will be applied when this edit is deployed.
        </p>
      </section>

      <!-- Review Notes Section -->
      <section class="content-section">
        <h2 class="section-title">Review Notes</h2>
        <textarea
          v-model="reviewNotes"
          class="notes-textarea"
          placeholder="Add notes about this review (required for rejection)..."
          rows="4"
          :disabled="edit.status !== 'pending'"
        ></textarea>
      </section>

      <!-- Action Buttons -->
      <div v-if="edit.status === 'pending'" class="action-buttons">
        <button
          class="btn btn-reject"
          :disabled="!canReject"
          @click="showRejectModal = true"
        >
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path
              fill-rule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clip-rule="evenodd"
            />
          </svg>
          Reject
        </button>
        <button
          class="btn btn-approve"
          :disabled="!canApprove"
          @click="showApproveModal = true"
        >
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path
              fill-rule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clip-rule="evenodd"
            />
          </svg>
          Approve
        </button>
      </div>

      <!-- Already Reviewed Info -->
      <div v-else class="reviewed-info">
        <template v-if="edit.status === 'approved' || edit.status === 'deployed'">
          <span class="reviewed-text">
            {{ edit.status === 'deployed' ? 'Deployed' : 'Approved' }} by {{ edit.reviewer_profile?.display_name || edit.reviewer_profile?.username || 'Unknown user' }}
            on {{ new Date(edit.reviewed_at!).toLocaleDateString() }}
          </span>
          <a
            v-if="edit.github_commit_sha"
            :href="`https://github.com/your-repo/commit/${edit.github_commit_sha}`"
            target="_blank"
            rel="noopener noreferrer"
            class="commit-link-small"
          >
            Commit: {{ edit.github_commit_sha.slice(0, 7) }}
          </a>
        </template>
        <template v-else-if="edit.status === 'rejected'">
          <span class="reviewed-text rejected-text">
            Rejected by {{ edit.reviewer_profile?.display_name || edit.reviewer_profile?.username || 'Unknown user' }}
            on {{ new Date(edit.reviewed_at!).toLocaleDateString() }}
          </span>
          <div v-if="edit.review_notes" class="rejection-reason">
            <strong>Reason:</strong> {{ edit.review_notes }}
          </div>
        </template>
      </div>
    </template>

    <!-- Approve Confirmation Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showApproveModal" class="modal-overlay" @click.self="showApproveModal = false">
          <div class="modal-content">
            <h3 class="modal-title">Confirm Approval</h3>
            <p class="modal-text">
              Are you sure you want to approve this edit? This will deploy the changes to GitHub.
            </p>
            <div class="modal-actions">
              <button
                class="btn btn-cancel"
                @click="showApproveModal = false"
                :disabled="isSubmitting"
              >
                Cancel
              </button>
              <button
                class="btn btn-approve"
                @click="handleApprove"
                :disabled="isSubmitting"
              >
                <span v-if="isSubmitting" class="btn-spinner"></span>
                {{ isSubmitting ? 'Deploying...' : 'Approve & Deploy' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Reject Confirmation Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showRejectModal" class="modal-overlay" @click.self="showRejectModal = false">
          <div class="modal-content">
            <h3 class="modal-title">Confirm Rejection</h3>
            <p class="modal-text">
              Are you sure you want to reject this edit? Please ensure you've provided a reason in the review notes.
            </p>
            <div v-if="!reviewNotes.trim()" class="modal-warning">
              Review notes are required for rejection.
            </div>
            <div class="modal-actions">
              <button
                class="btn btn-cancel"
                @click="showRejectModal = false"
                :disabled="isSubmitting"
              >
                Cancel
              </button>
              <button
                class="btn btn-reject"
                @click="handleReject"
                :disabled="isSubmitting || !reviewNotes.trim()"
              >
                <span v-if="isSubmitting" class="btn-spinner"></span>
                {{ isSubmitting ? 'Rejecting...' : 'Reject Edit' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* ==================
   CONTAINER
   ================== */

.review-editor {
  max-width: 900px;
  margin: 0 auto;
  padding: 1.5rem;
}

/* ==================
   BACK BUTTON
   ================== */

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.875rem;
  background: transparent;
  border: 1px solid rgba(71, 85, 105, 0.5);
  border-radius: 0.5rem;
  color: rgba(148, 163, 184, 1);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 1.5rem;
}

.back-btn:hover {
  background: rgba(51, 65, 85, 0.3);
  border-color: rgba(100, 116, 139, 0.6);
  color: rgba(226, 232, 240, 1);
}

.back-btn svg {
  width: 1rem;
  height: 1rem;
}

/* ==================
   LOADING/ERROR STATES
   ================== */

.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  gap: 1rem;
}

.loading-spinner {
  width: 2.5rem;
  height: 2.5rem;
  border: 3px solid rgba(71, 85, 105, 0.3);
  border-top-color: rgba(249, 115, 22, 0.8);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  font-size: 0.9375rem;
  color: rgba(148, 163, 184, 0.8);
}

.error-state {
  background: rgba(239, 68, 68, 0.05);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 0.75rem;
}

.error-icon {
  width: 2rem;
  height: 2rem;
  color: rgba(239, 68, 68, 0.8);
}

.error-text {
  font-size: 0.9375rem;
  color: rgba(239, 68, 68, 0.9);
}

.retry-btn {
  padding: 0.5rem 1rem;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  border-radius: 0.5rem;
  color: rgba(239, 68, 68, 0.9);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.retry-btn:hover {
  background: rgba(239, 68, 68, 0.25);
}

/* ==================
   HEADER
   ================== */

.edit-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.5rem;
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(71, 85, 105, 0.5);
  border-radius: 0.75rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.header-main {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.character-icon-wrapper {
  width: 64px;
  height: 64px;
  border-radius: 0.625rem;
  overflow: hidden;
  border: 2px solid rgba(249, 115, 22, 0.5);
  box-shadow: 0 0 16px rgba(249, 115, 22, 0.2);
  flex-shrink: 0;
}

.character-icon {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.header-info {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.header-title {
  font-size: 1.375rem;
  font-weight: 700;
  color: rgba(241, 245, 249, 1);
  margin: 0;
}

.header-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: rgba(148, 163, 184, 0.8);
  flex-wrap: wrap;
}

.header-meta strong {
  color: rgba(226, 232, 240, 1);
}

.meta-separator {
  color: rgba(148, 163, 184, 0.4);
}

/* Status Badges */
.status-badge {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
}

.status-badge-large {
  font-size: 0.75rem;
  padding: 0.375rem 0.75rem;
}

.status-pending {
  background: rgba(251, 191, 36, 0.15);
  color: rgba(251, 191, 36, 0.9);
  border: 1px solid rgba(251, 191, 36, 0.3);
}

.status-approved {
  background: rgba(34, 197, 94, 0.15);
  color: rgba(34, 197, 94, 0.9);
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.status-rejected {
  background: rgba(239, 68, 68, 0.15);
  color: rgba(239, 68, 68, 0.9);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.status-deployed {
  background: rgba(59, 130, 246, 0.15);
  color: rgba(59, 130, 246, 0.9);
  border: 1px solid rgba(59, 130, 246, 0.3);
}

/* ==================
   SUCCESS/ERROR MESSAGES
   ================== */

.success-message {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
  border-radius: 0.5rem;
  margin-bottom: 1.5rem;
}

.success-icon {
  width: 1.5rem;
  height: 1.5rem;
  color: rgba(34, 197, 94, 0.9);
  flex-shrink: 0;
}

.success-content {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.success-text {
  color: rgba(34, 197, 94, 0.95);
  font-size: 0.9375rem;
  font-weight: 500;
}

.commit-link {
  color: rgba(96, 165, 250, 0.9);
  font-size: 0.8125rem;
  text-decoration: none;
}

.commit-link:hover {
  text-decoration: underline;
}

.commit-sha {
  color: rgba(148, 163, 184, 0.8);
  font-size: 0.8125rem;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
}

.submit-error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.875rem 1rem;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 0.5rem;
  margin-bottom: 1.5rem;
  color: rgba(239, 68, 68, 0.9);
  font-size: 0.875rem;
}

.error-icon-sm {
  width: 1.125rem;
  height: 1.125rem;
  flex-shrink: 0;
}

/* ==================
   CONTENT SECTIONS
   ================== */

.content-section {
  margin-bottom: 1.5rem;
  padding: 1.25rem;
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(71, 85, 105, 0.5);
  border-radius: 0.75rem;
}

.section-title {
  font-size: 1rem;
  font-weight: 600;
  color: rgba(226, 232, 240, 1);
  margin: 0 0 1rem 0;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid rgba(71, 85, 105, 0.4);
}

.summary-box {
  font-size: 0.9375rem;
  color: rgba(203, 213, 225, 0.9);
  line-height: 1.6;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.4);
  border-radius: 0.5rem;
}

/* ==================
   DIFF DISPLAY
   ================== */

.no-changes {
  padding: 2rem;
  text-align: center;
  color: rgba(148, 163, 184, 0.7);
  font-size: 0.9375rem;
}

.diff-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.diff-card {
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid rgba(71, 85, 105, 0.4);
  border-radius: 0.625rem;
  overflow: hidden;
}

.diff-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: rgba(30, 41, 59, 0.5);
  border-bottom: 1px solid rgba(71, 85, 105, 0.3);
}

.diff-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: rgba(226, 232, 240, 1);
}

.diff-type-badge {
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 0.1875rem 0.5rem;
  border-radius: 0.25rem;
}

.diff-added {
  background: rgba(34, 197, 94, 0.15);
  color: rgba(34, 197, 94, 0.9);
}

.diff-changed {
  background: rgba(251, 191, 36, 0.15);
  color: rgba(251, 191, 36, 0.9);
}

.diff-removed {
  background: rgba(239, 68, 68, 0.15);
  color: rgba(239, 68, 68, 0.9);
}

.diff-content {
  padding: 1rem;
}

.diff-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.diff-column {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.column-label {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(148, 163, 184, 0.7);
}

.diff-original {
  background: rgba(239, 68, 68, 0.05);
  padding: 0.75rem;
  border-radius: 0.375rem;
  border: 1px solid rgba(239, 68, 68, 0.15);
}

.diff-proposed {
  background: rgba(34, 197, 94, 0.05);
  padding: 0.75rem;
  border-radius: 0.375rem;
  border: 1px solid rgba(34, 197, 94, 0.15);
}

.diff-value {
  font-size: 0.8125rem;
  color: rgba(203, 213, 225, 0.9);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
}

.no-value {
  font-size: 0.8125rem;
  color: rgba(148, 163, 184, 0.5);
  font-style: italic;
}

/* Teammate List */
.teammate-list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.teammate-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.375rem 0.5rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 0.25rem;
}

.teammate-name {
  font-size: 0.8125rem;
  color: rgba(226, 232, 240, 1);
}

.teammate-rating {
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(251, 191, 36, 0.9);
  padding: 0.125rem 0.375rem;
  background: rgba(251, 191, 36, 0.1);
  border-radius: 0.25rem;
}

/* ==================
   BIDIRECTIONAL SUGGESTIONS
   ================== */

.suggestions-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.suggestion-item {
  display: flex;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: rgba(203, 213, 225, 0.9);
  line-height: 1.5;
}

.suggestion-bullet {
  color: rgba(148, 163, 184, 0.6);
}

.suggestion-text strong {
  color: rgba(241, 245, 249, 1);
}

.suggestions-note {
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(71, 85, 105, 0.3);
  font-size: 0.75rem;
  color: rgba(148, 163, 184, 0.6);
  font-style: italic;
}

/* ==================
   NOTES TEXTAREA
   ================== */

.notes-textarea {
  width: 100%;
  padding: 0.875rem 1rem;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(71, 85, 105, 0.5);
  border-radius: 0.5rem;
  color: rgba(226, 232, 240, 1);
  font-size: 0.9375rem;
  font-family: inherit;
  line-height: 1.5;
  resize: vertical;
  min-height: 100px;
  transition: all 0.2s ease;
}

.notes-textarea:hover:not(:disabled) {
  border-color: rgba(100, 116, 139, 0.6);
}

.notes-textarea:focus {
  outline: none;
  border-color: rgba(249, 115, 22, 0.6);
  box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.15);
}

.notes-textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.notes-textarea::placeholder {
  color: rgba(148, 163, 184, 0.5);
}

/* ==================
   ACTION BUTTONS
   ================== */

.action-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid rgba(71, 85, 105, 0.3);
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn svg {
  width: 1.125rem;
  height: 1.125rem;
}

.btn-approve {
  background: rgba(34, 197, 94, 0.9);
  color: white;
}

.btn-approve:hover:not(:disabled) {
  background: rgba(34, 197, 94, 1);
  box-shadow: 0 0 16px rgba(34, 197, 94, 0.4);
}

.btn-reject {
  background: rgba(239, 68, 68, 0.9);
  color: white;
}

.btn-reject:hover:not(:disabled) {
  background: rgba(239, 68, 68, 1);
  box-shadow: 0 0 16px rgba(239, 68, 68, 0.4);
}

.btn-cancel {
  background: rgba(71, 85, 105, 0.5);
  color: rgba(226, 232, 240, 1);
}

.btn-cancel:hover:not(:disabled) {
  background: rgba(71, 85, 105, 0.7);
}

.btn-spinner {
  width: 1rem;
  height: 1rem;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* ==================
   REVIEWED INFO
   ================== */

.reviewed-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem 1.25rem;
  background: rgba(30, 41, 59, 0.3);
  border: 1px solid rgba(71, 85, 105, 0.4);
  border-radius: 0.5rem;
  margin-top: 1.5rem;
}

.reviewed-text {
  font-size: 0.875rem;
  color: rgba(148, 163, 184, 0.9);
}

.rejected-text {
  color: rgba(239, 68, 68, 0.8);
}

.commit-link-small {
  font-size: 0.8125rem;
  color: rgba(96, 165, 250, 0.9);
  text-decoration: none;
}

.commit-link-small:hover {
  text-decoration: underline;
}

.rejection-reason {
  font-size: 0.875rem;
  color: rgba(203, 213, 225, 0.8);
  padding: 0.75rem;
  background: rgba(239, 68, 68, 0.05);
  border-radius: 0.375rem;
  margin-top: 0.25rem;
}

/* ==================
   MODAL
   ================== */

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-content {
  background: rgb(30, 41, 59);
  border: 1px solid rgba(71, 85, 105, 0.6);
  border-radius: 0.75rem;
  padding: 1.5rem;
  max-width: 420px;
  width: 100%;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

.modal-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: rgba(241, 245, 249, 1);
  margin: 0 0 0.75rem 0;
}

.modal-text {
  font-size: 0.9375rem;
  color: rgba(203, 213, 225, 0.9);
  line-height: 1.6;
  margin: 0 0 1.25rem 0;
}

.modal-warning {
  padding: 0.75rem;
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.3);
  border-radius: 0.375rem;
  color: rgba(251, 191, 36, 0.9);
  font-size: 0.8125rem;
  margin-bottom: 1rem;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

/* Modal Transitions */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-active .modal-content,
.modal-leave-active .modal-content {
  transition: transform 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.95);
}

/* ==================
   RESPONSIVE
   ================== */

@media (max-width: 640px) {
  .review-editor {
    padding: 1rem;
  }

  .edit-header {
    flex-direction: column;
    align-items: flex-start;
    padding: 1rem;
  }

  .header-main {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .character-icon-wrapper {
    width: 56px;
    height: 56px;
  }

  .header-title {
    font-size: 1.125rem;
  }

  .diff-columns {
    grid-template-columns: 1fr;
  }

  .action-buttons {
    flex-direction: column;
    gap: 0.75rem;
  }

  .btn {
    width: 100%;
    justify-content: center;
  }

  .modal-content {
    margin: 0 1rem;
  }
}
</style>

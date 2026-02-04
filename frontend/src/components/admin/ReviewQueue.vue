<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { supabase } from '../../lib/supabase';
import { useAdminAuth } from '../../composables/useAdminAuth';
import { getCharacterById } from '../../data';

// ==================
// TYPES
// ==================

type EditStatus = 'pending' | 'approved' | 'rejected' | 'deployed';

interface CharacterEdit {
  id: number;
  character_id: string;
  status: EditStatus;
  change_summary: string | null;
  created_at: string;
  editor_id: string;
  editor_profile: {
    username: string;
    display_name: string | null;
  } | null;
}

// ==================
// STATE
// ==================

const router = useRouter();
const { isLoading: isAuthLoading } = useAdminAuth();

const edits = ref<CharacterEdit[]>([]);
const isLoading = ref(true);
const error = ref<string | null>(null);
const statusFilter = ref<EditStatus | 'all'>('pending');

// Pagination
const currentPage = ref(1);
const pageSize = 20;
const totalCount = ref(0);

// ==================
// COMPUTED
// ==================

const totalPages = computed(() => Math.ceil(totalCount.value / pageSize));

const hasNextPage = computed(() => currentPage.value < totalPages.value);
const hasPrevPage = computed(() => currentPage.value > 1);

const paginationInfo = computed(() => {
  const start = (currentPage.value - 1) * pageSize + 1;
  const end = Math.min(currentPage.value * pageSize, totalCount.value);
  return { start, end, total: totalCount.value };
});

// ==================
// DATA LOADING
// ==================

async function fetchEdits() {
  isLoading.value = true;
  error.value = null;

  try {
    // Build query - fetch edits without join first
    let query = supabase
      .from('character_edits')
      .select('id, character_id, status, change_summary, created_at, editor_id', { count: 'exact' });

    // Apply status filter
    if (statusFilter.value !== 'all') {
      query = query.eq('status', statusFilter.value);
    }

    // Order by oldest first for FIFO fairness
    query = query
      .order('created_at', { ascending: true })
      .range((currentPage.value - 1) * pageSize, currentPage.value * pageSize - 1);

    const { data, error: fetchError, count } = await query;

    if (fetchError) {
      throw new Error(fetchError.message);
    }

    // Get unique editor IDs to fetch profiles
    const editorIds = [...new Set((data || []).map(d => d.editor_id))];

    // Fetch user profiles for these editors
    let profilesMap: Map<string, { username: string; display_name: string | null }> = new Map();
    if (editorIds.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, username, display_name')
        .in('id', editorIds);

      if (profiles) {
        profiles.forEach(p => {
          profilesMap.set(p.id, { username: p.username, display_name: p.display_name });
        });
      }
    }

    // Merge edits with profile data
    edits.value = (data || []).map(edit => ({
      ...edit,
      editor_profile: profilesMap.get(edit.editor_id) || null,
    }));
    totalCount.value = count || 0;
  } catch (err) {
    console.error('Failed to fetch edits:', err);
    error.value = err instanceof Error ? err.message : 'Failed to load edits';
    edits.value = [];
  } finally {
    isLoading.value = false;
  }
}

// ==================
// HANDLERS
// ==================

function handleRowClick(editId: number) {
  router.push(`/admin/review/${editId}`);
}

function handleFilterChange(newFilter: EditStatus | 'all') {
  statusFilter.value = newFilter;
  currentPage.value = 1;
}

function nextPage() {
  if (hasNextPage.value) {
    currentPage.value++;
  }
}

function prevPage() {
  if (hasPrevPage.value) {
    currentPage.value--;
  }
}

// ==================
// HELPERS
// ==================

function getCharacterName(characterId: string): string {
  const char = getCharacterById(characterId);
  return char?.name || characterId;
}

function getCharacterIcon(characterId: string): string {
  return `/icons/${characterId}.webp`;
}

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
    pending: { label: 'Pending', class: 'status-pending' },
    approved: { label: 'Approved', class: 'status-approved' },
    rejected: { label: 'Rejected', class: 'status-rejected' },
    deployed: { label: 'Deployed', class: 'status-deployed' },
  };
  return configs[status];
}

function truncateSummary(summary: string | null, maxLength = 60): string {
  if (!summary) return 'No summary provided';
  if (summary.length <= maxLength) return summary;
  return summary.slice(0, maxLength).trim() + '...';
}

// ==================
// WATCHERS & LIFECYCLE
// ==================

watch([statusFilter, currentPage], () => {
  fetchEdits();
});

onMounted(() => {
  fetchEdits();
});
</script>

<template>
  <div class="review-queue">
    <!-- Header -->
    <div class="queue-header">
      <h1 class="queue-title">Review Queue</h1>
      <div class="filter-controls">
        <label for="status-filter" class="filter-label">Status:</label>
        <select
          id="status-filter"
          class="filter-select"
          :value="statusFilter"
          @change="handleFilterChange(($event.target as HTMLSelectElement).value as EditStatus | 'all')"
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="deployed">Deployed</option>
          <option value="all">All</option>
        </select>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading || isAuthLoading" class="loading-state">
      <div class="loading-spinner"></div>
      <span class="loading-text">Loading edits...</span>
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
      <button class="retry-btn" @click="fetchEdits">Retry</button>
    </div>

    <!-- Empty State -->
    <div v-else-if="edits.length === 0" class="empty-state">
      <svg viewBox="0 0 20 20" fill="currentColor" class="empty-icon">
        <path
          fill-rule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clip-rule="evenodd"
        />
      </svg>
      <span class="empty-text">
        {{ statusFilter === 'pending' ? 'No pending edits' : `No ${statusFilter === 'all' ? '' : statusFilter + ' '}edits found` }}
      </span>
    </div>

    <!-- Edit List -->
    <div v-else class="edit-list">
      <div
        v-for="edit in edits"
        :key="edit.id"
        class="edit-card"
        @click="handleRowClick(edit.id)"
        role="button"
        tabindex="0"
        @keydown.enter="handleRowClick(edit.id)"
      >
        <div class="edit-main">
          <!-- Character Icon -->
          <div class="character-icon-wrapper">
            <img
              :src="getCharacterIcon(edit.character_id)"
              :alt="getCharacterName(edit.character_id)"
              class="character-icon"
              @error="($event.target as HTMLImageElement).src = '/icons/placeholder.webp'"
            />
          </div>

          <!-- Edit Info -->
          <div class="edit-info">
            <div class="edit-header-row">
              <span class="character-name">{{ getCharacterName(edit.character_id) }}</span>
              <span :class="['status-badge', getStatusConfig(edit.status).class]">
                {{ getStatusConfig(edit.status).label }}
              </span>
            </div>
            <div class="edit-summary">{{ truncateSummary(edit.change_summary) }}</div>
            <div class="edit-meta">
              <span class="editor-username">{{ edit.editor_profile?.display_name || edit.editor_profile?.username || 'Unknown user' }}</span>
              <span class="meta-separator">-</span>
              <span class="edit-time">{{ getRelativeTime(edit.created_at) }}</span>
            </div>
          </div>
        </div>

        <!-- Arrow Indicator -->
        <svg class="arrow-icon" viewBox="0 0 20 20" fill="currentColor">
          <path
            fill-rule="evenodd"
            d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
            clip-rule="evenodd"
          />
        </svg>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="pagination">
        <button
          class="pagination-btn"
          :disabled="!hasPrevPage"
          @click="prevPage"
        >
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path
              fill-rule="evenodd"
              d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
              clip-rule="evenodd"
            />
          </svg>
          Previous
        </button>
        <span class="pagination-info">
          {{ paginationInfo.start }}-{{ paginationInfo.end }} of {{ paginationInfo.total }}
        </span>
        <button
          class="pagination-btn"
          :disabled="!hasNextPage"
          @click="nextPage"
        >
          Next
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path
              fill-rule="evenodd"
              d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
      </div>

      <!-- Summary Footer -->
      <div class="queue-footer">
        <span class="footer-text">
          Showing {{ edits.length }} of {{ totalCount }} {{ statusFilter === 'all' ? '' : statusFilter + ' ' }}edit{{ totalCount === 1 ? '' : 's' }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ==================
   CONTAINER
   ================== */

.review-queue {
  max-width: 800px;
  margin: 0 auto;
  padding: 1.5rem;
}

/* ==================
   HEADER
   ================== */

.queue-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.queue-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: rgba(241, 245, 249, 1);
  margin: 0;
}

.filter-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.filter-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: rgba(148, 163, 184, 1);
}

.filter-select {
  padding: 0.5rem 2rem 0.5rem 0.75rem;
  background: rgba(51, 65, 85, 0.5);
  border: 1px solid rgba(71, 85, 105, 0.6);
  border-radius: 0.5rem;
  color: rgba(226, 232, 240, 1);
  font-size: 0.875rem;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.2s ease;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.5rem center;
  background-size: 1.125rem;
}

.filter-select:hover {
  border-color: rgba(100, 116, 139, 0.8);
}

.filter-select:focus {
  outline: none;
  border-color: rgba(249, 115, 22, 0.6);
  box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.15);
}

.filter-select option {
  background: rgb(30, 41, 59);
  color: rgba(226, 232, 240, 1);
}

/* ==================
   LOADING STATE
   ================== */

.loading-state {
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

/* ==================
   ERROR STATE
   ================== */

.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 2rem;
  gap: 1rem;
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
  text-align: center;
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
  border-color: rgba(239, 68, 68, 0.6);
}

/* ==================
   EMPTY STATE
   ================== */

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  gap: 1rem;
  background: rgba(30, 41, 59, 0.3);
  border: 1px dashed rgba(71, 85, 105, 0.5);
  border-radius: 0.75rem;
}

.empty-icon {
  width: 3rem;
  height: 3rem;
  color: rgba(34, 197, 94, 0.6);
}

.empty-text {
  font-size: 1rem;
  color: rgba(148, 163, 184, 0.8);
}

/* ==================
   EDIT LIST
   ================== */

.edit-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.edit-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(71, 85, 105, 0.5);
  border-radius: 0.75rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.edit-card:hover {
  background: rgba(51, 65, 85, 0.4);
  border-color: rgba(100, 116, 139, 0.6);
  transform: translateX(4px);
}

.edit-card:focus {
  outline: none;
  border-color: rgba(249, 115, 22, 0.6);
  box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.15);
}

.edit-main {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex: 1;
  min-width: 0;
}

/* Character Icon */
.character-icon-wrapper {
  width: 48px;
  height: 48px;
  border-radius: 0.5rem;
  overflow: hidden;
  border: 2px solid rgba(249, 115, 22, 0.4);
  flex-shrink: 0;
}

.character-icon {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Edit Info */
.edit-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.edit-header-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.character-name {
  font-size: 1rem;
  font-weight: 600;
  color: rgba(241, 245, 249, 1);
}

.edit-summary {
  font-size: 0.8125rem;
  color: rgba(203, 213, 225, 0.8);
  line-height: 1.4;
}

.edit-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: rgba(148, 163, 184, 0.7);
}

.meta-separator {
  color: rgba(148, 163, 184, 0.4);
}

.editor-username {
  max-width: 180px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Status Badge */
.status-badge {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
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

/* Arrow Icon */
.arrow-icon {
  width: 1.25rem;
  height: 1.25rem;
  color: rgba(148, 163, 184, 0.5);
  flex-shrink: 0;
  transition: transform 0.2s ease, color 0.2s ease;
}

.edit-card:hover .arrow-icon {
  color: rgba(249, 115, 22, 0.8);
  transform: translateX(4px);
}

/* ==================
   PAGINATION
   ================== */

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(71, 85, 105, 0.3);
}

.pagination-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.875rem;
  background: rgba(51, 65, 85, 0.5);
  border: 1px solid rgba(71, 85, 105, 0.6);
  border-radius: 0.5rem;
  color: rgba(226, 232, 240, 1);
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.pagination-btn:hover:not(:disabled) {
  background: rgba(71, 85, 105, 0.5);
  border-color: rgba(100, 116, 139, 0.8);
}

.pagination-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pagination-btn svg {
  width: 1rem;
  height: 1rem;
}

.pagination-info {
  font-size: 0.8125rem;
  color: rgba(148, 163, 184, 0.8);
  min-width: 100px;
  text-align: center;
}

/* ==================
   FOOTER
   ================== */

.queue-footer {
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(71, 85, 105, 0.2);
  text-align: center;
}

.footer-text {
  font-size: 0.8125rem;
  color: rgba(148, 163, 184, 0.6);
}

/* ==================
   RESPONSIVE
   ================== */

@media (max-width: 640px) {
  .review-queue {
    padding: 1rem;
  }

  .queue-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .edit-card {
    padding: 0.875rem 1rem;
  }

  .edit-main {
    gap: 0.75rem;
  }

  .character-icon-wrapper {
    width: 40px;
    height: 40px;
  }

  .character-name {
    font-size: 0.9375rem;
  }

  .edit-summary {
    font-size: 0.75rem;
  }

  .edit-meta {
    flex-wrap: wrap;
    gap: 0.25rem 0.5rem;
  }

  .pagination {
    flex-wrap: wrap;
    gap: 0.75rem;
  }
}
</style>

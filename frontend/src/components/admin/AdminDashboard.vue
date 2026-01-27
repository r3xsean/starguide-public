<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAdminAuth } from '../../composables/useAdminAuth';
import { supabase } from '../../lib/supabase';
import { characters } from '../../data';

// ==================
// COMPOSABLES
// ==================

const router = useRouter();
const { user, isAdmin } = useAdminAuth();

// ==================
// TYPES
// ==================

interface CharacterEdit {
  id: string;
  character_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'deployed';
  created_at: string;
}

// ==================
// STATE
// ==================

const selectedCharacterId = ref<string>('');
const searchQuery = ref('');
const isDropdownOpen = ref(false);
const isLoadingStats = ref(true);
const isLoadingActivity = ref(true);

// User stats
const totalEdits = ref(0);
const pendingEdits = ref(0);

// Admin stats
const pendingReviewCount = ref(0);

// Recent activity
const recentEdits = ref<CharacterEdit[]>([]);

// ==================
// COMPUTED
// ==================

const filteredCharacters = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();
  if (!query) return characters;

  return characters.filter(char =>
    char.name.toLowerCase().includes(query) ||
    char.id.toLowerCase().includes(query)
  );
});

const selectedCharacter = computed(() => {
  if (!selectedCharacterId.value) return null;
  return characters.find(c => c.id === selectedCharacterId.value) ?? null;
});

// ==================
// METHODS
// ==================

function selectCharacter(characterId: string) {
  selectedCharacterId.value = characterId;
  searchQuery.value = '';
  isDropdownOpen.value = false;
}

function clearSelection() {
  selectedCharacterId.value = '';
  searchQuery.value = '';
}

function editCharacter() {
  if (selectedCharacterId.value) {
    router.push(`/admin/character/${selectedCharacterId.value}`);
  }
}

function goToReviewQueue() {
  router.push('/admin/review');
}

function getCharacterName(characterId: string): string {
  const char = characters.find(c => c.id === characterId);
  return char?.name ?? characterId;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'pending': return 'pending';
    case 'approved': return 'approved';
    case 'rejected': return 'rejected';
    case 'deployed': return 'deployed';
    default: return status;
  }
}

// ==================
// DATA LOADING
// ==================

async function loadUserStats() {
  if (!user.value) return;

  try {
    isLoadingStats.value = true;

    // Get total edits count
    const { count: total, error: totalError } = await supabase
      .from('character_edits')
      .select('*', { count: 'exact', head: true })
      .eq('editor_id', user.value.id);

    if (totalError) throw totalError;
    totalEdits.value = total ?? 0;

    // Get pending edits count
    const { count: pending, error: pendingError } = await supabase
      .from('character_edits')
      .select('*', { count: 'exact', head: true })
      .eq('editor_id', user.value.id)
      .eq('status', 'pending');

    if (pendingError) throw pendingError;
    pendingEdits.value = pending ?? 0;

  } catch (err) {
    console.error('Error loading user stats:', err);
  } finally {
    isLoadingStats.value = false;
  }
}

async function loadPendingReviewCount() {
  if (!isAdmin.value) return;

  try {
    const { count, error } = await supabase
      .from('character_edits')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (error) throw error;
    pendingReviewCount.value = count ?? 0;

  } catch (err) {
    console.error('Error loading pending review count:', err);
  }
}

async function loadRecentActivity() {
  if (!user.value) return;

  try {
    isLoadingActivity.value = true;

    const { data, error } = await supabase
      .from('character_edits')
      .select('id, character_id, status, created_at')
      .eq('editor_id', user.value.id)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) throw error;
    recentEdits.value = (data ?? []) as CharacterEdit[];

  } catch (err) {
    console.error('Error loading recent activity:', err);
  } finally {
    isLoadingActivity.value = false;
  }
}

// ==================
// LIFECYCLE
// ==================

onMounted(() => {
  loadUserStats();
  loadPendingReviewCount();
  loadRecentActivity();
});
</script>

<template>
  <div class="dashboard">
    <!-- Page Title -->
    <h1 class="page-title">Dashboard</h1>

    <!-- Character Selector Card -->
    <div class="dashboard-card selector-card">
      <h2 class="card-title">Character Selector</h2>

      <div class="character-selector">
        <!-- Dropdown Trigger -->
        <div class="dropdown-container">
          <button
            class="dropdown-trigger"
            :class="{ 'has-selection': selectedCharacter }"
            @click="isDropdownOpen = !isDropdownOpen"
          >
            <template v-if="selectedCharacter">
              <img
                :src="`/icons/${selectedCharacter.id}.webp`"
                :alt="selectedCharacter.name"
                class="selected-icon"
                @error="($event.target as HTMLImageElement).src = '/icons/placeholder.webp'"
              />
              <span class="selected-name">{{ selectedCharacter.name }}</span>
              <button class="clear-btn" @click.stop="clearSelection" title="Clear selection">
                <svg viewBox="0 0 20 20" fill="currentColor">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </template>
            <template v-else>
              <svg class="dropdown-icon" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
              </svg>
              <span class="placeholder-text">Select character...</span>
            </template>
            <svg class="chevron" :class="{ rotated: isDropdownOpen }" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
          </button>

          <!-- Dropdown Panel -->
          <Transition name="dropdown">
            <div v-if="isDropdownOpen" class="dropdown-panel">
              <!-- Search Input -->
              <div class="dropdown-search">
                <svg class="search-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
                </svg>
                <input
                  v-model="searchQuery"
                  type="text"
                  placeholder="Search characters..."
                  class="search-input"
                  @click.stop
                />
              </div>

              <!-- Character List -->
              <div class="dropdown-list">
                <button
                  v-for="char in filteredCharacters"
                  :key="char.id"
                  class="dropdown-item"
                  :class="{ selected: char.id === selectedCharacterId }"
                  @click="selectCharacter(char.id)"
                >
                  <img
                    :src="`/icons/${char.id}.webp`"
                    :alt="char.name"
                    class="item-icon"
                    @error="($event.target as HTMLImageElement).src = '/icons/placeholder.webp'"
                  />
                  <span class="item-name">{{ char.name }}</span>
                  <span class="item-path">{{ char.path }}</span>
                </button>

                <div v-if="filteredCharacters.length === 0" class="no-results">
                  No characters found
                </div>
              </div>
            </div>
          </Transition>
        </div>

        <!-- Edit Button -->
        <button
          class="edit-btn"
          :disabled="!selectedCharacterId"
          @click="editCharacter"
        >
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
          </svg>
          Edit Character
        </button>
      </div>
    </div>

    <!-- Stats Cards Row -->
    <div class="stats-row">
      <!-- Your Edits Card -->
      <div class="dashboard-card stats-card">
        <div class="stats-content">
          <div class="stats-number" :class="{ loading: isLoadingStats }">
            {{ isLoadingStats ? '-' : totalEdits }}
          </div>
          <div class="stats-label">Your Edits</div>
          <div v-if="!isLoadingStats && pendingEdits > 0" class="stats-sub">
            ({{ pendingEdits }} pending)
          </div>
        </div>
        <div class="stats-icon">
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
          </svg>
        </div>
      </div>

      <!-- Pending Reviews Card (Admin Only) -->
      <div v-if="isAdmin" class="dashboard-card stats-card stats-card-admin">
        <div class="stats-content">
          <div class="stats-number" :class="{ loading: isLoadingStats }">
            {{ isLoadingStats ? '-' : pendingReviewCount }}
          </div>
          <div class="stats-label">Pending</div>
          <button class="stats-link" @click="goToReviewQueue">
            Review Queue
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>
        <div class="stats-icon stats-icon-admin">
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M15.988 3.012A2.25 2.25 0 0118 5.25v6.5A2.25 2.25 0 0115.75 14H13.5V7A2.5 2.5 0 0011 4.5H8.128a2.252 2.252 0 011.884-1.488A2.25 2.25 0 0112.25 1h1.5a2.25 2.25 0 012.238 2.012zM11.5 3.25a.75.75 0 01.75-.75h1.5a.75.75 0 01.75.75v.25h-3v-.25z" clip-rule="evenodd" />
            <path fill-rule="evenodd" d="M2 7a1 1 0 011-1h8a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V7zm6.585 3.08a.75.75 0 00-1.17-.96L5.29 11.7l-.97-.97a.75.75 0 00-1.06 1.06l1.5 1.5a.75.75 0 001.115-.05l2.7-3.15z" clip-rule="evenodd" />
          </svg>
        </div>
      </div>
    </div>

    <!-- Recent Activity -->
    <div class="dashboard-card activity-card">
      <h2 class="card-title">Recent Activity</h2>

      <div v-if="isLoadingActivity" class="activity-loading">
        Loading activity...
      </div>

      <div v-else-if="recentEdits.length === 0" class="activity-empty">
        No edits yet. Select a character above to get started.
      </div>

      <ul v-else class="activity-list">
        <li v-for="edit in recentEdits" :key="edit.id" class="activity-item">
          <div class="activity-dot" :class="`status-${edit.status}`"></div>
          <div class="activity-content">
            <span class="activity-text">
              You edited <strong>{{ getCharacterName(edit.character_id) }}</strong>
            </span>
            <span class="activity-status" :class="`status-${edit.status}`">
              ({{ getStatusLabel(edit.status) }})
            </span>
          </div>
          <span class="activity-time">{{ formatDate(edit.created_at) }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
/* ==================
   PAGE STRUCTURE
   ================== */

.dashboard {
  max-width: 800px;
  margin: 0 auto;
}

.page-title {
  font-family: var(--font-display, 'Orbitron', sans-serif);
  font-size: 1.5rem;
  font-weight: 700;
  color: rgba(241, 245, 249, 1);
  margin: 0 0 1.5rem 0;
}

/* ==================
   CARDS
   ================== */

.dashboard-card {
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(71, 85, 105, 0.5);
  border-radius: 0.75rem;
  padding: 1.25rem;
  margin-bottom: 1rem;
}

.card-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: rgba(148, 163, 184, 1);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 1rem 0;
}

/* ==================
   CHARACTER SELECTOR
   ================== */

.character-selector {
  display: flex;
  gap: 0.75rem;
}

.dropdown-container {
  position: relative;
  flex: 1;
}

.dropdown-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.75rem 1rem;
  background: rgba(51, 65, 85, 0.5);
  border: 1px solid rgba(71, 85, 105, 0.6);
  border-radius: 0.5rem;
  color: rgba(148, 163, 184, 1);
  font-size: 0.9375rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.dropdown-trigger:hover {
  border-color: rgba(100, 116, 139, 0.8);
}

.dropdown-trigger.has-selection {
  color: rgba(226, 232, 240, 1);
}

.selected-icon {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  object-fit: cover;
}

.selected-name {
  flex: 1;
  text-align: left;
}

.clear-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: rgba(239, 68, 68, 0.15);
  border: none;
  border-radius: 4px;
  color: rgba(239, 68, 68, 0.8);
  cursor: pointer;
  transition: all 0.2s ease;
}

.clear-btn:hover {
  background: rgba(239, 68, 68, 0.25);
  color: #ef4444;
}

.clear-btn svg {
  width: 14px;
  height: 14px;
}

.dropdown-icon {
  width: 18px;
  height: 18px;
  color: rgba(100, 116, 139, 0.8);
}

.placeholder-text {
  flex: 1;
  text-align: left;
}

.chevron {
  width: 18px;
  height: 18px;
  color: rgba(100, 116, 139, 0.8);
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.chevron.rotated {
  transform: rotate(180deg);
}

/* Dropdown Panel */
.dropdown-panel {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: rgb(30, 41, 59);
  border: 1px solid rgba(71, 85, 105, 0.6);
  border-radius: 0.5rem;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
  z-index: 100;
  overflow: hidden;
}

.dropdown-search {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border-bottom: 1px solid rgba(71, 85, 105, 0.4);
}

.search-icon {
  width: 16px;
  height: 16px;
  color: rgba(100, 116, 139, 0.7);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  color: rgba(226, 232, 240, 1);
  font-size: 0.875rem;
  outline: none;
}

.search-input::placeholder {
  color: rgba(100, 116, 139, 0.7);
}

.dropdown-list {
  max-height: 280px;
  overflow-y: auto;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  width: 100%;
  padding: 0.625rem 0.75rem;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background-color 0.15s ease;
  text-align: left;
}

.dropdown-item:hover {
  background: rgba(71, 85, 105, 0.3);
}

.dropdown-item.selected {
  background: rgba(249, 115, 22, 0.15);
}

.item-icon {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  object-fit: cover;
  flex-shrink: 0;
}

.item-name {
  flex: 1;
  font-size: 0.875rem;
  color: rgba(226, 232, 240, 1);
}

.item-path {
  font-size: 0.75rem;
  color: rgba(100, 116, 139, 0.8);
}

.no-results {
  padding: 1rem;
  text-align: center;
  color: rgba(100, 116, 139, 0.8);
  font-size: 0.875rem;
}

/* Edit Button */
.edit-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  background: #f97316;
  border: none;
  border-radius: 0.5rem;
  color: white;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.edit-btn:hover:not(:disabled) {
  background: #ea580c;
}

.edit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.edit-btn svg {
  width: 18px;
  height: 18px;
}

/* ==================
   STATS CARDS
   ================== */

.stats-row {
  display: flex;
  gap: 1rem;
}

.stats-card {
  flex: 1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.stats-content {
  display: flex;
  flex-direction: column;
}

.stats-number {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 2.25rem;
  font-weight: 700;
  color: rgba(226, 232, 240, 1);
  line-height: 1;
}

.stats-number.loading {
  color: rgba(100, 116, 139, 0.6);
}

.stats-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: rgba(148, 163, 184, 0.9);
  margin-top: 0.25rem;
}

.stats-sub {
  font-size: 0.75rem;
  color: rgba(251, 191, 36, 0.8);
  margin-top: 0.25rem;
}

.stats-link {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-top: 0.375rem;
  background: transparent;
  border: none;
  font-size: 0.8125rem;
  color: #f97316;
  cursor: pointer;
  transition: color 0.2s ease;
}

.stats-link:hover {
  color: #fb923c;
}

.stats-link svg {
  width: 14px;
  height: 14px;
}

.stats-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(249, 115, 22, 0.1);
  border-radius: 0.625rem;
}

.stats-icon svg {
  width: 24px;
  height: 24px;
  color: #f97316;
}

.stats-card-admin {
  border-color: rgba(249, 115, 22, 0.3);
}

.stats-icon-admin {
  background: rgba(249, 115, 22, 0.15);
}

/* ==================
   ACTIVITY LIST
   ================== */

.activity-card {
  margin-bottom: 0;
}

.activity-loading,
.activity-empty {
  padding: 1rem 0;
  text-align: center;
  color: rgba(100, 116, 139, 0.8);
  font-size: 0.875rem;
}

.activity-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.activity-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid rgba(71, 85, 105, 0.25);
}

.activity-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.activity-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.activity-dot.status-pending {
  background: #fbbf24;
}

.activity-dot.status-approved {
  background: #22c55e;
}

.activity-dot.status-rejected {
  background: #ef4444;
}

.activity-dot.status-deployed {
  background: #3b82f6;
}

.activity-content {
  flex: 1;
  min-width: 0;
}

.activity-text {
  font-size: 0.875rem;
  color: rgba(203, 213, 225, 1);
}

.activity-text strong {
  color: rgba(241, 245, 249, 1);
  font-weight: 600;
}

.activity-status {
  font-size: 0.8125rem;
  margin-left: 0.25rem;
}

.activity-status.status-pending {
  color: #fbbf24;
}

.activity-status.status-approved {
  color: #22c55e;
}

.activity-status.status-rejected {
  color: #ef4444;
}

.activity-status.status-deployed {
  color: #3b82f6;
}

.activity-time {
  font-size: 0.75rem;
  color: rgba(100, 116, 139, 0.8);
  white-space: nowrap;
}

/* ==================
   DROPDOWN TRANSITION
   ================== */

.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* ==================
   RESPONSIVE
   ================== */

@media (max-width: 640px) {
  .character-selector {
    flex-direction: column;
  }

  .edit-btn {
    width: 100%;
    justify-content: center;
  }

  .stats-row {
    flex-direction: column;
  }

  .stats-number {
    font-size: 1.75rem;
  }

  .activity-item {
    flex-wrap: wrap;
  }

  .activity-time {
    width: 100%;
    margin-left: calc(8px + 0.75rem);
    margin-top: 0.25rem;
  }
}
</style>

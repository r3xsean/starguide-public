<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useAdminAuth } from '../../composables/useAdminAuth';

// ==================
// TYPES
// ==================

type UserRole = 'admin' | 'contributor';

interface UserWithRole {
  id: string;
  username: string;
  display_name: string | null;
  role: UserRole;
  added_at: string;
  added_by: string | null;
}

// ==================
// STATE
// ==================

const { user } = useAdminAuth();

// User list
const users = ref<UserWithRole[]>([]);
const isLoading = ref(true);
const loadError = ref<string | null>(null);

// Add user form
const newUsername = ref('');
const newUserRole = ref<UserRole>('contributor');
const isAdding = ref(false);
const addError = ref<string | null>(null);

// Toast notifications
const toastMessage = ref<string | null>(null);
const toastType = ref<'success' | 'error'>('success');
const toastTimeout = ref<ReturnType<typeof setTimeout> | null>(null);

// Remove confirmation modal
const showRemoveModal = ref(false);
const userToRemove = ref<UserWithRole | null>(null);
const isRemoving = ref(false);

// ==================
// COMPUTED
// ==================

const isValidUsername = computed(() => {
  // Username: 3-20 chars, starts with alphanumeric, allows _ and -
  const usernameRegex = /^[a-z0-9][a-z0-9_-]{2,19}$/;
  return usernameRegex.test(newUsername.value.trim().toLowerCase());
});

const canAddUser = computed(() => {
  return isValidUsername.value && !isAdding.value;
});

const sortedUsers = computed(() => {
  return [...users.value].sort((a, b) => {
    // Admins first, then by added date
    if (a.role !== b.role) {
      return a.role === 'admin' ? -1 : 1;
    }
    return new Date(b.added_at).getTime() - new Date(a.added_at).getTime();
  });
});

// ==================
// HELPERS
// ==================

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function showToast(message: string, type: 'success' | 'error' = 'success') {
  if (toastTimeout.value) {
    clearTimeout(toastTimeout.value);
  }
  toastMessage.value = message;
  toastType.value = type;
  toastTimeout.value = setTimeout(() => {
    toastMessage.value = null;
  }, 4000);
}

function isCurrentUser(userId: string): boolean {
  return user.value?.id === userId;
}

// ==================
// DATA LOADING
// ==================

async function loadUsers() {
  if (!isSupabaseConfigured()) {
    loadError.value = 'Supabase not configured';
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  loadError.value = null;

  try {
    // Call RPC function that joins user_roles with auth.users
    const { data, error } = await supabase.rpc('get_users_with_roles');

    if (error) {
      console.error('Error fetching users:', error);
      loadError.value = 'Failed to load users';
      return;
    }

    users.value = (data || []) as UserWithRole[];
  } catch (e) {
    console.error('Failed to load users:', e);
    loadError.value = 'Failed to load users';
  } finally {
    isLoading.value = false;
  }
}

// ==================
// ADD USER
// ==================

async function addUser() {
  if (!canAddUser.value) return;

  isAdding.value = true;
  addError.value = null;

  const username = newUsername.value.trim().toLowerCase();

  try {
    // Call RPC function to add user role by username
    const { error } = await supabase.rpc('add_user_role', {
      user_username: username,
      user_role: newUserRole.value,
    });

    if (error) {
      console.error('Error adding user:', error);
      if (error.message.includes('not found') || error.message.includes('create a profile')) {
        addError.value = 'User not found. They must create a profile first.';
      } else if (error.message.includes('already has')) {
        addError.value = 'User already has a role assigned.';
      } else {
        addError.value = error.message || 'Failed to add user';
      }
      return;
    }

    // Success
    showToast(`Added @${username} as ${newUserRole.value}`, 'success');
    newUsername.value = '';
    newUserRole.value = 'contributor';
    await loadUsers();
  } catch (e) {
    console.error('Failed to add user:', e);
    addError.value = 'An unexpected error occurred';
  } finally {
    isAdding.value = false;
  }
}

// ==================
// REMOVE USER
// ==================

function confirmRemove(userWithRole: UserWithRole) {
  userToRemove.value = userWithRole;
  showRemoveModal.value = true;
}

function cancelRemove() {
  showRemoveModal.value = false;
  userToRemove.value = null;
}

async function executeRemove() {
  if (!userToRemove.value) return;

  isRemoving.value = true;

  try {
    const { error } = await supabase.rpc('remove_user_role', {
      target_user_id: userToRemove.value.id,
    });

    if (error) {
      console.error('Error removing user:', error);
      showToast(error.message || 'Failed to remove user', 'error');
      return;
    }

    const displayName = userToRemove.value.display_name || userToRemove.value.username;
    showToast(`Removed @${displayName}`, 'success');
    await loadUsers();
  } catch (e) {
    console.error('Failed to remove user:', e);
    showToast('An unexpected error occurred', 'error');
  } finally {
    isRemoving.value = false;
    showRemoveModal.value = false;
    userToRemove.value = null;
  }
}

// ==================
// LIFECYCLE
// ==================

onMounted(() => {
  loadUsers();
});
</script>

<template>
  <div class="user-management">
    <!-- Header -->
    <div class="section-header">
      <h2 class="section-title">User Management</h2>
    </div>

    <!-- Add User Form -->
    <div class="add-user-card">
      <h3 class="card-title">Add User</h3>
      <div class="add-user-form">
        <div class="form-row">
          <div class="form-group username-group">
            <label class="form-label" for="user-username">Username</label>
            <input
              id="user-username"
              v-model="newUsername"
              type="text"
              class="form-input"
              placeholder="username"
              :disabled="isAdding"
              @keyup.enter="addUser"
            />
          </div>
          <div class="form-group role-group">
            <label class="form-label" for="user-role">Role</label>
            <select
              id="user-role"
              v-model="newUserRole"
              class="form-select"
              :disabled="isAdding"
            >
              <option value="contributor">Contributor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        <div class="form-actions">
          <div v-if="addError" class="add-error">{{ addError }}</div>
          <button
            type="button"
            class="add-btn"
            :disabled="!canAddUser"
            @click="addUser"
          >
            <span v-if="isAdding" class="loading-spinner"></span>
            <span v-else>Add User</span>
          </button>
        </div>
      </div>
    </div>

    <!-- User List -->
    <div class="users-section">
      <h3 class="users-title">
        Current Users
        <span v-if="!isLoading" class="user-count">({{ users.length }})</span>
      </h3>

      <!-- Loading State -->
      <div v-if="isLoading" class="loading-state">
        <div class="loading-spinner large"></div>
        <span>Loading users...</span>
      </div>

      <!-- Error State -->
      <div v-else-if="loadError" class="error-state">
        <svg class="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span>{{ loadError }}</span>
        <button type="button" class="retry-btn" @click="loadUsers">Retry</button>
      </div>

      <!-- Empty State -->
      <div v-else-if="users.length === 0" class="empty-state">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <span>No users with admin roles yet</span>
      </div>

      <!-- User Cards -->
      <div v-else class="user-list">
        <div
          v-for="u in sortedUsers"
          :key="u.id"
          class="user-card"
          :class="{ 'is-current': isCurrentUser(u.id) }"
        >
          <div class="user-info">
            <div class="user-display-name">{{ u.display_name || `@${u.username}` }}</div>
            <div class="user-meta">
              <span class="role-badge" :class="u.role">
                {{ u.role === 'admin' ? 'Admin' : 'Contributor' }}
              </span>
              <span class="added-date">Added {{ formatDate(u.added_at) }}</span>
              <span v-if="isCurrentUser(u.id)" class="you-badge">(you)</span>
            </div>
          </div>
          <div class="user-actions">
            <button
              v-if="!isCurrentUser(u.id)"
              type="button"
              class="remove-btn"
              @click="confirmRemove(u)"
            >
              Remove
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Toast Notification -->
    <Transition name="toast">
      <div v-if="toastMessage" class="toast" :class="toastType">
        <svg v-if="toastType === 'success'" class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M20 6L9 17l-5-5" />
        </svg>
        <svg v-else class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
        <span>{{ toastMessage }}</span>
      </div>
    </Transition>

    <!-- Remove Confirmation Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showRemoveModal" class="modal-overlay" @click.self="cancelRemove">
          <div class="modal-container">
            <div class="modal-header">
              <h3 class="modal-title">Remove User</h3>
              <button type="button" class="modal-close" @click="cancelRemove">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div class="modal-body">
              <p class="confirm-text">
                Are you sure you want to remove
                <strong>{{ userToRemove?.display_name || `@${userToRemove?.username}` }}</strong>
                as <strong>{{ userToRemove?.role }}</strong>?
              </p>
              <p class="confirm-subtext">
                They will lose access to admin features.
              </p>
            </div>
            <div class="modal-footer">
              <button type="button" class="cancel-btn" @click="cancelRemove">
                Cancel
              </button>
              <button
                type="button"
                class="confirm-remove-btn"
                :disabled="isRemoving"
                @click="executeRemove"
              >
                <span v-if="isRemoving" class="loading-spinner"></span>
                <span v-else>Remove</span>
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

.user-management {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* ==================
   SECTION HEADER
   ================== */

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: rgba(241, 245, 249, 1);
  margin: 0;
}

/* ==================
   ADD USER CARD
   ================== */

.add-user-card {
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(71, 85, 105, 0.5);
  border-radius: 0.75rem;
  padding: 1.25rem;
}

.card-title {
  font-size: 1rem;
  font-weight: 600;
  color: rgba(203, 213, 225, 1);
  margin: 0 0 1rem;
}

.add-user-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-row {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.username-group {
  flex: 1;
  min-width: 200px;
}

.role-group {
  width: 140px;
  flex-shrink: 0;
}

.form-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: rgba(148, 163, 184, 1);
}

.form-input,
.form-select {
  padding: 0.625rem 0.875rem;
  background: rgba(51, 65, 85, 0.5);
  border: 1px solid rgba(71, 85, 105, 0.6);
  border-radius: 0.5rem;
  color: rgba(226, 232, 240, 1);
  font-size: 0.9375rem;
  font-family: inherit;
  transition: all 0.2s ease;
}

.form-input::placeholder {
  color: rgba(100, 116, 139, 0.8);
}

.form-input:hover,
.form-select:hover {
  border-color: rgba(100, 116, 139, 0.8);
}

.form-input:focus,
.form-select:focus {
  outline: none;
  border-color: rgba(249, 115, 22, 0.6);
  box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.15);
}

.form-input:disabled,
.form-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.form-select {
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.625rem center;
  background-size: 1.25rem;
  padding-right: 2.25rem;
}

.form-select option {
  background: rgb(30, 41, 59);
  color: rgba(226, 232, 240, 1);
}

.form-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.add-error {
  font-size: 0.8125rem;
  color: rgba(248, 113, 113, 0.9);
}

.add-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  background: linear-gradient(135deg, #fb923c, #f97316);
  border: none;
  border-radius: 0.5rem;
  color: white;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 100px;
}

.add-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(249, 115, 22, 0.35);
}

.add-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* ==================
   USERS SECTION
   ================== */

.users-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.users-title {
  font-size: 1rem;
  font-weight: 600;
  color: rgba(203, 213, 225, 1);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.user-count {
  font-weight: 400;
  color: rgba(148, 163, 184, 0.7);
}

/* ==================
   USER LIST
   ================== */

.user-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.user-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.25rem;
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(71, 85, 105, 0.5);
  border-radius: 0.625rem;
  transition: all 0.2s ease;
}

.user-card:hover {
  border-color: rgba(71, 85, 105, 0.7);
  background: rgba(30, 41, 59, 0.7);
}

.user-card.is-current {
  border-color: rgba(249, 115, 22, 0.3);
  background: rgba(249, 115, 22, 0.05);
}

.user-info {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  min-width: 0;
}

.user-display-name {
  font-size: 0.9375rem;
  font-weight: 500;
  color: rgba(241, 245, 249, 1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-meta {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.role-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.625rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: capitalize;
}

.role-badge.admin {
  background: rgba(239, 68, 68, 0.15);
  color: rgba(248, 113, 113, 0.95);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.role-badge.contributor {
  background: rgba(34, 211, 238, 0.15);
  color: rgba(103, 232, 249, 0.95);
  border: 1px solid rgba(34, 211, 238, 0.3);
}

.added-date {
  font-size: 0.75rem;
  color: rgba(148, 163, 184, 0.7);
}

.you-badge {
  font-size: 0.75rem;
  color: rgba(249, 115, 22, 0.8);
  font-weight: 500;
}

.user-actions {
  flex-shrink: 0;
}

.remove-btn {
  padding: 0.375rem 0.75rem;
  background: transparent;
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 0.375rem;
  color: rgba(248, 113, 113, 0.8);
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.remove-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.5);
  color: rgba(248, 113, 113, 1);
}

/* ==================
   LOADING/EMPTY/ERROR STATES
   ================== */

.loading-state,
.empty-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 3rem 1.5rem;
  background: rgba(30, 41, 59, 0.3);
  border: 1px dashed rgba(71, 85, 105, 0.4);
  border-radius: 0.75rem;
  color: rgba(148, 163, 184, 0.7);
  font-size: 0.9375rem;
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(249, 115, 22, 0.2);
  border-top-color: rgba(249, 115, 22, 0.8);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.loading-spinner.large {
  width: 32px;
  height: 32px;
  border-width: 3px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.empty-icon,
.error-icon {
  width: 48px;
  height: 48px;
  color: rgba(100, 116, 139, 0.5);
}

.retry-btn {
  margin-top: 0.5rem;
  padding: 0.5rem 1rem;
  background: rgba(71, 85, 105, 0.3);
  border: 1px solid rgba(71, 85, 105, 0.5);
  border-radius: 0.375rem;
  color: rgba(203, 213, 225, 1);
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.retry-btn:hover {
  background: rgba(71, 85, 105, 0.5);
  border-color: rgba(100, 116, 139, 0.6);
}

/* ==================
   TOAST NOTIFICATION
   ================== */

.toast {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.875rem 1.25rem;
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  font-weight: 500;
  z-index: 10001;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.toast.success {
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.4);
  color: rgba(134, 239, 172, 0.95);
}

.toast.error {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: rgba(248, 113, 113, 0.95);
}

.toast-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.toast-enter-active {
  animation: toast-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.toast-leave-active {
  animation: toast-out 0.2s ease-in;
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

@keyframes toast-out {
  from {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
  to {
    opacity: 0;
    transform: translateX(-50%) translateY(10px);
  }
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
  z-index: 10000;
  padding: 1rem;
}

.modal-container {
  width: 100%;
  max-width: 400px;
  background: linear-gradient(145deg, rgba(22, 22, 48, 0.98) 0%, rgba(14, 14, 32, 0.99) 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 1rem;
  box-shadow:
    0 24px 80px rgba(0, 0, 0, 0.6),
    0 0 1px rgba(255, 255, 255, 0.1);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.modal-title {
  font-size: 1.125rem;
  font-weight: 700;
  color: white;
  margin: 0;
}

.modal-close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.5);
  transition: all 0.2s;
}

.modal-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.modal-close svg {
  width: 18px;
  height: 18px;
}

.modal-body {
  padding: 1.5rem 1.25rem;
}

.confirm-text {
  font-size: 0.9375rem;
  color: rgba(226, 232, 240, 1);
  margin: 0 0 0.5rem;
  line-height: 1.5;
}

.confirm-text strong {
  color: white;
}

.confirm-subtext {
  font-size: 0.8125rem;
  color: rgba(148, 163, 184, 0.7);
  margin: 0;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.25rem 1.25rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.cancel-btn,
.confirm-remove-btn {
  padding: 0.625rem 1.25rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-width: 90px;
}

.cancel-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.6);
}

.cancel-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.confirm-remove-btn {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  border: none;
  color: white;
}

.confirm-remove-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.35);
}

.confirm-remove-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* Modal Transitions */
.modal-enter-active {
  animation: modal-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.modal-leave-active {
  animation: modal-out 0.2s ease-in;
}

@keyframes modal-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes modal-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

.modal-enter-active .modal-container {
  animation: modal-container-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.modal-leave-active .modal-container {
  animation: modal-container-out 0.2s ease-in;
}

@keyframes modal-container-in {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes modal-container-out {
  from {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  to {
    opacity: 0;
    transform: scale(0.98) translateY(5px);
  }
}

/* ==================
   RESPONSIVE
   ================== */

@media (max-width: 640px) {
  .form-row {
    flex-direction: column;
  }

  .role-group {
    width: 100%;
  }

  .form-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .add-error {
    text-align: center;
  }

  .user-card {
    flex-direction: column;
    align-items: flex-start;
  }

  .user-actions {
    width: 100%;
    display: flex;
    justify-content: flex-end;
    margin-top: 0.5rem;
    padding-top: 0.75rem;
    border-top: 1px solid rgba(71, 85, 105, 0.3);
  }

  .toast {
    left: 1rem;
    right: 1rem;
    transform: none;
    width: auto;
  }

  .toast-enter-active {
    animation: toast-in-mobile 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .toast-leave-active {
    animation: toast-out-mobile 0.2s ease-in;
  }

  @keyframes toast-in-mobile {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes toast-out-mobile {
    from {
      opacity: 1;
      transform: translateY(0);
    }
    to {
      opacity: 0;
      transform: translateY(10px);
    }
  }
}
</style>

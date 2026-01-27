<script setup lang="ts">
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAdminAuth } from '../../composables/useAdminAuth';

// ==================
// COMPOSABLES
// ==================

const router = useRouter();
const route = useRoute();
const { user, isAdmin, isLoading } = useAdminAuth();

// ==================
// PROPS
// ==================

interface Props {
  pendingReviewCount?: number;
}

const props = withDefaults(defineProps<Props>(), {
  pendingReviewCount: 0,
});

// ==================
// TYPES
// ==================

interface NavItem {
  name: string;
  path: string;
  icon: string;
  exact: boolean;
  badge?: number;
}

// ==================
// COMPUTED
// ==================

const userEmail = computed(() => user.value?.email ?? 'Unknown');

const currentPath = computed(() => route.path);

// Navigation items
const navItems = computed((): NavItem[] => {
  const items: NavItem[] = [
    {
      name: 'Dashboard',
      path: '/admin',
      icon: 'home',
      exact: true,
    },
    {
      name: 'Edit Character',
      path: '/admin',
      icon: 'pencil',
      exact: true,
    },
  ];

  // Admin-only items
  if (isAdmin.value) {
    items.push(
      {
        name: 'Users',
        path: '/admin/users',
        icon: 'users',
        exact: false,
      },
      {
        name: 'Review Queue',
        path: '/admin/review',
        icon: 'clipboard-check',
        exact: false,
        badge: props.pendingReviewCount > 0 ? props.pendingReviewCount : undefined,
      }
    );
  }

  return items;
});

// ==================
// METHODS
// ==================

function isActiveRoute(item: NavItem) {
  if (item.exact) {
    return currentPath.value === item.path;
  }
  return currentPath.value.startsWith(item.path);
}

function navigateTo(path: string) {
  router.push(path);
}

function goHome() {
  router.push('/');
}
</script>

<template>
  <div class="admin-layout">
    <!-- Sidebar -->
    <aside class="admin-sidebar">
      <!-- Logo/Brand -->
      <div class="sidebar-brand">
        <button class="brand-button" @click="goHome" title="Back to StarGuide">
          <svg class="brand-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
          </svg>
          <span class="brand-text">StarGuide</span>
          <span class="brand-badge">Admin</span>
        </button>
      </div>

      <!-- Navigation -->
      <nav class="sidebar-nav">
        <button
          v-for="item in navItems"
          :key="item.path + item.name"
          class="nav-item"
          :class="{ active: isActiveRoute(item) }"
          @click="navigateTo(item.path)"
        >
          <!-- Home Icon -->
          <svg v-if="item.icon === 'home'" class="nav-icon" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M9.293 2.293a1 1 0 011.414 0l7 7A1 1 0 0117 11h-1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-3a1 1 0 00-1-1H9a1 1 0 00-1 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-6H3a1 1 0 01-.707-1.707l7-7z" clip-rule="evenodd" />
          </svg>

          <!-- Pencil Icon -->
          <svg v-else-if="item.icon === 'pencil'" class="nav-icon" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
          </svg>

          <!-- Users Icon -->
          <svg v-else-if="item.icon === 'users'" class="nav-icon" viewBox="0 0 20 20" fill="currentColor">
            <path d="M7 8a3 3 0 100-6 3 3 0 000 6zM14.5 9a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM1.615 16.428a1.224 1.224 0 01-.569-1.175 6.002 6.002 0 0111.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 017 18a9.953 9.953 0 01-5.385-1.572zM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 00-1.588-3.755 4.502 4.502 0 015.874 2.636.818.818 0 01-.36.98A7.465 7.465 0 0114.5 16z" />
          </svg>

          <!-- Clipboard Check Icon -->
          <svg v-else-if="item.icon === 'clipboard-check'" class="nav-icon" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M15.988 3.012A2.25 2.25 0 0118 5.25v6.5A2.25 2.25 0 0115.75 14H13.5V7A2.5 2.5 0 0011 4.5H8.128a2.252 2.252 0 011.884-1.488A2.25 2.25 0 0112.25 1h1.5a2.25 2.25 0 012.238 2.012zM11.5 3.25a.75.75 0 01.75-.75h1.5a.75.75 0 01.75.75v.25h-3v-.25z" clip-rule="evenodd" />
            <path fill-rule="evenodd" d="M2 7a1 1 0 011-1h8a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V7zm6.585 3.08a.75.75 0 00-1.17-.96L5.29 11.7l-.97-.97a.75.75 0 00-1.06 1.06l1.5 1.5a.75.75 0 001.115-.05l2.7-3.15z" clip-rule="evenodd" />
          </svg>

          <span class="nav-text">{{ item.name }}</span>

          <!-- Badge for pending reviews -->
          <span v-if="item.badge" class="nav-badge">{{ item.badge }}</span>
        </button>
      </nav>
    </aside>

    <!-- Main Content Area -->
    <div class="admin-main">
      <!-- Header -->
      <header class="admin-header">
        <div class="header-title">StarGuide Admin</div>
        <div class="header-user">
          <span v-if="isLoading" class="user-loading">Loading...</span>
          <span v-else class="user-email">{{ userEmail }}</span>
        </div>
      </header>

      <!-- Page Content -->
      <main class="admin-content">
        <slot />
      </main>
    </div>
  </div>
</template>

<style scoped>
/* ==================
   LAYOUT STRUCTURE
   ================== */

.admin-layout {
  display: flex;
  min-height: 100vh;
  background: rgb(15, 23, 42);
}

/* ==================
   SIDEBAR
   ================== */

.admin-sidebar {
  width: 240px;
  background: rgb(30, 41, 59);
  border-right: 1px solid rgba(71, 85, 105, 0.5);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-brand {
  padding: 1.25rem 1rem;
  border-bottom: 1px solid rgba(71, 85, 105, 0.3);
}

.brand-button {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 0.5rem;
  transition: background-color 0.2s ease;
  width: 100%;
}

.brand-button:hover {
  background: rgba(71, 85, 105, 0.3);
}

.brand-icon {
  width: 1.75rem;
  height: 1.75rem;
  color: #f97316;
  flex-shrink: 0;
}

.brand-text {
  font-family: var(--font-display, 'Orbitron', sans-serif);
  font-size: 1.125rem;
  font-weight: 700;
  color: rgba(241, 245, 249, 1);
}

.brand-badge {
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #f97316;
  background: rgba(249, 115, 22, 0.15);
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  border: 1px solid rgba(249, 115, 22, 0.3);
}

/* ==================
   NAVIGATION
   ================== */

.sidebar-nav {
  flex: 1;
  padding: 1rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: transparent;
  border: none;
  border-left: 2px solid transparent;
  border-radius: 0 0.5rem 0.5rem 0;
  cursor: pointer;
  transition: all 0.2s ease;
  width: 100%;
  text-align: left;
}

.nav-item:hover {
  background: rgba(71, 85, 105, 0.25);
}

.nav-item.active {
  background: rgba(249, 115, 22, 0.1);
  border-left-color: #f97316;
}

.nav-icon {
  width: 1.25rem;
  height: 1.25rem;
  color: rgba(148, 163, 184, 0.8);
  flex-shrink: 0;
  transition: color 0.2s ease;
}

.nav-item:hover .nav-icon {
  color: rgba(203, 213, 225, 1);
}

.nav-item.active .nav-icon {
  color: #f97316;
}

.nav-text {
  font-size: 0.9375rem;
  font-weight: 500;
  color: rgba(148, 163, 184, 1);
  transition: color 0.2s ease;
  flex: 1;
}

.nav-item:hover .nav-text {
  color: rgba(226, 232, 240, 1);
}

.nav-item.active .nav-text {
  color: #fb923c;
}

.nav-badge {
  font-size: 0.6875rem;
  font-weight: 600;
  color: white;
  background: #f97316;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  min-width: 1.25rem;
  text-align: center;
}

/* ==================
   MAIN AREA
   ================== */

.admin-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* ==================
   HEADER
   ================== */

.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  background: rgb(30, 41, 59);
  border-bottom: 1px solid rgba(71, 85, 105, 0.5);
  flex-shrink: 0;
}

.header-title {
  font-family: var(--font-display, 'Orbitron', sans-serif);
  font-size: 1.25rem;
  font-weight: 700;
  color: rgba(241, 245, 249, 1);
}

.header-user {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.user-email {
  font-size: 0.875rem;
  color: rgba(148, 163, 184, 1);
}

.user-loading {
  font-size: 0.875rem;
  color: rgba(100, 116, 139, 1);
  font-style: italic;
}

/* ==================
   CONTENT
   ================== */

.admin-content {
  flex: 1;
  padding: 1.5rem;
  overflow-y: auto;
  background: rgb(15, 23, 42);
}

/* ==================
   RESPONSIVE
   ================== */

@media (max-width: 768px) {
  .admin-layout {
    flex-direction: column;
  }

  .admin-sidebar {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid rgba(71, 85, 105, 0.5);
  }

  .sidebar-nav {
    flex-direction: row;
    overflow-x: auto;
    gap: 0.5rem;
    padding: 0.75rem;
  }

  .nav-item {
    border-left: none;
    border-bottom: 2px solid transparent;
    border-radius: 0.5rem 0.5rem 0 0;
    white-space: nowrap;
    padding: 0.5rem 0.75rem;
  }

  .nav-item.active {
    border-bottom-color: #f97316;
  }

  .nav-text {
    font-size: 0.8125rem;
  }

  .admin-content {
    padding: 1rem;
  }
}
</style>

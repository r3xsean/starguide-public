import { ref, computed, watch } from 'vue';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

// Singleton state - shared across all component instances
const userRole = ref<'admin' | 'contributor' | null>(null);
const isRoleLoading = ref(false);
const isRoleInitialized = ref(false);

export function useAdminAuth() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const isAdmin = computed(() => userRole.value === 'admin');
  const isContributor = computed(() => userRole.value !== null);
  const isLoading = computed(() => isAuthLoading.value || isRoleLoading.value);

  async function fetchRole() {
    if (!user.value) {
      userRole.value = null;
      isRoleInitialized.value = true;
      return;
    }

    isRoleLoading.value = true;
    try {
      const { data, error } = await supabase.rpc('get_user_role', {
        user_id: user.value.id
      });
      if (error) throw error;
      userRole.value = data as 'admin' | 'contributor' | null;
    } catch (err) {
      console.error('Error fetching role:', err);
      userRole.value = null;
    } finally {
      isRoleLoading.value = false;
      isRoleInitialized.value = true;
    }
  }

  // Auto-fetch role when user changes
  watch(user, () => {
    fetchRole();
  }, { immediate: true });

  return {
    user,
    isAuthenticated,
    userRole,
    isAdmin,
    isContributor,
    isLoading,
    isRoleInitialized,
    fetchRole
  };
}

import { ref, computed } from 'vue';
import type { User } from '../lib/supabase';
import {
  getCurrentUser,
  onAuthStateChange,
  signInWithEmail as supabaseSignInWithEmail,
  signUpWithEmail as supabaseSignUpWithEmail,
  signInWithGoogle as supabaseSignInWithGoogle,
  signOut as supabaseSignOut,
  resetPassword as supabaseResetPassword,
  deleteAccount as supabaseDeleteAccount,
} from '../lib/supabase';

// Singleton state - shared across all component instances
const user = ref<User | null>(null);
const isLoading = ref(true);
const isInitialized = ref(false);
let unsubscribe: (() => void) | null = null;

export function useAuth() {
  // Computed
  const isGuest = computed(() => !user.value);
  const isAuthenticated = computed(() => !!user.value);
  const userEmail = computed(() => user.value?.email ?? null);
  const userId = computed(() => user.value?.id ?? null);

  // Initialize auth listener (call once from App.vue)
  const initAuthListener = () => {
    if (isInitialized.value) return;
    isInitialized.value = true;

    // Check for existing session
    getCurrentUser().then((existingUser) => {
      user.value = existingUser;
      isLoading.value = false;
    });

    // Subscribe to auth changes
    unsubscribe = onAuthStateChange((authUser) => {
      user.value = authUser;
      isLoading.value = false;
    });
  };

  // Cleanup auth listener
  const cleanupAuthListener = () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    isInitialized.value = false;
  };

  // Sign in with email/password
  const signInWithEmail = async (
    email: string,
    password: string
  ): Promise<{ error: string | null }> => {
    isLoading.value = true;
    const result = await supabaseSignInWithEmail(email, password);
    isLoading.value = false;

    if (result.user) {
      user.value = result.user;
    }

    return { error: result.error };
  };

  // Sign up with email/password
  const signUpWithEmail = async (
    email: string,
    password: string
  ): Promise<{ error: string | null; needsConfirmation: boolean }> => {
    isLoading.value = true;
    const result = await supabaseSignUpWithEmail(email, password);
    isLoading.value = false;

    // If user exists but email not confirmed, show confirmation message
    const needsConfirmation = !!result.user && !result.user.confirmed_at;

    if (result.user && result.user.confirmed_at) {
      user.value = result.user;
    }

    return { error: result.error, needsConfirmation };
  };

  // Sign in with Google
  const signInWithGoogle = async (): Promise<{ error: string | null }> => {
    isLoading.value = true;
    const result = await supabaseSignInWithGoogle();
    // Don't set isLoading to false - page will redirect
    return result;
  };

  // Sign out
  const signOut = async (): Promise<{ error: string | null }> => {
    isLoading.value = true;
    const result = await supabaseSignOut();
    isLoading.value = false;

    if (!result.error) {
      user.value = null;
    }

    return result;
  };

  // Reset password
  const resetPassword = async (
    email: string
  ): Promise<{ error: string | null }> => {
    return supabaseResetPassword(email);
  };

  // Delete account
  const deleteAccount = async (): Promise<{ error: string | null }> => {
    isLoading.value = true;
    const result = await supabaseDeleteAccount();
    isLoading.value = false;

    if (!result.error) {
      user.value = null;
    }

    return result;
  };

  return {
    // State
    user,
    isLoading,
    isInitialized,

    // Computed
    isGuest,
    isAuthenticated,
    userEmail,
    userId,

    // Methods
    initAuthListener,
    cleanupAuthListener,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    signOut,
    resetPassword,
    deleteAccount,
  };
}

import { createClient } from '@supabase/supabase-js';
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
// Support both new (sb_publishable_) and legacy (anon) key names
const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    'Supabase credentials not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env'
  );
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder-key'
);

// Check if Supabase is properly configured
export const isSupabaseConfigured = () => {
  return (
    supabaseUrl &&
    supabaseKey &&
    !supabaseUrl.includes('placeholder') &&
    !supabaseUrl.includes('your-project-id')
  );
};

// Browser ID for tracking feedback across sessions
const BROWSER_ID_KEY = 'starguide-browser-id';

export const getBrowserId = (): string => {
  let browserId = localStorage.getItem(BROWSER_ID_KEY);
  if (!browserId) {
    browserId = crypto.randomUUID();
    localStorage.setItem(BROWSER_ID_KEY, browserId);
  }
  return browserId;
};

// Feedback completion notification types
export interface CompletedFeedback {
  id: string;
  type: string;
  message: string;
  admin_response: string | null;
  created_at: string;
}

// Local storage key for tracking seen feedback (fallback if Supabase update fails)
const SEEN_FEEDBACK_KEY = 'starguide-seen-feedback';

// Get list of seen feedback IDs from localStorage
const getSeenFeedbackIds = (): Set<string> => {
  try {
    const stored = localStorage.getItem(SEEN_FEEDBACK_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
};

// Add feedback ID to local seen list
const addToLocalSeenList = (feedbackId: string): void => {
  try {
    const seenIds = getSeenFeedbackIds();
    seenIds.add(feedbackId);
    localStorage.setItem(SEEN_FEEDBACK_KEY, JSON.stringify([...seenIds]));
  } catch {
    // Ignore localStorage errors
  }
};

// Check for completed feedback that hasn't been seen
export const getCompletedFeedback = async (): Promise<CompletedFeedback[]> => {
  if (!isSupabaseConfigured()) return [];

  try {
    const browserId = getBrowserId();
    const { data, error } = await supabase
      .from('feedback')
      .select('id, type, message, admin_response, created_at')
      .eq('browser_id', browserId)
      .eq('status', 'completed')
      .is('seen_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching completed feedback:', error);
      return [];
    }

    // Also filter by local seen list (fallback for when Supabase update failed)
    const seenIds = getSeenFeedbackIds();
    return (data || []).filter(f => !seenIds.has(f.id));
  } catch (e) {
    console.error('Failed to fetch completed feedback:', e);
    return [];
  }
};

// Mark feedback as seen - uses RPC function to bypass RLS, falls back to localStorage
export const markFeedbackSeen = async (feedbackId: string): Promise<boolean> => {
  // Always add to local list as fallback
  addToLocalSeenList(feedbackId);

  if (!isSupabaseConfigured()) return true;

  try {
    const { error } = await supabase.rpc('mark_feedback_seen', {
      feedback_id: feedbackId,
    });

    if (error) {
      // Don't log error if function doesn't exist yet - localStorage fallback handles it
      if (!error.message?.includes('function') && !error.message?.includes('does not exist')) {
        console.error('Error marking feedback as seen:', error);
      }
      return true;
    }

    return true;
  } catch (e) {
    console.error('Failed to mark feedback as seen:', e);
    return true;
  }
};

// ============================================
// SURVEY SYSTEM
// ============================================

export interface SurveySubmission {
  survey_id: string;
  responses: Record<string, string | string[] | number>;
  skipped: boolean;
}

// Submit a survey response to Supabase
export const submitSurveyResponse = async (
  submission: SurveySubmission
): Promise<boolean> => {
  if (!isSupabaseConfigured()) {
    console.warn('Supabase not configured - survey response not saved');
    return false;
  }

  try {
    const { error } = await supabase.from('survey_responses').insert({
      survey_id: submission.survey_id,
      responses: submission.responses,
      skipped: submission.skipped,
      browser_id: getBrowserId(),
      user_agent: navigator.userAgent,
    });

    if (error) {
      console.error('Supabase error submitting survey:', error);
      return false;
    }

    return true;
  } catch (e) {
    console.error('Failed to submit survey response:', e);
    return false;
  }
};

// ============================================
// AUTHENTICATION SYSTEM
// ============================================

export type { User };

// Get current authenticated user
export const getCurrentUser = async (): Promise<User | null> => {
  if (!isSupabaseConfigured()) return null;

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch (e) {
    console.error('Failed to get current user:', e);
    return null;
  }
};

// Subscribe to auth state changes
export const onAuthStateChange = (
  callback: (user: User | null) => void
): (() => void) => {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(
    (_event: AuthChangeEvent, session: Session | null) => {
      callback(session?.user ?? null);
    }
  );

  return () => subscription.unsubscribe();
};

// Sign in with email and password
export const signInWithEmail = async (
  email: string,
  password: string
): Promise<{ user: User | null; error: string | null }> => {
  if (!isSupabaseConfigured()) {
    return { user: null, error: 'Supabase not configured' };
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { user: null, error: error.message };
    }

    return { user: data.user, error: null };
  } catch (e) {
    console.error('Sign in error:', e);
    return { user: null, error: 'An unexpected error occurred' };
  }
};

// Sign up with email and password
export const signUpWithEmail = async (
  email: string,
  password: string
): Promise<{ user: User | null; error: string | null }> => {
  if (!isSupabaseConfigured()) {
    return { user: null, error: 'Supabase not configured' };
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      return { user: null, error: error.message };
    }

    return { user: data.user, error: null };
  } catch (e) {
    console.error('Sign up error:', e);
    return { user: null, error: 'An unexpected error occurred' };
  }
};

// Sign in with Google OAuth
export const signInWithGoogle = async (): Promise<{ error: string | null }> => {
  if (!isSupabaseConfigured()) {
    return { error: 'Supabase not configured' };
  }

  try {
    // Use the base URL without trailing slash
    const redirectUrl = window.location.origin.replace(/\/$/, '');

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
      },
    });

    if (error) {
      return { error: error.message };
    }

    return { error: null };
  } catch (e) {
    console.error('Google sign in error:', e);
    return { error: 'An unexpected error occurred' };
  }
};

// Sign out
export const signOut = async (): Promise<{ error: string | null }> => {
  if (!isSupabaseConfigured()) {
    return { error: null };
  }

  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      return { error: error.message };
    }

    return { error: null };
  } catch (e) {
    console.error('Sign out error:', e);
    return { error: 'An unexpected error occurred' };
  }
};

// Send password reset email
export const resetPassword = async (
  email: string
): Promise<{ error: string | null }> => {
  if (!isSupabaseConfigured()) {
    return { error: 'Supabase not configured' };
  }

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      return { error: error.message };
    }

    return { error: null };
  } catch (e) {
    console.error('Password reset error:', e);
    return { error: 'An unexpected error occurred' };
  }
};

// Delete user account
export const deleteAccount = async (): Promise<{ error: string | null }> => {
  if (!isSupabaseConfigured()) {
    return { error: 'Supabase not configured' };
  }

  try {
    // First delete user data
    const user = await getCurrentUser();
    if (user) {
      await deleteUserData(user.id);
    }

    // Note: Supabase doesn't allow users to delete themselves directly
    // This would need a server-side function or Edge Function
    // For now, we just sign them out and their data is deleted
    await signOut();

    return { error: null };
  } catch (e) {
    console.error('Delete account error:', e);
    return { error: 'An unexpected error occurred' };
  }
};

// ============================================
// USER DATA STORAGE
// ============================================

export interface UserData {
  id: string;
  roster: [string, unknown][];
  favorited_teams: string[][];
  settings: {
    includePlanningInTeams?: boolean;
  };
  created_at?: string;
  updated_at?: string;
}

// Get user data from cloud
export const getUserData = async (userId: string): Promise<UserData | null> => {
  if (!isSupabaseConfigured()) return null;

  try {
    const { data, error } = await supabase
      .from('user_data')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      // PGRST116 means no rows found - not an error for new users
      if (error.code !== 'PGRST116') {
        console.error('Error fetching user data:', error);
      }
      return null;
    }

    return data as UserData;
  } catch (e) {
    console.error('Failed to fetch user data:', e);
    return null;
  }
};

// Create or update user data in cloud
export const upsertUserData = async (
  userId: string,
  data: Partial<Omit<UserData, 'id' | 'created_at' | 'updated_at'>>
): Promise<{ error: string | null }> => {
  if (!isSupabaseConfigured()) {
    return { error: 'Supabase not configured' };
  }

  try {
    const { error } = await supabase.from('user_data').upsert(
      {
        id: userId,
        ...data,
      },
      {
        onConflict: 'id',
      }
    );

    if (error) {
      console.error('Error upserting user data:', error);
      return { error: error.message };
    }

    return { error: null };
  } catch (e) {
    console.error('Failed to upsert user data:', e);
    return { error: 'An unexpected error occurred' };
  }
};

// Delete user data from cloud
export const deleteUserData = async (
  userId: string
): Promise<{ error: string | null }> => {
  if (!isSupabaseConfigured()) {
    return { error: null };
  }

  try {
    const { error } = await supabase.from('user_data').delete().eq('id', userId);

    if (error) {
      console.error('Error deleting user data:', error);
      return { error: error.message };
    }

    return { error: null };
  } catch (e) {
    console.error('Failed to delete user data:', e);
    return { error: 'An unexpected error occurred' };
  }
};

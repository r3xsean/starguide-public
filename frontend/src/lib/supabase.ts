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

// ============================================
// USER PROFILE TYPES
// ============================================

export interface UserProfile {
  id: string;                    // UUID from auth.users
  username: string;              // URL-safe identifier
  display_name: string | null;
  bio: string | null;
  game_uid: string | null;
  discord_handle: string | null;
  avatar_character_id: string | null; // Character ID for profile avatar
  showcase_characters: string[]; // Array of character IDs
  is_public: boolean;
  show_uid: boolean;
  show_discord: boolean;
  show_investment: 'all' | 'showcase' | 'none';
  created_at: string;
  updated_at: string;
}

export interface PublicRoster {
  roster: [string, unknown][]; // [characterId, UserCharacterInvestment][]
  favorited_teams: string[][]; // Array of [charId, charId, charId, charId]
}

// ============================================
// PROFILE CRUD FUNCTIONS
// ============================================

/**
 * Get the current user's own profile (for editing in settings)
 */
export const getOwnProfile = async (userId: string): Promise<UserProfile | null> => {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle(); // Use maybeSingle() to return null instead of 406 when no rows

  if (error) {
    console.error('Error fetching own profile:', error);
    return null;
  }
  return data as UserProfile | null;
};

/**
 * Get a public profile by username (for /u/:username pages)
 * Returns null if profile doesn't exist or is private
 */
export const getPublicProfile = async (username: string): Promise<UserProfile | null> => {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('username', username.toLowerCase())
    .eq('is_public', true)
    .maybeSingle(); // Use maybeSingle() to return null instead of 406 when no rows

  if (error) {
    console.error('Error fetching public profile:', error);
    return null;
  }

  if (!data) return null;

  // Apply privacy filters before returning
  return {
    ...data,
    game_uid: data.show_uid ? data.game_uid : null,
    discord_handle: data.show_discord ? data.discord_handle : null,
  };
};

/**
 * Get public roster data for a profile
 * Only returns data if is_roster_public = true
 */
export const getPublicRoster = async (userId: string): Promise<PublicRoster | null> => {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await supabase
    .from('user_data')
    .select('roster, favorited_teams')
    .eq('id', userId)
    .eq('is_roster_public', true)
    .maybeSingle(); // Use maybeSingle() to return null instead of 406 when no rows

  if (error) {
    console.error('Error fetching public roster:', error);
    return null;
  }
  return data as PublicRoster | null;
};

/**
 * Create a new user profile (requires username)
 */
export const createProfile = async (
  userId: string,
  profile: Omit<UserProfile, 'id' | 'created_at' | 'updated_at'> & { username: string }
): Promise<{ error: string | null }> => {
  if (!isSupabaseConfigured()) return { error: 'Supabase not configured' };

  const { error } = await supabase
    .from('user_profiles')
    .insert({ id: userId, ...profile });

  if (error) {
    console.error('Error creating profile:', error);
    return { error: error.message };
  }
  return { error: null };
};

/**
 * Update an existing user profile (partial updates allowed)
 */
export const updateProfile = async (
  userId: string,
  updates: Partial<Omit<UserProfile, 'id' | 'created_at' | 'updated_at'>>
): Promise<{ error: string | null }> => {
  if (!isSupabaseConfigured()) return { error: 'Supabase not configured' };

  const { error } = await supabase
    .from('user_profiles')
    .update(updates)
    .eq('id', userId);

  if (error) {
    console.error('Error updating profile:', error);
    return { error: error.message };
  }
  return { error: null };
};

/**
 * Create or update user profile (legacy - prefer createProfile/updateProfile)
 */
export const upsertProfile = async (
  userId: string,
  profile: Partial<Omit<UserProfile, 'id' | 'created_at' | 'updated_at'>>
): Promise<{ error: string | null }> => {
  if (!isSupabaseConfigured()) return { error: 'Supabase not configured' };

  const { error } = await supabase
    .from('user_profiles')
    .upsert({ id: userId, ...profile }, { onConflict: 'id' });

  if (error) {
    console.error('Error upserting profile:', error);
    return { error: error.message };
  }
  return { error: null };
};

/**
 * Check if a username is available
 * Uses RPC function for security (no direct table access)
 */
export const checkUsernameAvailable = async (username: string): Promise<boolean> => {
  if (!isSupabaseConfigured()) return false;
  if (!username || username.length < 3) return false;

  const { data, error } = await supabase
    .rpc('check_username_available', { desired_username: username.toLowerCase() });

  if (error) {
    console.error('Error checking username:', error);
    return false;
  }
  return data === true;
};

/**
 * Update roster visibility separately (synced with profile settings)
 */
export const setRosterPublic = async (
  userId: string,
  isPublic: boolean
): Promise<{ error: string | null }> => {
  if (!isSupabaseConfigured()) return { error: 'Supabase not configured' };

  const { error } = await supabase
    .from('user_data')
    .update({ is_roster_public: isPublic })
    .eq('id', userId);

  if (error) {
    console.error('Error setting roster visibility:', error);
    return { error: error.message };
  }
  return { error: null };
};

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import type { User } from '@supabase/supabase-js';
import { useProfile } from '../composables/useProfile';
import { useRouteState } from '../composables/useRouteState';
import { characters } from '../data';
import { getEffectiveScore, scoreToTier, getBestTierForMode } from '../utils/scaleConverters';
import CharacterCard from './CharacterCard.vue';
import ShowcaseSelector from './ShowcaseSelector.vue';
import AvatarSelector from './AvatarSelector.vue';
import type { Character, UserCharacterInvestment, UserRosterMap, TierRating } from '../types';

// Game mode type for tier display
type TierSortMode = 'avg' | 'moc' | 'pf' | 'as';

// ==================
// PROPS
// ==================

const props = defineProps<{
  username?: string;
  user?: User | null;
  roster?: UserRosterMap;
  onOpenAuth?: () => void;
}>();

// ==================
// COMPOSABLES
// ==================

const {
  profile,
  publicProfile,
  publicRoster,
  isLoading,
  isSaving,
  error,
  hasProfile,
  ownUsername,
  rosterStats,
  distribution,
  rosterMap,
  ownedCharacters,
  avatarCharacter,
  fetchOwnProfile,
  fetchPublicProfile,
  createProfile,
  updateProfileSection,
  updateAvatar,
  checkUsernameAvailable,
  setRosterPublic,
} = useProfile();

const { isProfileSetupPage, navigateToProfile } = useRouteState();

// ==================
// EDITING STATE
// ==================

type EditingSection = 'header' | 'contact' | 'privacy' | null;
const editingSection = ref<EditingSection>(null);

const editDisplayName = ref('');
const editBio = ref('');
const editGameUid = ref('');
const editDiscordHandle = ref('');
const editShowUid = ref(false);
const editShowDiscord = ref(false);
const editIsPublic = ref(false);
const editShowInvestment = ref<'all' | 'showcase' | 'none'>('all');

const showShowcaseSelector = ref(false);
const showAvatarSelector = ref(false);

const setupUsername = ref('');
const setupDisplayName = ref('');
const setupBio = ref('');
const usernameError = ref<string | null>(null);
const isCheckingUsername = ref(false);
const isUsernameAvailable = ref<boolean | null>(null);

// Tier display mode
const tierSortMode = ref<TierSortMode>('moc');

// ==================
// COMPUTED
// ==================

const isLoggedIn = computed(() => !!props.user);

const isViewingOwnProfile = computed(() => {
  if (!profile.value?.username || !props.username) return false;
  return profile.value.username.toLowerCase() === props.username.toLowerCase();
});

const displayedProfile = computed(() => {
  if (isProfileSetupPage.value) return null;
  if (isViewingOwnProfile.value && profile.value) return profile.value;
  return publicProfile.value;
});

const displayName = computed(() => {
  return displayedProfile.value?.display_name || displayedProfile.value?.username || props.username || '';
});

const joinDate = computed(() => {
  if (!displayedProfile.value?.created_at) return null;
  const date = new Date(displayedProfile.value.created_at);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
});

const showcaseCharacters = computed((): Character[] => {
  if (!displayedProfile.value?.showcase_characters?.length) return [];
  return displayedProfile.value.showcase_characters
    .map(id => characters.find(c => c.id === id))
    .filter((c): c is Character => c !== undefined);
});

const shouldShowShowcase = computed(() => showcaseCharacters.value.length > 0);

const shouldShowInvestment = computed(() => {
  if (isViewingOwnProfile.value) return true;
  return displayedProfile.value?.show_investment !== 'none';
});

const canShowCharacterInvestment = (charId: string): boolean => {
  if (isViewingOwnProfile.value) return true;
  if (!displayedProfile.value) return false;
  if (displayedProfile.value.show_investment === 'all') return true;
  if (displayedProfile.value.show_investment === 'showcase') {
    return displayedProfile.value.showcase_characters?.includes(charId) || false;
  }
  return false;
};

const getCharacterInvestment = (charId: string): UserCharacterInvestment | undefined => {
  return rosterMap.value.get(charId);
};

const getSignatureSuperimposition = (charId: string): 1 | 2 | 3 | 4 | 5 | undefined => {
  const investment = getCharacterInvestment(charId);
  if (!investment) return undefined;
  const char = characters.find(c => c.id === charId);
  if (!char?.investment?.lightCones) return undefined;
  const sigLC = char.investment.lightCones.find(lc => lc.isSignature);
  if (!sigLC || investment.lightConeId !== sigLC.id) return undefined;
  const superimposition = investment.lightConeSuperimposition;
  if (superimposition && superimposition >= 1 && superimposition <= 5) {
    return superimposition as 1 | 2 | 3 | 4 | 5;
  }
  return undefined;
};

const getLightConeName = (charId: string): string | null => {
  const investment = getCharacterInvestment(charId);
  if (!investment?.lightConeId || investment.lightConeId === 'generic') return null;
  const char = characters.find(c => c.id === charId);
  if (!char?.investment?.lightCones) return null;
  const lc = char.investment.lightCones.find(l => l.id === investment.lightConeId);
  return lc?.name || null;
};

const getLightConeRarity = (charId: string): 3 | 4 | 5 | null => {
  const investment = getCharacterInvestment(charId);
  if (!investment?.lightConeId || investment.lightConeId === 'generic') return null;
  const char = characters.find(c => c.id === charId);
  if (!char?.investment?.lightCones) return null;
  const lc = char.investment.lightCones.find(l => l.id === investment.lightConeId);
  return lc?.rarity || null;
};

const getAdjustedTier = (charId: string): TierRating | undefined => {
  const char = characters.find(c => c.id === charId);
  if (!char) return undefined;
  const investment = getCharacterInvestment(charId);

  if (!investment || !canShowCharacterInvestment(charId)) {
    if (tierSortMode.value === 'avg') {
      const mocTier = getBestTierForMode(charId, 'moc');
      const pfTier = getBestTierForMode(charId, 'pf');
      const asTier = getBestTierForMode(charId, 'as');
      const tierToNum: Record<TierRating, number> = {
        'T-1': -1, 'T-0.5': -0.5, 'T0': 0, 'T0.5': 0.5, 'T1': 1, 'T1.5': 1.5, 'T2': 2, 'T3': 3, 'T4': 4, 'T5': 5
      };
      const avgNum = (tierToNum[mocTier] + tierToNum[pfTier] + tierToNum[asTier]) / 3;
      if (avgNum <= -0.75) return 'T-1';
      if (avgNum <= -0.25) return 'T-0.5';
      if (avgNum <= 0.25) return 'T0';
      if (avgNum <= 0.75) return 'T0.5';
      if (avgNum <= 1.25) return 'T1';
      if (avgNum <= 1.75) return 'T1.5';
      if (avgNum <= 2.5) return 'T2';
      if (avgNum <= 3.5) return 'T3';
      if (avgNum <= 4.5) return 'T4';
      return 'T5';
    }
    return getBestTierForMode(charId, tierSortMode.value);
  }

  if (tierSortMode.value === 'avg') {
    const mocScore = getEffectiveScore(char, 'moc', investment);
    const pfScore = getEffectiveScore(char, 'pf', investment);
    const asScore = getEffectiveScore(char, 'as', investment);
    return scoreToTier((mocScore + pfScore + asScore) / 3);
  }
  return scoreToTier(getEffectiveScore(char, tierSortMode.value, investment));
};

const favoritedTeams = computed(() => {
  if (!publicRoster.value?.favorited_teams?.length) return [];
  return publicRoster.value.favorited_teams
    .slice(0, 6)
    .map(teamCharIds => ({
      characters: teamCharIds
        .map(id => characters.find(c => c.id === id))
        .filter((c): c is Character => c !== undefined),
    }))
    .filter(team => team.characters.length === 4);
});

const elementDistribution = computed(() => {
  if (!distribution.value?.elements) return [];
  const elementOrder = ['Physical', 'Fire', 'Ice', 'Lightning', 'Wind', 'Quantum', 'Imaginary'];
  const maxCount = Math.max(...Object.values(distribution.value.elements), 1);
  return elementOrder.map(element => ({
    name: element,
    count: distribution.value!.elements[element] || 0,
    percent: ((distribution.value!.elements[element] || 0) / maxCount) * 100,
  }));
});

const pathDistribution = computed(() => {
  if (!distribution.value?.paths) return [];
  const pathOrder = ['Destruction', 'Hunt', 'Erudition', 'Harmony', 'Nihility', 'Preservation', 'Abundance', 'Remembrance'];
  const maxCount = Math.max(...Object.values(distribution.value.paths), 1);
  return pathOrder.map(path => ({
    name: path,
    count: distribution.value!.paths[path] || 0,
    percent: ((distribution.value!.paths[path] || 0) / maxCount) * 100,
  }));
});

// Sorted roster by investment-adjusted tier
const sortedRoster = computed(() => {
  if (!ownedCharacters.value.length) return [];

  // Tier priority (lower = better)
  const tierPriority: Record<TierRating, number> = {
    'T-1': 0, 'T-0.5': 1, 'T0': 2, 'T0.5': 3, 'T1': 4, 'T1.5': 5, 'T2': 6, 'T3': 7, 'T4': 8, 'T5': 9
  };

  return [...ownedCharacters.value].sort((a, b) => {
    const tierA = getAdjustedTier(a.id) || 'T5';
    const tierB = getAdjustedTier(b.id) || 'T5';
    const priorityDiff = tierPriority[tierA] - tierPriority[tierB];
    if (priorityDiff !== 0) return priorityDiff;
    // Secondary sort by name
    return a.name.localeCompare(b.name);
  });
});

// ==================
// METHODS
// ==================

let usernameCheckTimeout: ReturnType<typeof setTimeout> | null = null;

const handleUsernameInput = () => {
  const username = setupUsername.value.toLowerCase().trim();
  usernameError.value = null;
  isUsernameAvailable.value = null;
  if (usernameCheckTimeout) clearTimeout(usernameCheckTimeout);

  if (username.length < 3) {
    if (username.length > 0) usernameError.value = 'Username must be at least 3 characters';
    return;
  }
  if (username.length > 20) {
    usernameError.value = 'Username must be 20 characters or less';
    return;
  }
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(username)) {
    usernameError.value = 'Username must start with a letter/number and only contain letters, numbers, underscores, and hyphens';
    return;
  }

  isCheckingUsername.value = true;
  usernameCheckTimeout = setTimeout(async () => {
    const available = await checkUsernameAvailable(username);
    isCheckingUsername.value = false;
    isUsernameAvailable.value = available;
    if (!available) usernameError.value = 'Username is already taken';
  }, 500);
};

const handleCreateProfile = async () => {
  if (!props.user || !isUsernameAvailable.value) return;
  const result = await createProfile(
    props.user.id,
    setupUsername.value.toLowerCase().trim(),
    setupDisplayName.value.trim() || undefined,
    setupBio.value.trim() || undefined
  );
  if (result.error) {
    usernameError.value = result.error;
  } else if (result.username) {
    navigateToProfile(result.username);
  }
};

const startEditing = (section: EditingSection) => {
  if (!profile.value) return;
  editingSection.value = section;
  if (section === 'header') {
    editDisplayName.value = profile.value.display_name || '';
    editBio.value = profile.value.bio || '';
  } else if (section === 'contact') {
    editGameUid.value = profile.value.game_uid || '';
    editDiscordHandle.value = profile.value.discord_handle || '';
    editShowUid.value = profile.value.show_uid;
    editShowDiscord.value = profile.value.show_discord;
  } else if (section === 'privacy') {
    editIsPublic.value = profile.value.is_public;
    editShowInvestment.value = profile.value.show_investment;
  }
};

const cancelEditing = () => { editingSection.value = null; };

const saveHeaderSection = async () => {
  if (!props.user) return;
  const result = await updateProfileSection(props.user.id, {
    display_name: editDisplayName.value.trim() || null,
    bio: editBio.value.trim() || null,
  });
  if (!result.error) editingSection.value = null;
};

const saveContactSection = async () => {
  if (!props.user) return;
  const result = await updateProfileSection(props.user.id, {
    game_uid: editGameUid.value.trim() || null,
    discord_handle: editDiscordHandle.value.trim() || null,
    show_uid: editShowUid.value,
    show_discord: editShowDiscord.value,
  });
  if (!result.error) editingSection.value = null;
};

const savePrivacySection = async () => {
  if (!props.user) return;
  const result = await updateProfileSection(props.user.id, {
    is_public: editIsPublic.value,
    show_investment: editShowInvestment.value,
  });
  if (!result.error) {
    await setRosterPublic(props.user.id, editIsPublic.value);
    editingSection.value = null;
  }
};

const openShowcaseSelector = () => { showShowcaseSelector.value = true; };

const handleShowcaseSave = async (showcaseIds: string[]) => {
  if (!props.user) return;
  await updateProfileSection(props.user.id, { showcase_characters: showcaseIds });
};

const openAvatarSelector = () => { showAvatarSelector.value = true; };

const handleAvatarSave = async (characterId: string | null) => {
  if (!props.user) return;
  await updateAvatar(props.user.id, characterId);
  showAvatarSelector.value = false;
};

const getElementColor = (element: string): string => {
  const colors: Record<string, string> = {
    Physical: '#9ca3af', Fire: '#ef4444', Ice: '#38bdf8', Lightning: '#a78bfa',
    Wind: '#34d399', Quantum: '#6366f1', Imaginary: '#fbbf24',
  };
  return colors[element] || '#9ca3af';
};

const getPathColor = (path: string): string => {
  const colors: Record<string, string> = {
    Destruction: '#ef4444', Hunt: '#38bdf8', Erudition: '#fbbf24', Harmony: '#f97316',
    Nihility: '#a78bfa', Preservation: '#60a5fa', Abundance: '#34d399', Remembrance: '#c084fc',
  };
  return colors[path] || '#9ca3af';
};

// ==================
// LIFECYCLE
// ==================

onMounted(async () => {
  if (props.user) await fetchOwnProfile(props.user.id);
  if (props.username) await fetchPublicProfile(props.username);
});

watch(() => props.username, async (newUsername) => {
  if (newUsername) await fetchPublicProfile(newUsername);
});

watch(() => props.user, async (newUser) => {
  if (newUser) await fetchOwnProfile(newUser.id);
});
</script>

<template>
  <div class="profile-page">
    <!-- ===================== SETUP WIZARD ===================== -->
    <div v-if="isProfileSetupPage" class="setup-container">
      <!-- Not logged in -->
      <div v-if="!isLoggedIn" class="setup-card">
        <div class="setup-glow"></div>
        <div class="setup-icon">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path fill-rule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clip-rule="evenodd" />
          </svg>
        </div>
        <h2 class="setup-title">Create Your Profile</h2>
        <p class="setup-subtitle">Sign in to share your HSR collection with others</p>
        <button class="btn-primary" @click="onOpenAuth?.()">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2a.75.75 0 00-.75-.75h-5.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z" clip-rule="evenodd" /><path fill-rule="evenodd" d="M6 10a.75.75 0 01.75-.75h9.546l-1.048-.943a.75.75 0 111.004-1.114l2.5 2.25a.75.75 0 010 1.114l-2.5 2.25a.75.75 0 11-1.004-1.114l1.048-.943H6.75A.75.75 0 016 10z" clip-rule="evenodd" /></svg>
          Sign In
        </button>
      </div>

      <!-- Setup Form -->
      <div v-else-if="!hasProfile" class="setup-card setup-form-card">
        <div class="setup-glow"></div>
        <div class="setup-icon">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path fill-rule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clip-rule="evenodd" />
          </svg>
        </div>
        <h2 class="setup-title">Create Your Profile</h2>
        <p class="setup-subtitle">Choose a username to get started</p>

        <div class="form-fields">
          <div class="form-group">
            <label>Username <span class="required">*</span></label>
            <div class="input-with-prefix">
              <span class="prefix">starguide.app/u/</span>
              <input v-model="setupUsername" type="text" placeholder="username" :class="{ error: usernameError, success: isUsernameAvailable }" @input="handleUsernameInput" />
              <span v-if="isCheckingUsername" class="status checking"><svg class="spin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="60" /></svg></span>
              <span v-else-if="isUsernameAvailable" class="status success"><svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" /></svg></span>
              <span v-else-if="usernameError" class="status error"><svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg></span>
            </div>
            <p v-if="usernameError" class="field-error">{{ usernameError }}</p>
          </div>

          <div class="form-group">
            <label>Display Name <span class="optional">(optional)</span></label>
            <input v-model="setupDisplayName" type="text" placeholder="Your display name" maxlength="50" />
          </div>

          <div class="form-group">
            <label>Bio <span class="optional">(optional)</span></label>
            <textarea v-model="setupBio" placeholder="Tell others about yourself..." maxlength="140" rows="2"></textarea>
            <span class="char-count">{{ setupBio.length }}/140</span>
          </div>
        </div>

        <button class="btn-primary" :disabled="!isUsernameAvailable || isSaving" @click="handleCreateProfile">
          {{ isSaving ? 'Creating...' : 'Create Profile' }}
        </button>
      </div>

      <!-- Already has profile -->
      <div v-else class="setup-card">
        <div class="setup-glow"></div>
        <p class="setup-subtitle">You already have a profile!</p>
        <button class="btn-primary" @click="navigateToProfile(ownUsername!)">Go to My Profile</button>
      </div>
    </div>

    <!-- ===================== PROFILE VIEW ===================== -->
    <template v-else>
      <!-- Loading -->
      <div v-if="isLoading" class="loading-container">
        <div class="loader"></div>
        <span>Loading profile...</span>
      </div>

      <!-- Error -->
      <div v-else-if="error && !displayedProfile" class="error-container">
        <div class="error-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
        </div>
        <h2>Profile Not Found</h2>
        <p>This profile doesn't exist or is set to private.</p>
      </div>

      <!-- Profile Content -->
      <div v-else-if="displayedProfile" class="profile-container">

        <!-- ========== HERO HEADER ========== -->
        <header class="hero-header">
          <div class="hero-bg">
            <div class="hero-gradient"></div>
            <div class="hero-stars"></div>
            <div class="hero-glow"></div>
          </div>

          <div class="hero-content">
            <!-- Avatar -->
            <div class="hero-avatar" :class="{ editable: isViewingOwnProfile }" @click="isViewingOwnProfile ? openAvatarSelector() : null">
              <div class="avatar-ring"></div>
              <div class="avatar-inner">
                <img v-if="avatarCharacter" :src="`/icons/${avatarCharacter.id}.webp`" :alt="avatarCharacter.name" class="avatar-portrait" />
                <svg v-else viewBox="0 0 24 24" fill="currentColor">
                  <path fill-rule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clip-rule="evenodd" />
                </svg>
              </div>
              <div v-if="isViewingOwnProfile" class="avatar-edit-indicator">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21.731 2.269a2.625 2.625 0 00-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 000-3.712zM19.513 8.199l-3.712-3.712-8.4 8.4a5.25 5.25 0 00-1.32 2.214l-.8 2.685a.75.75 0 00.933.933l2.685-.8a5.25 5.25 0 002.214-1.32l8.4-8.4z" />
                  <path d="M5.25 5.25a3 3 0 00-3 3v10.5a3 3 0 003 3h10.5a3 3 0 003-3V13.5a.75.75 0 00-1.5 0v5.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5V8.25a1.5 1.5 0 011.5-1.5h5.25a.75.75 0 000-1.5H5.25z" />
                </svg>
              </div>
            </div>

            <!-- User Info -->
            <div class="hero-info">
              <div class="hero-name-row">
                <h1 class="hero-name">{{ displayName }}</h1>
                <button v-if="isViewingOwnProfile && editingSection !== 'header'" class="edit-icon-btn" @click="startEditing('header')">
                  <svg viewBox="0 0 20 20" fill="currentColor"><path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" /></svg>
                </button>
              </div>
              <p class="hero-username">@{{ displayedProfile.username }}</p>
              <p v-if="displayedProfile.bio" class="hero-bio">{{ displayedProfile.bio }}</p>

              <div class="hero-meta">
                <span v-if="joinDate" class="meta-badge">
                  <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2z" clip-rule="evenodd" /></svg>
                  {{ joinDate }}
                </span>
                <span v-if="displayedProfile.game_uid" class="meta-badge uid">
                  <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.28 7.78l3.22-3.22v2.69a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.69l-3.22 3.22a.75.75 0 001.06 1.06z" /></svg>
                  UID: {{ displayedProfile.game_uid }}
                </span>
                <span v-if="displayedProfile.discord_handle" class="meta-badge discord">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.373-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" /></svg>
                  {{ displayedProfile.discord_handle }}
                </span>
              </div>
            </div>
          </div>

        </header>

        <!-- Edit Profile Modal -->
        <Teleport to="body">
          <div v-if="editingSection === 'header'" class="modal-overlay" @click.self="cancelEditing">
            <div class="modal-content">
              <div class="modal-header">
                <h2>Edit Profile</h2>
                <button class="modal-close" @click="cancelEditing">
                  <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
                </button>
              </div>
              <div class="modal-body">
                <div class="form-group">
                  <label>Display Name</label>
                  <input v-model="editDisplayName" type="text" placeholder="Your display name" maxlength="50" />
                </div>
                <div class="form-group">
                  <label>Bio</label>
                  <textarea v-model="editBio" placeholder="Tell others about yourself..." maxlength="140" rows="3"></textarea>
                  <span class="char-count">{{ editBio.length }}/140</span>
                </div>
              </div>
              <div class="modal-footer">
                <button class="btn-ghost" @click="cancelEditing" :disabled="isSaving">Cancel</button>
                <button class="btn-primary btn-sm" @click="saveHeaderSection" :disabled="isSaving">{{ isSaving ? 'Saving...' : 'Save Changes' }}</button>
              </div>
            </div>
          </div>
        </Teleport>

        <!-- ========== QUICK STATS BAR ========== -->
        <section v-if="rosterStats" class="stats-bar">
          <div class="stat-pill">
            <span class="stat-value">{{ rosterStats.totalOwned }}</span>
            <span class="stat-label">Characters</span>
          </div>
          <div class="stat-pill gold">
            <span class="stat-value">{{ rosterStats.fiveStarCount }}</span>
            <span class="stat-label">5-Star</span>
          </div>
          <div class="stat-pill purple">
            <span class="stat-value">{{ rosterStats.fourStarCount }}</span>
            <span class="stat-label">4-Star</span>
          </div>
          <div v-if="shouldShowInvestment" class="stat-pill orange">
            <span class="stat-value">{{ rosterStats.e1PlusCount }}</span>
            <span class="stat-label">E1+</span>
          </div>
          <div v-if="shouldShowInvestment" class="stat-pill cyan">
            <span class="stat-value">{{ rosterStats.signatureLCCount }}</span>
            <span class="stat-label">Sig LC</span>
          </div>
        </section>

        <!-- ========== TIER MODE SELECTOR ========== -->
        <section class="mode-selector-bar">
          <span class="mode-label">Tier Mode</span>
          <div class="mode-buttons">
            <button v-for="mode in [{ key: 'avg', label: 'AVG' }, { key: 'moc', label: 'MoC' }, { key: 'pf', label: 'PF' }, { key: 'as', label: 'AS' }] as const" :key="mode.key" class="mode-btn" :class="{ active: tierSortMode === mode.key }" @click="tierSortMode = mode.key">
              {{ mode.label }}
            </button>
          </div>
        </section>

        <!-- ========== SHOWCASE ========== -->
        <section v-if="shouldShowShowcase || isViewingOwnProfile" class="section showcase-section">
          <div class="section-header">
            <h2 class="section-title">
              <span class="title-icon">✦</span>
              Showcase
            </h2>
            <button v-if="isViewingOwnProfile" class="btn-ghost btn-sm" @click="openShowcaseSelector">Edit</button>
          </div>

          <div v-if="shouldShowShowcase" class="showcase-grid">
            <div v-for="char in showcaseCharacters" :key="char.id" class="showcase-card" :style="{ '--element-color': getElementColor(char.element) }">
              <div class="showcase-card-glow"></div>
              <div class="showcase-portrait">
                <CharacterCard :character="char" size="lg" :show-name="false" :show-tier="true" :eidolon="canShowCharacterInvestment(char.id) ? getCharacterInvestment(char.id)?.eidolonLevel : undefined" :signature-superimposition="canShowCharacterInvestment(char.id) ? getSignatureSuperimposition(char.id) : undefined" :override-tier="getAdjustedTier(char.id)" />
              </div>
              <div class="showcase-details">
                <h3 class="showcase-name">{{ char.name }}</h3>
                <div v-if="canShowCharacterInvestment(char.id)" class="showcase-investment">
                  <span class="inv-badge eidolon">E{{ getCharacterInvestment(char.id)?.eidolonLevel || 0 }}</span>
                  <span v-if="getLightConeName(char.id)" class="inv-lc" :class="{ 'rarity-5': getLightConeRarity(char.id) === 5, 'rarity-4': getLightConeRarity(char.id) === 4 }">
                    {{ getLightConeName(char.id) }}
                    <span class="lc-super">S{{ getCharacterInvestment(char.id)?.lightConeSuperimposition || 1 }}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
          <p v-else class="empty-state">No showcase characters. Click Edit to highlight your favorites.</p>
        </section>

        <!-- ========== DISTRIBUTION ========== -->
        <section v-if="distribution" class="section distribution-section">
          <h2 class="section-title"><span class="title-icon">◇</span> Collection</h2>
          <div class="distribution-grid">
            <div class="dist-card">
              <h3>Elements</h3>
              <div class="dist-bars">
                <div v-for="item in elementDistribution" :key="item.name" class="dist-row">
                  <span class="dist-label">{{ item.name }}</span>
                  <div class="dist-bar-track">
                    <div class="dist-bar-fill" :style="{ width: item.percent + '%', background: getElementColor(item.name), boxShadow: '0 0 12px ' + getElementColor(item.name) + '60' }"></div>
                  </div>
                  <span class="dist-value">{{ item.count }}</span>
                </div>
              </div>
            </div>
            <div class="dist-card">
              <h3>Paths</h3>
              <div class="dist-bars">
                <div v-for="item in pathDistribution" :key="item.name" class="dist-row">
                  <span class="dist-label">{{ item.name }}</span>
                  <div class="dist-bar-track">
                    <div class="dist-bar-fill" :style="{ width: item.percent + '%', background: getPathColor(item.name), boxShadow: '0 0 12px ' + getPathColor(item.name) + '60' }"></div>
                  </div>
                  <span class="dist-value">{{ item.count }}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- ========== FAVORITE TEAMS ========== -->
        <section v-if="favoritedTeams.length > 0" class="section teams-section">
          <h2 class="section-title"><span class="title-icon">♥</span> Favorite Teams</h2>
          <div class="teams-grid">
            <div v-for="(team, idx) in favoritedTeams" :key="idx" class="team-card">
              <div class="team-chars">
                <CharacterCard v-for="c in team.characters" :key="c.id" :character="c" size="sm" />
              </div>
            </div>
          </div>
        </section>

        <!-- ========== FULL ROSTER ========== -->
        <section v-if="sortedRoster.length > 0" class="section roster-section">
          <h2 class="section-title"><span class="title-icon">◆</span> Full Roster <span class="roster-count">({{ sortedRoster.length }})</span></h2>
          <div class="roster-grid">
            <CharacterCard v-for="char in sortedRoster" :key="char.id" :character="char" size="sm" :show-name="true" :show-tier="true" :eidolon="canShowCharacterInvestment(char.id) ? getCharacterInvestment(char.id)?.eidolonLevel : undefined" :signature-superimposition="canShowCharacterInvestment(char.id) ? getSignatureSuperimposition(char.id) : undefined" :override-tier="getAdjustedTier(char.id)" />
          </div>
        </section>

        <!-- ========== SETTINGS (OWN PROFILE ONLY) ========== -->
        <section v-if="isViewingOwnProfile" class="section settings-section">
          <h2 class="section-title"><span class="title-icon">⚙</span> Settings</h2>
          <div class="settings-grid">
            <!-- Game Info -->
            <div class="settings-card">
              <div class="settings-card-header">
                <h3>Game Info</h3>
                <button v-if="editingSection !== 'contact'" class="btn-ghost btn-sm" @click="startEditing('contact')">Edit</button>
              </div>
              <div v-if="editingSection !== 'contact'" class="settings-rows">
                <div class="setting-row"><span class="setting-label">UID</span><span class="setting-value">{{ profile?.game_uid || '—' }}</span><span class="setting-badge" :class="profile?.show_uid ? 'public' : 'private'">{{ profile?.show_uid ? 'Public' : 'Hidden' }}</span></div>
                <div class="setting-row"><span class="setting-label">Discord</span><span class="setting-value">{{ profile?.discord_handle || '—' }}</span><span class="setting-badge" :class="profile?.show_discord ? 'public' : 'private'">{{ profile?.show_discord ? 'Public' : 'Hidden' }}</span></div>
              </div>
              <div v-else class="edit-panel compact">
                <div class="edit-panel-actions top">
                  <button class="btn-ghost btn-sm" @click="cancelEditing" :disabled="isSaving">Cancel</button>
                  <button class="btn-primary btn-sm" @click="saveContactSection" :disabled="isSaving">{{ isSaving ? 'Saving...' : 'Save' }}</button>
                </div>
                <div class="form-row"><div class="form-group"><label>Game UID</label><input v-model="editGameUid" type="text" maxlength="20" /></div><label class="toggle"><input type="checkbox" v-model="editShowUid" /><span class="toggle-track"></span><span>Public</span></label></div>
                <div class="form-row"><div class="form-group"><label>Discord</label><input v-model="editDiscordHandle" type="text" maxlength="40" /></div><label class="toggle"><input type="checkbox" v-model="editShowDiscord" /><span class="toggle-track"></span><span>Public</span></label></div>
              </div>
            </div>

            <!-- Privacy -->
            <div class="settings-card">
              <div class="settings-card-header">
                <h3>Privacy</h3>
                <button v-if="editingSection !== 'privacy'" class="btn-ghost btn-sm" @click="startEditing('privacy')">Edit</button>
              </div>
              <div v-if="editingSection !== 'privacy'" class="settings-rows">
                <div class="setting-row"><span class="setting-label">Profile</span><span class="setting-badge lg" :class="profile?.is_public ? 'public' : 'private'">{{ profile?.is_public ? 'Public' : 'Private' }}</span></div>
                <div class="setting-row"><span class="setting-label">Investment</span><span class="setting-value">{{ profile?.show_investment === 'all' ? 'Everyone' : profile?.show_investment === 'showcase' ? 'Showcase only' : 'Hidden' }}</span></div>
              </div>
              <div v-else class="edit-panel compact">
                <div class="edit-panel-actions top">
                  <button class="btn-ghost btn-sm" @click="cancelEditing" :disabled="isSaving">Cancel</button>
                  <button class="btn-primary btn-sm" @click="savePrivacySection" :disabled="isSaving">{{ isSaving ? 'Saving...' : 'Save' }}</button>
                </div>
                <label class="toggle full"><input type="checkbox" v-model="editIsPublic" /><span class="toggle-track"></span><span>Make profile public</span></label>
                <div class="form-group"><label>Show investment</label><select v-model="editShowInvestment"><option value="all">Everyone</option><option value="showcase">Showcase only</option><option value="none">Hidden</option></select></div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </template>

    <!-- Showcase Selector Modal -->
    <ShowcaseSelector v-if="user && roster" :is-open="showShowcaseSelector" :roster="roster" :initial-showcase="[...(profile?.showcase_characters || [])]" @close="showShowcaseSelector = false" @save="handleShowcaseSave" />

    <!-- Avatar Selector Modal -->
    <AvatarSelector v-if="user && roster" :is-open="showAvatarSelector" :roster="roster" :current-avatar-id="profile?.avatar_character_id || null" @close="showAvatarSelector = false" @save="handleAvatarSave" />
  </div>
</template>

<style scoped>
/* =========================================
   COSMIC OBSERVATORY PROFILE THEME
   ========================================= */

.profile-page {
  min-height: 100vh;
  padding-bottom: 4rem;
}

/* ========== SETUP WIZARD ========== */
.setup-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 80vh;
  padding: 2rem;
}

.setup-card {
  position: relative;
  max-width: 420px;
  width: 100%;
  padding: 3rem 2.5rem;
  background: rgba(15, 15, 25, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 1.5rem;
  text-align: center;
  overflow: hidden;
}

.setup-form-card {
  max-width: 480px;
  text-align: left;
}

.setup-glow {
  position: absolute;
  top: -50%;
  left: 50%;
  transform: translateX(-50%);
  width: 300px;
  height: 300px;
  background: radial-gradient(circle, rgba(249, 147, 7, 0.15) 0%, transparent 70%);
  pointer-events: none;
}

.setup-icon {
  width: 72px;
  height: 72px;
  margin: 0 auto 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(249, 147, 7, 0.2) 0%, rgba(249, 147, 7, 0.05) 100%);
  border: 2px solid rgba(249, 147, 7, 0.4);
  border-radius: 1.25rem;
}

.setup-icon svg {
  width: 40px;
  height: 40px;
  color: #f99307;
}

.setup-title {
  font-family: var(--font-display, 'Orbitron', sans-serif);
  font-size: 1.5rem;
  font-weight: 700;
  color: white;
  margin: 0 0 0.5rem;
}

.setup-subtitle {
  color: rgba(255, 255, 255, 0.5);
  margin: 0 0 2rem;
}

.setup-form-card .setup-icon { margin-bottom: 1rem; }
.setup-form-card .setup-title { text-align: center; }
.setup-form-card .setup-subtitle { text-align: center; margin-bottom: 1.5rem; }

/* ========== BUTTONS ========== */
.btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.875rem 1.5rem;
  background: linear-gradient(135deg, #f99307 0%, #e67e00 100%);
  border: none;
  border-radius: 0.75rem;
  color: white;
  font-family: inherit;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(249, 147, 7, 0.35); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary svg { width: 18px; height: 18px; }
.btn-primary.btn-sm { padding: 0.5rem 1rem; font-size: 0.8125rem; width: auto; }

.btn-ghost {
  padding: 0.5rem 0.875rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  color: rgba(255, 255, 255, 0.7);
  font-family: inherit;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-ghost:hover:not(:disabled) { background: rgba(255, 255, 255, 0.1); color: white; }
.btn-ghost.btn-sm { padding: 0.375rem 0.75rem; font-size: 0.75rem; }

.edit-icon-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: all 0.2s;
}
.edit-icon-btn:hover { background: rgba(255, 255, 255, 0.1); color: white; }
.edit-icon-btn svg { width: 16px; height: 16px; }

/* ========== FORMS ========== */
.form-fields { margin-bottom: 1.5rem; }
.form-group { margin-bottom: 1rem; position: relative; }
.form-group label { display: block; font-size: 0.8125rem; font-weight: 500; color: rgba(255, 255, 255, 0.7); margin-bottom: 0.375rem; }
.required { color: #ef4444; }
.optional { color: rgba(255, 255, 255, 0.4); font-weight: 400; }

.form-group input,
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  color: white;
  font-family: inherit;
  font-size: 0.9375rem;
  transition: all 0.2s;
}
.form-group input::placeholder, .form-group textarea::placeholder { color: rgba(255, 255, 255, 0.3); }
.form-group input:focus, .form-group textarea:focus, .form-group select:focus { outline: none; border-color: rgba(249, 147, 7, 0.5); box-shadow: 0 0 0 3px rgba(249, 147, 7, 0.1); }
.form-group input.error { border-color: #ef4444; }
.form-group input.success { border-color: #22c55e; }
.form-group select option { background: #1a1a2e; }

.input-with-prefix {
  position: relative;
  display: flex;
  align-items: center;
}
.input-with-prefix .prefix {
  position: absolute;
  left: 1rem;
  color: rgba(255, 255, 255, 0.3);
  font-size: 0.8125rem;
  pointer-events: none;
}
.input-with-prefix input { padding-left: 140px; }
.input-with-prefix .status {
  position: absolute;
  right: 0.75rem;
  display: flex;
}
.input-with-prefix .status svg { width: 18px; height: 18px; }
.input-with-prefix .status.checking svg { color: rgba(255, 255, 255, 0.4); animation: spin 1s linear infinite; }
.input-with-prefix .status.success svg { color: #22c55e; }
.input-with-prefix .status.error svg { color: #ef4444; }

.char-count { position: absolute; bottom: 0.5rem; right: 0.75rem; font-size: 0.6875rem; color: rgba(255, 255, 255, 0.3); }
.field-error { color: #ef4444; font-size: 0.75rem; margin-top: 0.25rem; }

.form-row {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 0.75rem;
}
.form-row .form-group { flex: 1; margin-bottom: 0; }

.toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
  padding-top: 1.5rem;
}
.toggle.full { padding-top: 0; margin-bottom: 1rem; }
.toggle input { display: none; }
.toggle-track {
  width: 36px;
  height: 20px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  position: relative;
  transition: all 0.2s;
  flex-shrink: 0;
}
.toggle-track::after {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  background: white;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: all 0.2s;
}
.toggle input:checked + .toggle-track { background: #f99307; }
.toggle input:checked + .toggle-track::after { transform: translateX(16px); }

@keyframes spin { to { transform: rotate(360deg); } }

/* ========== LOADING & ERROR ========== */
.loading-container, .error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  gap: 1rem;
  color: rgba(255, 255, 255, 0.5);
}
.loader {
  width: 48px;
  height: 48px;
  border: 3px solid rgba(249, 147, 7, 0.2);
  border-top-color: #f99307;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
.error-icon { width: 64px; height: 64px; color: rgba(255, 255, 255, 0.2); }
.error-icon svg { width: 100%; height: 100%; }
.error-container h2 { font-family: var(--font-display, 'Orbitron', sans-serif); color: white; margin: 0; }
.error-container p { margin: 0; }

/* ========== PROFILE CONTAINER ========== */
.profile-container {
  max-width: 1000px;
  margin: 0 auto;
}

/* ========== HERO HEADER ========== */
.hero-header {
  position: relative;
  padding: 3rem 2rem 2rem;
  margin-bottom: 1rem;
  border-radius: 1.5rem;
  overflow: hidden;
}

.hero-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
}
.hero-gradient {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(168, 85, 247, 0.1) 50%, rgba(249, 147, 7, 0.1) 100%);
}
.hero-stars {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(2px 2px at 20px 30px, rgba(255,255,255,0.3), transparent),
                    radial-gradient(2px 2px at 40px 70px, rgba(255,255,255,0.2), transparent),
                    radial-gradient(1px 1px at 90px 40px, rgba(255,255,255,0.4), transparent),
                    radial-gradient(2px 2px at 130px 80px, rgba(255,255,255,0.2), transparent),
                    radial-gradient(1px 1px at 160px 20px, rgba(255,255,255,0.3), transparent);
  background-size: 200px 100px;
  opacity: 0.5;
}
.hero-glow {
  position: absolute;
  top: -100px;
  left: 50%;
  transform: translateX(-50%);
  width: 400px;
  height: 400px;
  background: radial-gradient(circle, rgba(249, 147, 7, 0.2) 0%, transparent 60%);
  pointer-events: none;
}

.hero-content {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.hero-avatar {
  position: relative;
  width: 100px;
  height: 100px;
  flex-shrink: 0;
}
.hero-avatar.editable {
  cursor: pointer;
}
.hero-avatar.editable:hover .avatar-ring {
  animation-duration: 4s;
}
.hero-avatar.editable:hover .avatar-edit-indicator {
  opacity: 1;
}
.avatar-ring {
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  background: conic-gradient(from 0deg, #f99307, #a855f7, #6366f1, #f99307);
  animation: avatarSpin 8s linear infinite;
}
.avatar-inner {
  position: absolute;
  inset: 3px;
  background: linear-gradient(135deg, #1a1a2e 0%, #0f0f1a 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.avatar-inner svg { width: 48px; height: 48px; color: rgba(255, 255, 255, 0.6); }
.avatar-portrait {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.avatar-edit-indicator {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, #a855f7 0%, #6366f1 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(168, 85, 247, 0.5);
  opacity: 0.8;
  transition: opacity 0.2s ease;
}
.avatar-edit-indicator svg {
  width: 16px;
  height: 16px;
  color: white;
}

@keyframes avatarSpin { to { transform: rotate(360deg); } }

.hero-info { flex: 1; min-width: 0; }
.hero-name-row { display: flex; align-items: center; gap: 0.75rem; }
.hero-name {
  font-family: var(--font-display, 'Orbitron', sans-serif);
  font-size: 1.75rem;
  font-weight: 700;
  color: white;
  margin: 0;
  text-shadow: 0 2px 20px rgba(249, 147, 7, 0.3);
}
.hero-username { font-size: 0.9375rem; color: rgba(255, 255, 255, 0.4); margin: 0.25rem 0 0; }
.hero-bio { color: rgba(255, 255, 255, 0.7); margin: 0.75rem 0; line-height: 1.5; }

.hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1rem;
}
.meta-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 2rem;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
}
.meta-badge svg { width: 14px; height: 14px; }
.meta-badge.uid { border-color: rgba(249, 147, 7, 0.3); color: #f99307; }
.meta-badge.discord { border-color: rgba(88, 101, 242, 0.3); color: #5865f2; }

.hero-edit-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  background: rgba(10, 10, 20, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  border-radius: 1.5rem;
}

/* ========== STATS BAR ========== */
.stats-bar {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding: 1rem;
  margin-bottom: 0.5rem;
}
.stat-pill {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.75rem 1.25rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 1rem;
  min-width: 80px;
}
.stat-pill .stat-value {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 1.5rem;
  font-weight: 700;
  color: white;
}
.stat-pill .stat-label { font-size: 0.6875rem; color: rgba(255, 255, 255, 0.4); text-transform: uppercase; letter-spacing: 0.05em; }
.stat-pill.gold { border-color: rgba(255, 185, 15, 0.3); }
.stat-pill.gold .stat-value { color: #ffb90f; }
.stat-pill.purple { border-color: rgba(168, 85, 247, 0.3); }
.stat-pill.purple .stat-value { color: #a855f7; }
.stat-pill.orange { border-color: rgba(249, 147, 7, 0.3); }
.stat-pill.orange .stat-value { color: #f99307; }
.stat-pill.cyan { border-color: rgba(34, 211, 238, 0.3); }
.stat-pill.cyan .stat-value { color: #22d3ee; }

/* ========== MODE SELECTOR BAR ========== */
.mode-selector-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  margin-bottom: 1.5rem;
}
.mode-label { font-size: 0.75rem; color: rgba(255, 255, 255, 0.4); text-transform: uppercase; letter-spacing: 0.1em; }
.mode-buttons { display: flex; gap: 0.25rem; padding: 0.25rem; background: rgba(255, 255, 255, 0.05); border-radius: 0.5rem; }
.mode-btn {
  padding: 0.5rem 1rem;
  background: transparent;
  border: none;
  border-radius: 0.375rem;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: all 0.2s;
}
.mode-btn:hover { color: rgba(255, 255, 255, 0.8); }
.mode-btn.active { background: rgba(168, 85, 247, 0.2); color: #a855f7; }

/* ========== SECTIONS ========== */
.section {
  margin-bottom: 2rem;
  padding: 1.5rem;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 1rem;
}
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.25rem;
}
.section-header .section-title {
  margin: 0; /* No extra margin when inside header */
}
.section-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--font-display, 'Orbitron', sans-serif);
  font-size: 1rem;
  font-weight: 600;
  color: white;
  margin: 0 0 1.5rem; /* More spacing under standalone headers */
}
.title-icon { color: #f99307; font-size: 0.875rem; }
.roster-count { font-family: var(--font-body); font-weight: 400; color: rgba(255, 255, 255, 0.4); margin-left: 0.25rem; }

.empty-state { color: rgba(255, 255, 255, 0.4); font-size: 0.875rem; text-align: center; padding: 2rem 1rem; }

/* ========== SHOWCASE ========== */
.showcase-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}
.showcase-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.01) 100%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 1rem;
  overflow: hidden;
  transition: all 0.3s;
}
.showcase-card:hover { transform: translateY(-2px); border-color: var(--element-color, rgba(255,255,255,0.15)); }
.showcase-card-glow {
  position: absolute;
  top: 0;
  left: 0;
  width: 100px;
  height: 100px;
  background: radial-gradient(circle, var(--element-color, #f99307) 0%, transparent 70%);
  opacity: 0.1;
  pointer-events: none;
}
.showcase-portrait { flex-shrink: 0; }
.showcase-details { flex: 1; min-width: 0; }
.showcase-name {
  font-family: var(--font-display, 'Orbitron', sans-serif);
  font-size: 0.9375rem;
  font-weight: 600;
  color: white;
  margin: 0 0 0.5rem;
}
.showcase-investment { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
.inv-badge {
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 0.75rem;
  font-weight: 700;
}
.inv-badge.eidolon { background: rgba(249, 147, 7, 0.15); color: #f99307; border: 1px solid rgba(249, 147, 7, 0.3); }
.inv-lc {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
  display: flex;
  align-items: center;
  gap: 0.375rem;
}
.inv-lc.rarity-5 { color: #ffb90f; }
.inv-lc.rarity-4 { color: #a855f7; }
.lc-super {
  padding: 0.125rem 0.375rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 0.25rem;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-weight: 600;
}

/* ========== DISTRIBUTION ========== */
.distribution-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; }
.dist-card {
  padding: 1rem;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 0.75rem;
}
.dist-card h3 { font-size: 0.8125rem; font-weight: 600; color: rgba(255, 255, 255, 0.6); margin: 0 0 0.75rem; }
.dist-bars { display: flex; flex-direction: column; gap: 0.5rem; }
.dist-row { display: flex; align-items: center; gap: 0.75rem; }
.dist-label { width: 85px; font-size: 0.75rem; color: rgba(255, 255, 255, 0.5); flex-shrink: 0; }
.dist-bar-track { flex: 1; height: 8px; background: rgba(255, 255, 255, 0.05); border-radius: 4px; overflow: hidden; }
.dist-bar-fill { height: 100%; border-radius: 4px; transition: width 0.5s ease; }
.dist-value { width: 24px; font-family: var(--font-mono, 'JetBrains Mono', monospace); font-size: 0.6875rem; color: rgba(255, 255, 255, 0.4); text-align: right; }

/* ========== TEAMS ========== */
.teams-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.75rem; }
.team-card {
  padding: 0.75rem;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 0.75rem;
}
.team-chars { display: flex; justify-content: center; gap: 0.375rem; }

/* ========== ROSTER ========== */
.roster-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  gap: 0.75rem 0.5rem; /* More vertical spacing */
}

/* ========== EDIT PROFILE MODAL ========== */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal-content {
  width: 100%;
  max-width: 420px;
  background: linear-gradient(135deg, rgba(25, 25, 40, 0.98) 0%, rgba(15, 15, 25, 0.98) 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 1.25rem;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5), 0 0 100px rgba(249, 147, 7, 0.1);
  animation: slideUp 0.25s ease;
  overflow: hidden;
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.modal-header h2 {
  font-family: var(--font-display, 'Orbitron', sans-serif);
  font-size: 1.125rem;
  font-weight: 600;
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
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: all 0.2s;
}
.modal-close:hover { background: rgba(255, 255, 255, 0.1); color: white; }
.modal-close svg { width: 16px; height: 16px; }

.modal-body {
  padding: 1.5rem;
}

.modal-body .form-group {
  margin-bottom: 1.25rem;
}
.modal-body .form-group:last-child {
  margin-bottom: 0;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.2);
}

/* ========== SETTINGS ========== */
.settings-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; }
.settings-card {
  padding: 1rem;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 0.75rem;
}
.settings-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}
.settings-card-header h3 { font-size: 0.875rem; font-weight: 600; color: white; margin: 0; }
.settings-rows { display: flex; flex-direction: column; gap: 0.5rem; }
.setting-row { display: flex; align-items: center; gap: 0.75rem; }
.setting-label { font-size: 0.8125rem; color: rgba(255, 255, 255, 0.5); min-width: 70px; }
.setting-value { flex: 1; font-size: 0.8125rem; color: rgba(255, 255, 255, 0.8); }
.setting-badge {
  padding: 0.25rem 0.5rem;
  border-radius: 1rem;
  font-size: 0.6875rem;
  font-weight: 500;
}
.setting-badge.public { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
.setting-badge.private { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
.setting-badge.lg { padding: 0.375rem 0.75rem; font-size: 0.75rem; }

.edit-panel {
  width: 100%;
  max-width: 400px;
}
.edit-panel.compact { max-width: none; }
.edit-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}
.edit-panel-header h3 { font-size: 1rem; font-weight: 600; color: white; margin: 0; }
.edit-panel-actions { display: flex; gap: 0.5rem; }
.edit-panel-actions.top { margin-bottom: 1rem; justify-content: flex-end; }

/* ========== RESPONSIVE ========== */
@media (max-width: 640px) {
  .hero-header { padding: 2rem 1.25rem; }
  .hero-content { flex-direction: column; text-align: center; }
  .hero-avatar { width: 80px; height: 80px; }
  .hero-name { font-size: 1.375rem; }
  .hero-name-row { justify-content: center; }
  .hero-meta { justify-content: center; }

  .stats-bar { gap: 0.5rem; }
  .stat-pill { min-width: 70px; padding: 0.5rem 0.75rem; }
  .stat-pill .stat-value { font-size: 1.25rem; }

  .mode-selector-bar { flex-direction: column; gap: 0.5rem; }

  .section { padding: 1rem; margin-bottom: 1rem; }

  .showcase-grid { grid-template-columns: 1fr; }
  .showcase-card { padding: 0.75rem; }
  .showcase-name { font-size: 0.875rem; }

  .roster-grid { grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); }

  .input-with-prefix .prefix { display: none; }
  .input-with-prefix input { padding-left: 1rem; }

  .form-row { flex-direction: column; }
  .toggle { padding-top: 0; }
}
</style>

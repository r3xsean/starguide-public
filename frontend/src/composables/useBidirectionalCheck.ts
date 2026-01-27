import { ref } from 'vue';
import type { Character, TeammateRec } from '../types';
import { characters } from '../data';

// ==================
// TYPES
// ==================

export interface BidirectionalSuggestion {
  /** Character being edited (e.g., firefly) */
  sourceCharacterId: string;
  /** Character that was rated (e.g., cyrene) */
  targetCharacterId: string;
  /** What rating to add to target */
  suggestedRating: string;
  /** Pre-filled reason */
  suggestedReason: string;
  /** Which list to add to (e.g., 'dps') */
  targetRole: 'dps' | 'amplifiers' | 'sustains' | 'subDPS';
  /** Is this adding new or updating existing? */
  action: 'add' | 'update';
}

type TeammateRole = 'dps' | 'amplifiers' | 'sustains' | 'subDPS';

// ==================
// COMPOSABLE
// ==================

export function useBidirectionalCheck() {
  const pendingSuggestions = ref<BidirectionalSuggestion[]>([]);
  const showPrompt = ref(false);
  const currentSuggestion = ref<BidirectionalSuggestion | null>(null);

  /**
   * Check if adding/updating a teammate creates a bidirectional inconsistency
   * @param sourceId - The character being edited
   * @param targetId - The teammate being added/rated
   * @param rating - The rating given (S, A, B, C, D)
   * @param reason - The reason provided
   * @param sourceRole - What role the source plays for the target
   */
  function checkBidirectional(
    sourceId: string,
    targetId: string,
    rating: string,
    _reason: string,
    _sourceRole: TeammateRole
  ): BidirectionalSuggestion | null {
    // Get the target character
    const targetCharacter = characters.find(c => c.id === targetId);
    if (!targetCharacter) return null;

    // Check if target already rates source
    const targetTeammates = targetCharacter.baseTeammates;
    if (!targetTeammates) {
      // Target has no teammate ratings, suggest adding
      return {
        sourceCharacterId: sourceId,
        targetCharacterId: targetId,
        suggestedRating: rating,
        suggestedReason: `Synergy with ${getCharacterName(sourceId)}`,
        targetRole: determineRoleForSource(sourceId),
        action: 'add',
      };
    }

    // Check all role lists for existing rating
    const roles: TeammateRole[] = ['dps', 'amplifiers', 'sustains', 'subDPS'];
    for (const role of roles) {
      const list = targetTeammates[role];
      if (list) {
        const existing = list.find(t => t.id === sourceId);
        if (existing) {
          // Already rated, no suggestion needed
          return null;
        }
      }
    }

    // Source not rated by target, create suggestion
    return {
      sourceCharacterId: sourceId,
      targetCharacterId: targetId,
      suggestedRating: rating,
      suggestedReason: `Synergy with ${getCharacterName(sourceId)}`,
      targetRole: determineRoleForSource(sourceId),
      action: 'add',
    };
  }

  /**
   * Determine what role the source character plays (for adding to target's list)
   */
  function determineRoleForSource(sourceId: string): TeammateRole {
    const char = characters.find(c => c.id === sourceId);
    if (!char) return 'dps';

    // Use primary role
    if (char.roles.includes('DPS')) return 'dps';
    if (char.roles.includes('Amplifier')) return 'amplifiers';
    if (char.roles.includes('Sustain')) return 'sustains';
    if (char.roles.includes('Support DPS')) return 'subDPS';
    return 'dps';
  }

  /**
   * Get character display name from ID
   */
  function getCharacterName(id: string): string {
    return characters.find(c => c.id === id)?.name || id;
  }

  /**
   * Get character by ID
   */
  function getCharacter(id: string): Character | undefined {
    return characters.find(c => c.id === id);
  }

  /**
   * Add a suggestion to the pending list
   */
  function addSuggestion(suggestion: BidirectionalSuggestion) {
    // Avoid duplicates
    const exists = pendingSuggestions.value.some(
      s =>
        s.sourceCharacterId === suggestion.sourceCharacterId &&
        s.targetCharacterId === suggestion.targetCharacterId
    );
    if (!exists) {
      pendingSuggestions.value.push(suggestion);
    }
  }

  /**
   * Remove a suggestion from the pending list
   */
  function removeSuggestion(sourceId: string, targetId: string) {
    const index = pendingSuggestions.value.findIndex(
      s => s.sourceCharacterId === sourceId && s.targetCharacterId === targetId
    );
    if (index !== -1) {
      pendingSuggestions.value.splice(index, 1);
    }
  }

  /**
   * Process a teammate change and check for bidirectional needs
   */
  function onTeammateChanged(
    sourceId: string,
    teammate: TeammateRec,
    sourceRole: TeammateRole
  ) {
    const suggestion = checkBidirectional(
      sourceId,
      teammate.id,
      teammate.rating,
      teammate.reason,
      sourceRole
    );

    if (suggestion) {
      currentSuggestion.value = suggestion;
      showPrompt.value = true;
    }
  }

  /**
   * Accept a suggestion with optional custom reason
   */
  function acceptSuggestion(
    suggestion: BidirectionalSuggestion,
    customReason?: string
  ) {
    if (customReason) {
      suggestion.suggestedReason = customReason;
    }
    addSuggestion(suggestion);
    showPrompt.value = false;
    currentSuggestion.value = null;
  }

  /**
   * Skip the current suggestion without adding
   */
  function skipSuggestion() {
    showPrompt.value = false;
    currentSuggestion.value = null;
  }

  /**
   * Clear all pending suggestions
   */
  function clearSuggestions() {
    pendingSuggestions.value = [];
  }

  /**
   * Get a formatted label for a role
   */
  function getRoleLabel(role: TeammateRole): string {
    const labels: Record<TeammateRole, string> = {
      dps: 'DPS',
      amplifiers: 'Amplifiers',
      sustains: 'Sustains',
      subDPS: 'Sub DPS',
    };
    return labels[role];
  }

  return {
    // State
    pendingSuggestions,
    showPrompt,
    currentSuggestion,

    // Methods
    checkBidirectional,
    onTeammateChanged,
    acceptSuggestion,
    skipSuggestion,
    clearSuggestions,
    addSuggestion,
    removeSuggestion,

    // Helpers
    getCharacterName,
    getCharacter,
    getRoleLabel,
    determineRoleForSource,
  };
}

<script setup lang="ts">
type OwnershipStatus = 'owned' | 'concept' | 'none';

defineProps<{
  status: OwnershipStatus;
  characterName: string;
}>();

const emit = defineEmits<{
  'update:status': [status: OwnershipStatus];
}>();

const segments: { value: OwnershipStatus; icon: string; label: string }[] = [
  { value: 'owned', icon: '✓', label: 'owned' },
  { value: 'concept', icon: '◌', label: 'planned' },
  { value: 'none', icon: '—', label: 'not owned' },
];
</script>

<template>
  <div
    role="radiogroup"
    :aria-label="`Ownership status for ${characterName}`"
    class="bg-void-800/50 rounded-lg border border-white/5 p-0.5 flex gap-0.5"
  >
    <button
      v-for="seg in segments"
      :key="seg.value"
      role="radio"
      :aria-checked="status === seg.value"
      :aria-label="`Set ${characterName} as ${seg.label}`"
      class="rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-200 cursor-pointer"
      :class="
        status === seg.value
          ? seg.value === 'owned'
            ? 'bg-stellar-500/20 text-stellar-400 border border-stellar-500/40'
            : seg.value === 'concept'
              ? 'bg-nebula-500/20 text-nebula-400 border border-nebula-500/40'
              : 'bg-white/5 text-white/40 border border-white/10'
          : 'text-white/20 hover:text-white/40 border border-transparent'
      "
      @click.stop="emit('update:status', seg.value)"
    >
      {{ seg.icon }}
    </button>
  </div>
</template>

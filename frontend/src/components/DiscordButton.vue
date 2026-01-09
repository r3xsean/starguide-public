<script setup lang="ts">
const discordLink = 'https://discord.gg/aQahKADvTn';

const openDiscord = () => {
  window.open(discordLink, '_blank', 'noopener,noreferrer');
};
</script>

<template>
  <button
    class="discord-button"
    @click="openDiscord"
    aria-label="Join our Discord server"
    title="Join Discord"
  >
    <div class="button-glow"></div>
    <div class="button-ring"></div>
    <div class="button-core">
      <!-- Discord SVG Icon -->
      <svg class="discord-icon" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
      </svg>
    </div>
  </button>
</template>

<style scoped>
.discord-button {
  position: fixed;
  bottom: 9.5rem;
  right: 1.1rem;
  z-index: 9998;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  background: transparent;
  padding: 0;
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  /* Prevent mobile issues */
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}

@media (min-width: 768px) {
  .discord-button {
    bottom: 6rem;
    right: 1.65rem;
  }
}

.discord-button:hover {
  transform: scale(1.1);
}

.discord-button:active {
  transform: scale(0.95);
}

.button-glow {
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(88, 101, 242, 0.4) 0%, transparent 70%);
  animation: pulseGlow 3s ease-in-out infinite;
  pointer-events: none;
}

@keyframes pulseGlow {
  0%, 100% {
    transform: scale(1);
    opacity: 0.5;
  }
  50% {
    transform: scale(1.2);
    opacity: 0.25;
  }
}

.button-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid rgba(88, 101, 242, 0.5);
  background: conic-gradient(
    from 0deg,
    rgba(88, 101, 242, 0.7) 0%,
    rgba(114, 137, 218, 0.5) 25%,
    rgba(88, 101, 242, 0.3) 50%,
    rgba(114, 137, 218, 0.5) 75%,
    rgba(88, 101, 242, 0.7) 100%
  );
  -webkit-mask: radial-gradient(transparent 58%, black 60%);
  mask: radial-gradient(transparent 58%, black 60%);
  animation: ringRotate 25s linear infinite;
}

@keyframes ringRotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.button-core {
  position: absolute;
  inset: 3px;
  border-radius: 50%;
  background: linear-gradient(135deg, #5865F2 0%, #4752C4 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    inset 0 2px 4px rgba(255, 255, 255, 0.2),
    0 4px 12px rgba(88, 101, 242, 0.4);
  transition: box-shadow 0.3s ease;
}

.discord-button:hover .button-core {
  box-shadow:
    inset 0 2px 4px rgba(255, 255, 255, 0.25),
    0 6px 20px rgba(88, 101, 242, 0.5);
}

.discord-icon {
  width: 20px;
  height: 20px;
  color: white;
  transition: transform 0.3s ease;
}

.discord-button:hover .discord-icon {
  transform: scale(1.1);
}
</style>

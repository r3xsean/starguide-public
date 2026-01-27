<script setup lang="ts">
import { onMounted, ref } from 'vue';

interface Star {
  id: number;
  x: number;
  y: number;
  size: number;
  twinkleDuration: number;
  twinkleDelay: number;
  opacity: number;
}

const stars = ref<Star[]>([]);

onMounted(() => {
  // Generate random stars
  const starCount = 100;
  const generatedStars: Star[] = [];

  for (let i = 0; i < starCount; i++) {
    generatedStars.push({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2 + 1,
      twinkleDuration: Math.random() * 4 + 2,
      twinkleDelay: Math.random() * 4,
      opacity: Math.random() * 0.5 + 0.3,
    });
  }

  stars.value = generatedStars;
});
</script>

<template>
  <div class="starfield">
    <!-- Static background nebulae -->
    <div
      class="absolute w-[600px] h-[600px] rounded-full opacity-20 blur-3xl"
      style="
        background: radial-gradient(circle, rgba(168, 85, 247, 0.3) 0%, transparent 70%);
        top: -200px;
        left: -200px;
      "
    ></div>
    <div
      class="absolute w-[500px] h-[500px] rounded-full opacity-15 blur-3xl"
      style="
        background: radial-gradient(circle, rgba(249, 147, 7, 0.25) 0%, transparent 70%);
        bottom: -150px;
        right: -150px;
      "
    ></div>
    <div
      class="absolute w-[400px] h-[400px] rounded-full opacity-10 blur-3xl"
      style="
        background: radial-gradient(circle, rgba(71, 199, 253, 0.2) 0%, transparent 70%);
        top: 40%;
        left: 60%;
      "
    ></div>

    <!-- Twinkling stars -->
    <div
      v-for="star in stars"
      :key="star.id"
      class="star"
      :style="{
        left: `${star.x}%`,
        top: `${star.y}%`,
        width: `${star.size}px`,
        height: `${star.size}px`,
        opacity: star.opacity,
        '--twinkle-duration': `${star.twinkleDuration}s`,
        '--twinkle-delay': `${star.twinkleDelay}s`,
      }"
    ></div>
  </div>
</template>

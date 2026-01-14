import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { h } from 'vue';

// Placeholder component - App.vue handles all rendering based on route state
const EmptyRoute = { render: () => h('div') };

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: EmptyRoute,
    meta: {
      title: 'StarGuide - HSR Team Builder | Honkai Star Rail Team Comps & Pull Advisor',
      description: 'Build optimal HSR teams with StarGuide. The best Honkai Star Rail team builder with personalized recommendations, character synergies, tier lists, and pull advice based on your roster.',
    }
  },
  {
    path: '/character/:id',
    name: 'character',
    component: EmptyRoute,
    props: true,
    meta: {
      // Dynamic meta handled in App.vue based on character data
      dynamicMeta: true
    }
  },
  {
    path: '/best-teams',
    name: 'best-teams',
    component: EmptyRoute,
    meta: {
      title: 'Best HSR Teams - StarGuide | Honkai Star Rail Team Builder',
      description: 'Find the best Honkai Star Rail team compositions from your owned characters. Optimized team recommendations for Memory of Chaos, Pure Fiction, and Apocalyptic Shadow.',
    }
  },
  {
    path: '/pull-advisor',
    name: 'pull-advisor',
    component: EmptyRoute,
    meta: {
      title: 'HSR Pull Advisor - StarGuide | Who to Pull Next in Honkai Star Rail',
      description: 'Get personalized pull recommendations based on your Honkai Star Rail roster. Find the best characters to pull that synergize with your existing teams.',
    }
  },
  {
    path: '/banner-advisor',
    name: 'banner-advisor',
    component: EmptyRoute,
    meta: {
      title: 'HSR Banner Advisor - StarGuide | Current & Upcoming Banners',
      description: 'Evaluate current and upcoming Honkai Star Rail banners based on your roster. See which banner characters would benefit your account the most.',
    }
  },
  // Catch-all redirect to home
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    // Restore scroll position on back/forward navigation
    if (savedPosition) {
      return savedPosition;
    }
    // Scroll to top on new navigation
    return { top: 0, behavior: 'smooth' };
  }
});

export default router;

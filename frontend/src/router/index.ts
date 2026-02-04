import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { h } from 'vue';
import { supabase } from '../lib/supabase';

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
  {
    path: '/profile/setup',
    name: 'profile-setup',
    component: EmptyRoute,
    meta: {
      title: 'Create Your Profile - StarGuide | Honkai Star Rail',
      description: 'Create your public StarGuide profile. Share your Honkai Star Rail collection, showcase your favorite characters, and connect with other players.',
    }
  },
  {
    path: '/u/:username',
    name: 'user-profile',
    component: EmptyRoute,
    props: true,
    meta: {
      dynamicMeta: true  // SEO handled in App.vue
    }
  },
  // Admin routes
  {
    path: '/admin',
    name: 'admin-dashboard',
    component: EmptyRoute,
    meta: { requiresContributor: true, title: 'Admin Dashboard' }
  },
  {
    path: '/admin/character/:id',
    name: 'admin-character',
    component: EmptyRoute,
    meta: { requiresContributor: true, title: 'Edit Character' }
  },
  {
    path: '/admin/users',
    name: 'admin-users',
    component: EmptyRoute,
    meta: { requiresAdmin: true, title: 'User Management' }
  },
  {
    path: '/admin/review',
    name: 'admin-review',
    component: EmptyRoute,
    meta: { requiresAdmin: true, title: 'Review Queue' }
  },
  {
    path: '/admin/review/:editId',
    name: 'admin-review-edit',
    component: EmptyRoute,
    meta: { requiresAdmin: true, title: 'Review Edit' }
  },
  {
    path: '/roster',
    name: 'roster',
    component: EmptyRoute,
    meta: {
      title: 'Manage Roster - StarGuide | Honkai Star Rail',
      description: 'Manage your Honkai Star Rail character roster. Track owned characters, plan future pulls, and organize your collection.',
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

// Route guard for admin routes
router.beforeEach(async (to, _from, next) => {
  const requiresAdmin = to.meta.requiresAdmin as boolean | undefined;
  const requiresContributor = to.meta.requiresContributor as boolean | undefined;

  // Skip check for non-admin routes
  if (!requiresAdmin && !requiresContributor) {
    return next();
  }

  // Check if user is authenticated
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return next('/');
  }

  // Fetch user role from database
  try {
    const { data: role, error } = await supabase.rpc('get_user_role', {
      user_id: user.id
    });

    if (error) {
      console.error('Error fetching user role:', error);
      return next('/');
    }

    // Check permissions
    if (requiresAdmin && role !== 'admin') {
      return next('/');
    }

    if (requiresContributor && role !== 'admin' && role !== 'contributor') {
      return next('/');
    }

    next();
  } catch (err) {
    console.error('Error in admin route guard:', err);
    return next('/');
  }
});

export default router;

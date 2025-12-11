/**
 * Vue Router Configuration
 * Routes for vibegames.it multi-game platform
 */

import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/LandingPage.vue'),
    meta: {
      title: 'VibeGames - Train AI to Beat Classic Games',
    },
  },
  {
    path: '/deep-q-learning',
    name: 'deep-q-learning',
    component: () => import('@/views/DeepQLearning.vue'),
    meta: {
      title: 'Deep Q-Learning - VibeGames',
    },
  },
  {
    path: '/leaderboards',
    name: 'leaderboards',
    component: () => import('@/views/Leaderboards.vue'),
    meta: {
      title: 'Leaderboards - VibeGames',
    },
  },
  {
    path: '/game/:gameId',
    name: 'game',
    component: () => import('@/views/GameView.vue'),
    props: true,
    meta: {
      title: 'Training',
    },
  },
  // Redirect old routes to new structure
  {
    path: '/flappy',
    redirect: '/game/flappy',
  },
  // Catch-all redirect to home
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// Update document title on navigation
router.beforeEach((to, _from, next) => {
  const gameId = to.params.gameId as string | undefined
  if (gameId) {
    document.title = `${gameId.charAt(0).toUpperCase() + gameId.slice(1)} - VibeGames`
  } else if (to.meta.title) {
    document.title = to.meta.title as string
  }
  next()
})

export default router

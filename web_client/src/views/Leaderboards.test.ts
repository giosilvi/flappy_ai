import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import Leaderboards from './Leaderboards.vue'
import { apiClient, type LeaderboardEntry } from '@/services/apiClient'
import { getAllGames, type GameInfo } from '@/games'
import { ObservationLabels } from '@/games/flappy/GameState'

// Mock delle dipendenze
vi.mock('@/services/apiClient', () => ({
  apiClient: {
    getLeaderboard: vi.fn(),
  },
}))

vi.mock('@/games', () => ({
  getAllGames: vi.fn(),
}))

vi.mock('vue-router', () => ({
  RouterLink: {
    name: 'RouterLink',
    template: '<a><slot /></a>',
    props: ['to'],
  },
}))

vi.mock('@/components/GradientDescentBackground.vue', () => ({
  default: {
    name: 'GradientDescentBackground',
    template: '<div class="gradient-bg"></div>',
    methods: {
      handleClick: vi.fn(),
    },
  },
}))

// Helper stub for RouterLink that shows slot content
const RouterLinkStub = {
  template: '<a><slot /></a>',
  props: ['to'],
}

describe('Leaderboards.vue', () => {
  let wrapper: VueWrapper<any>
  const mockGames: GameInfo[] = [
    {
      id: 'flappy',
      name: 'Flappy Bird',
      description: 'Navigate through pipes',
      inputDim: 6,
      outputDim: 2,
    },
    {
      id: 'test-game',
      name: 'Test Game',
      description: 'A test game',
      inputDim: 10,
      outputDim: 3,
    },
  ]

  const mockLeaderboardEntries: LeaderboardEntry[] = [
    {
      id: '1',
      name: 'Champion',
      score: 150.5,
      pipes: 15,
      params: 5000,
      architecture: '6→64→64→2',
      createdAt: '2024-01-01T00:00:00Z',
    },
    {
      id: '2',
      name: 'Runner Up',
      score: 120.0,
      pipes: 12,
      params: 8706,
      architecture: '6→64→64→2',
      createdAt: '2024-01-02T00:00:00Z',
    },
    {
      id: '3',
      name: 'Third Place',
      score: 100.0,
      pipes: 10,
      params: 12000,
      architecture: '6→128→64→2',
      createdAt: '2024-01-03T00:00:00Z',
    },
  ]

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()

    // Setup getAllGames mock
    vi.mocked(getAllGames).mockReturnValue(mockGames)

    // Setup apiClient.getLeaderboard mock
    vi.mocked(apiClient.getLeaderboard).mockResolvedValue({
      entries: mockLeaderboardEntries,
    })

    // Reset document styles (happy-dom provides document)
    document.documentElement.style.overflowY = ''
    document.body.style.overflowY = ''
  })

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount()
    }
  })

  describe('Rendering Base', () => {
    it('should mount the component correctly', () => {
      wrapper = mount(Leaderboards, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub,
            GradientDescentBackground: true,
          },
        },
      })

      expect(wrapper.exists()).toBe(true)
    })

    it('should display the title "Leaderboards"', () => {
      wrapper = mount(Leaderboards, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub,
            GradientDescentBackground: true,
          },
        },
      })

      const title = wrapper.find('h1.glow-text')
      expect(title.exists()).toBe(true)
      expect(title.text()).toBe('Leaderboards')
    })

    it('should display the back link', () => {
      wrapper = mount(Leaderboards, {
        global: {
          stubs: {
            RouterLink: {
              template: '<a><slot /></a>',
              props: ['to'],
            },
            GradientDescentBackground: true,
          },
        },
      })

      const backLink = wrapper.find('.back-link')
      expect(backLink.exists()).toBe(true)
      expect(backLink.text()).toContain('Back to VibeGames')
    })

    it('should display cards for each game', async () => {
      wrapper = mount(Leaderboards, {
        global: {
          stubs: {
            RouterLink: {
              template: '<a><slot /></a>',
              props: ['to'],
            },
            GradientDescentBackground: true,
          },
        },
      })

      await wrapper.vm.$nextTick()

      const cards = wrapper.findAll('.glass-card')
      expect(cards.length).toBe(mockGames.length)
    })

    it('should display game information in cards', async () => {
      wrapper = mount(Leaderboards, {
        global: {
          stubs: {
            RouterLink: {
              template: '<a><slot /></a>',
              props: ['to'],
            },
            GradientDescentBackground: true,
          },
        },
      })

      await wrapper.vm.$nextTick()

      const firstCard = wrapper.find('.glass-card')
      expect(firstCard.text()).toContain('flappy')
      expect(firstCard.text()).toContain('Flappy Bird')
      expect(firstCard.text()).toContain('Navigate through pipes')
    })
  })

  describe('Data Loading', () => {
    it('should call loadLeaderboards on mount', async () => {
      wrapper = mount(Leaderboards, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub,
            GradientDescentBackground: true,
          },
        },
      })

      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(apiClient.getLeaderboard).toHaveBeenCalled()
    })

    it('should make API calls for each game', async () => {
      wrapper = mount(Leaderboards, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub,
            GradientDescentBackground: true,
          },
        },
      })

      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(apiClient.getLeaderboard).toHaveBeenCalledTimes(mockGames.length)
      expect(apiClient.getLeaderboard).toHaveBeenCalledWith('flappy', 10)
      expect(apiClient.getLeaderboard).toHaveBeenCalledWith('test-game', 10)
    })

    it('should show loading state during data fetch', async () => {
      // Make API call slow
      vi.mocked(apiClient.getLeaderboard).mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({ entries: mockLeaderboardEntries })
            }, 100)
          })
      )

      wrapper = mount(Leaderboards, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub,
            GradientDescentBackground: true,
          },
        },
      })

      await wrapper.vm.$nextTick()

      // Check for loading state
      const loadingStates = wrapper.findAll('.loading-state')
      expect(loadingStates.length).toBeGreaterThan(0)
    })

    it('should display data after loading completes', async () => {
      wrapper = mount(Leaderboards, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub,
            GradientDescentBackground: true,
          },
        },
      })

      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 0))
      await wrapper.vm.$nextTick()

      // Check that loading states are gone
      const loadingStates = wrapper.findAll('.loading-state')
      expect(loadingStates.length).toBe(0)

      // Check that data is displayed
      const tables = wrapper.findAll('.mini-table')
      expect(tables.length).toBeGreaterThan(0)
    })
  })

  describe('Leaderboard Display', () => {
    it('should display champion row with crown', async () => {
      wrapper = mount(Leaderboards, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub,
            GradientDescentBackground: true,
          },
        },
      })

      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 0))
      await wrapper.vm.$nextTick()

      const championRow = wrapper.find('.champion-row')
      expect(championRow.exists()).toBe(true)

      const crown = championRow.find('.crown')
      expect(crown.exists()).toBe(true)
      expect(crown.text()).toBe('👑')

      expect(championRow.text()).toContain('Champion')
      expect(championRow.text()).toContain('Champion')
      expect(championRow.text()).toContain('150.5')
      expect(championRow.text()).toContain('15')
    })

    it('should display leaderboard table with correct data', async () => {
      wrapper = mount(Leaderboards, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub,
            GradientDescentBackground: true,
          },
        },
      })

      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 0))
      await wrapper.vm.$nextTick()

      const table = wrapper.find('.mini-table')
      expect(table.exists()).toBe(true)

      // Check table headers
      expect(table.text()).toContain('#')
      expect(table.text()).toContain('Name')
      expect(table.text()).toContain('Pipes')
      expect(table.text()).toContain('Score')
      expect(table.text()).toContain('Params')

      // Check table rows
      const rows = table.findAll('tbody tr')
      expect(rows.length).toBe(mockLeaderboardEntries.length)

      // Check first row data
      const firstRow = rows[0]
      expect(firstRow.text()).toContain('1')
      expect(firstRow.text()).toContain('Champion')
      expect(firstRow.text()).toContain('15')
      expect(firstRow.text()).toContain('150.5')
    })

    it('should display empty state when no entries', async () => {
      vi.mocked(apiClient.getLeaderboard).mockResolvedValue({
        entries: [],
      })

      wrapper = mount(Leaderboards, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub,
            GradientDescentBackground: true,
          },
        },
      })

      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 0))
      await wrapper.vm.$nextTick()

      const emptyState = wrapper.find('.empty-state')
      expect(emptyState.exists()).toBe(true)
      expect(emptyState.text()).toContain('No scores yet')
    })

    it('should format params correctly in table', async () => {
      wrapper = mount(Leaderboards, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub,
            GradientDescentBackground: true,
          },
        },
      })

      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 0))
      await wrapper.vm.$nextTick()

      const table = wrapper.find('.mini-table')
      // Check that params are formatted (5000 should show as "5.0K")
      expect(table.text()).toContain('5.0K')
      // 8706 should show as "8.7K"
      expect(table.text()).toContain('8.7K')
      // 12000 should show as "12.0K"
      expect(table.text()).toContain('12.0K')
    })
  })

  describe('Helper Methods', () => {
    beforeEach(() => {
      wrapper = mount(Leaderboards, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub,
            GradientDescentBackground: true,
          },
        },
      })
    })

    describe('formatParams', () => {
      it('should format normal params as string', () => {
        expect(wrapper.vm.formatParams(500)).toBe('500')
      })

      it('should format params >= 1000 with K suffix', () => {
        expect(wrapper.vm.formatParams(1000)).toBe('1.0K')
        expect(wrapper.vm.formatParams(1500)).toBe('1.5K')
        expect(wrapper.vm.formatParams(5000)).toBe('5.0K')
        expect(wrapper.vm.formatParams(12345)).toBe('12.3K')
      })

      it('should return em dash for undefined params', () => {
        expect(wrapper.vm.formatParams(undefined)).toBe('—')
      })

      it('should return em dash for null params', () => {
        expect(wrapper.vm.formatParams(null as any)).toBe('—')
      })
    })

    describe('maxInputs', () => {
      it('should return ObservationLabels.length for flappy', () => {
        expect(wrapper.vm.maxInputs('flappy')).toBe(ObservationLabels.length)
      })

      it('should return inputDim for other games', () => {
        expect(wrapper.vm.maxInputs('test-game')).toBe(10)
      })

      it('should return 0 for unknown games', () => {
        expect(wrapper.vm.maxInputs('unknown-game')).toBe(0)
      })
    })

    describe('handleHeroClick', () => {
      it('should call handleClick on GradientDescentBackground if available', async () => {
        const mockHandleClick = vi.fn()
        wrapper = mount(Leaderboards, {
          global: {
            stubs: {
              RouterLink: RouterLinkStub,
              GradientDescentBackground: {
                template: '<div></div>',
                methods: {
                  handleClick: mockHandleClick,
                },
              },
            },
          },
        })

        await wrapper.vm.$nextTick()

        // Set up the ref manually
        const gradientBg = {
          handleClick: mockHandleClick,
        }
        wrapper.vm.$refs.gradientBg = gradientBg

        wrapper.vm.handleHeroClick()

        expect(mockHandleClick).toHaveBeenCalled()
      })

      it('should not throw if GradientDescentBackground ref is not available', () => {
        wrapper.vm.$refs.gradientBg = null
        expect(() => wrapper.vm.handleHeroClick()).not.toThrow()
      })

      it('should not throw if handleClick method is not available', () => {
        wrapper.vm.$refs.gradientBg = {}
        expect(() => wrapper.vm.handleHeroClick()).not.toThrow()
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(apiClient.getLeaderboard).mockRejectedValue(new Error('API Error'))

      wrapper = mount(Leaderboards, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub,
            GradientDescentBackground: true,
          },
        },
      })

      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 0))
      await wrapper.vm.$nextTick()

      // Should log error
      expect(consoleErrorSpy).toHaveBeenCalled()

      // Should set loading to false
      const loadingStates = wrapper.findAll('.loading-state')
      expect(loadingStates.length).toBe(0)

      // Should show empty state
      const emptyStates = wrapper.findAll('.empty-state')
      expect(emptyStates.length).toBeGreaterThan(0)

      consoleErrorSpy.mockRestore()
    })

    it('should disable loading state even on error', async () => {
      vi.mocked(apiClient.getLeaderboard).mockRejectedValue(new Error('API Error'))

      wrapper = mount(Leaderboards, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub,
            GradientDescentBackground: true,
          },
        },
      })

      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 0))
      await wrapper.vm.$nextTick()

      // Check that leaderboards state has loading: false
      expect(wrapper.vm.leaderboards['flappy'].loading).toBe(false)
      expect(wrapper.vm.leaderboards['test-game'].loading).toBe(false)
    })
  })

  describe('Lifecycle Hooks', () => {
    it('should enable scroll on mount', () => {
      const html = document.documentElement
      const body = document.body

      html.style.overflowY = 'hidden'
      body.style.overflowY = 'hidden'

      wrapper = mount(Leaderboards, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub,
            GradientDescentBackground: true,
          },
        },
      })

      expect(html.style.overflowY).toBe('auto')
      expect(body.style.overflowY).toBe('auto')
    })

    it('should restore scroll settings on beforeUnmount', () => {
      const html = document.documentElement
      const body = document.body

      html.style.overflowY = 'hidden'
      body.style.overflowY = 'hidden'

      wrapper = mount(Leaderboards, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub,
            GradientDescentBackground: true,
          },
        },
      })

      // Verify scroll was enabled
      expect(html.style.overflowY).toBe('auto')
      expect(body.style.overflowY).toBe('auto')

      // Unmount component
      wrapper.unmount()

      // Verify scroll was restored
      expect(html.style.overflowY).toBe('hidden')
      expect(body.style.overflowY).toBe('hidden')
    })

    it('should preserve original overflow values', () => {
      const html = document.documentElement
      const body = document.body

      html.style.overflowY = 'scroll'
      body.style.overflowY = 'scroll'

      wrapper = mount(Leaderboards, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub,
            GradientDescentBackground: true,
          },
        },
      })

      // Verify scroll was enabled
      expect(html.style.overflowY).toBe('auto')
      expect(body.style.overflowY).toBe('auto')

      // Unmount component
      wrapper.unmount()

      // Verify original values were restored
      expect(html.style.overflowY).toBe('scroll')
      expect(body.style.overflowY).toBe('scroll')
    })
  })

  describe('Interactions', () => {
    it('should have correct Play & Train links', async () => {
      wrapper = mount(Leaderboards, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub,
            GradientDescentBackground: true,
          },
        },
      })

      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 0))
      await wrapper.vm.$nextTick()

      // Find all RouterLink components using the component definition
      // Since we're using a stub, we need to find them differently
      const allRouterLinks = wrapper.findAllComponents(RouterLinkStub)
      
      // We should have at least the game links (plus potentially the back link)
      expect(allRouterLinks.length).toBeGreaterThanOrEqual(mockGames.length)

      // Filter to only game links (those with /game/ in the 'to' prop)
      const gameLinks = allRouterLinks.filter((link) => {
        const to = link.props('to')
        return typeof to === 'string' && to.startsWith('/game/')
      })

      expect(gameLinks.length).toBe(mockGames.length)

      // Verify the links point to the correct games
      const linkTos = gameLinks.map((link) => link.props('to'))
      expect(linkTos).toContain('/game/flappy')
      expect(linkTos).toContain('/game/test-game')
    })

    it('should call handleHeroClick when hero content is clicked', async () => {
      const mockHandleClick = vi.fn()
      wrapper = mount(Leaderboards, {
        global: {
          stubs: {
            RouterLink: RouterLinkStub,
            GradientDescentBackground: {
              template: '<div></div>',
              methods: {
                handleClick: mockHandleClick,
              },
            },
          },
        },
      })

      await wrapper.vm.$nextTick()

      // Set up the ref
      const gradientBg = {
        handleClick: mockHandleClick,
      }
      wrapper.vm.$refs.gradientBg = gradientBg

      const heroContent = wrapper.find('.hero-content')
      await heroContent.trigger('click')

      expect(mockHandleClick).toHaveBeenCalled()
    })
  })
})

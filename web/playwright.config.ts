import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  outputDir: '../output/playwright/results',
  reporter: [['list'], ['html', { outputFolder: '../output/playwright/report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:8765',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'uv run mojiang-web --host 127.0.0.1 --port 8765',
    cwd: '..',
    url: 'http://127.0.0.1:8765/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      MOJIANG_MARKET_DB: '/tmp/mojiang-e2e-market.db',
      MOJIANG_PORTFOLIO_DB: '/tmp/mojiang-e2e-portfolio.db',
      MOJIANG_AGENT_DB: '/tmp/mojiang-e2e-agent.db',
      MOJIANG_REFERENCE_DB: '/tmp/mojiang-e2e-reference.db',
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})

import { chromium } from 'playwright';
import { spawn } from 'child_process';

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

async function takeScreenshot() {
  // Start dev server
  const server = spawn('npm', ['run', 'dev', '--', '--port', '3456'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true
  });

  // Wait for server to be ready
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server timeout')), 10000);
    server.stdout.on('data', (data) => {
      if (data.toString().includes('Local:')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    server.on('error', reject);
  });

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: OG_WIDTH, height: OG_HEIGHT },
    deviceScaleFactor: 2
  });

  await page.goto('http://localhost:3456');
  
  // Clear localStorage to use default values
  await page.evaluate(() => {
    localStorage.clear();
  });
  
  // Reload to apply defaults
  await page.reload();
  
  // Wait for Alpine to initialize
  await page.waitForTimeout(500);

  // Hide top bar and footer for cleaner screenshot, style main content
  await page.evaluate(() => {
    document.querySelector('.top-bar')?.remove();
    document.querySelector('.connection-footer')?.remove();
    document.body.style.paddingTop = '0';
    
    // Style the main view container for screenshot
    const container = document.querySelector('.view-container.knob-container');
    if (container) {
      container.style.display = 'flex';
      container.style.flexDirection = 'row';
      container.style.justifyContent = 'center';
      container.style.alignItems = 'center';
      container.style.minHeight = '100vh';
      container.style.maxWidth = '100%';
      container.style.padding = '2rem';
      container.style.gap = '2rem';
    }
    
    // Hide the track selector header
    document.querySelector('.app-header')?.remove();
  });

  await page.waitForTimeout(200);

  await page.screenshot({
    path: 'public/tx6-og-1200.jpg',
    type: 'jpeg',
    quality: 90
  });

  console.log('Screenshot saved to public/tx6-og-1200.jpg');

  await browser.close();
  server.kill();
}

takeScreenshot().catch((err) => {
  console.error(err);
  process.exit(1);
});

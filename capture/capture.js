#!/usr/bin/env node

const { chromium } = require('playwright');
const fs = require('fs-extra');
const yaml = require('js-yaml');
const path = require('path');
const { spawn } = require('child_process');
// Load classes with resilient constructor resolution and safe fallbacks
function pickCtor(mod, named) {
  if (!mod) return null;
  if (typeof mod === 'function') return mod;
  if (mod && typeof mod.default === 'function') return mod.default;
  if (named && typeof mod[named] === 'function') return mod[named];
  return null;
}
let VisualDetectorCtor;
let TemplateHeuristicsCtor;
try {
  const VisualDetectorModule = require('./visual-detector');
  VisualDetectorCtor = pickCtor(VisualDetectorModule, 'VisualDetector');
} catch (e) {
  VisualDetectorCtor = null;
}
try {
  const TemplateHeuristicsModule = require('./template-heuristics');
  TemplateHeuristicsCtor = pickCtor(TemplateHeuristicsModule, 'TemplateHeuristics');
} catch (e) {
  TemplateHeuristicsCtor = null;
}

if (!VisualDetectorCtor) {
  // Safe fallback that just waits a moment
  VisualDetectorCtor = class {
    constructor() { this.debugEnabled = process.env.CAPTURE_DEBUG === 'true'; }
    log(...args){ if (this.debugEnabled) console.log('🔍', ...args); }
    async detectReadiness(page, profile){
      const wait = (profile && profile.screenshot && profile.screenshot.after_detection) || 500;
      this.log(`Fallback detector: waiting ${wait}ms`);
      await page.waitForTimeout(wait);
    }
  };
}
if (!TemplateHeuristicsCtor) {
  TemplateHeuristicsCtor = class {
    getSampleData(){ return {}; }
    async generateProfile(_page, templateId){
      return { template: templateId, readiness_detection: { strategy: 'visual_stability', timeout: 3000 }, screenshot: { after_detection: 500 }, video: { duration: 0 } };
    }
  };
}

/**
 * Black-Box Template Capture System
 * Captures screenshots and videos of hdisplay templates without modifying any source code
 */
class BlackBoxCapture {
  constructor(options = {}) {
    this.serverUrl = options.serverUrl || 'http://localhost:3000';
    this.outputDir = options.outputDir || './captures';
    this.profiles = {};
  this.detector = new VisualDetectorCtor();
  this.heuristics = new TemplateHeuristicsCtor();
    this.debugEnabled = process.env.CAPTURE_DEBUG === 'true';

    this.loadProfiles();
  }

  log(...args) {
    console.log('📸', ...args);
  }

  debug(...args) {
    if (this.debugEnabled) console.log('🐛', ...args);
  }

  loadProfiles() {
    const profileDir = './capture-profiles';
    
    if (!fs.existsSync(profileDir)) {
      this.log('No capture-profiles directory found, using intelligent defaults');
      return;
    }

    const files = fs.readdirSync(profileDir);
    for (const file of files) {
      if (file.endsWith('.yaml') || file.endsWith('.yml')) {
        try {
          const content = fs.readFileSync(path.join(profileDir, file), 'utf8');
          const profile = yaml.load(content);
          this.profiles[profile.template] = profile;
          this.debug(`Loaded profile for ${profile.template}`);
        } catch (error) {
          console.warn(`⚠️  Failed to load profile ${file}:`, error.message);
        }
      }
    }

    this.log(`Loaded ${Object.keys(this.profiles).length} capture profiles`);
  }

  async getAvailableTemplates() {
    try {
      const response = await fetch(`${this.serverUrl}/api/templates`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      return data.templates || [];
    } catch (error) {
      throw new Error(`Failed to fetch templates: ${error.message}`);
    }
  }

  async captureTemplate(templateId, customData = null) {
    this.log(`Starting capture of template: ${templateId}`);

    // Get or generate profile
    let profile = this.profiles[templateId];
    if (!profile) {
      this.log(`No profile found for ${templateId}, generating intelligent defaults`);
    }

    // Prepare data: customData > profile.sample_data (or profile.data) > heuristics
    let data;
    if (customData) {
      data = customData;
      this.debug('Using customData for template:', templateId);
    } else if (profile && (profile.sample_data || profile.data)) {
      data = profile.sample_data || profile.data;
      this.debug('Using profile sample_data for template:', templateId);
    } else {
      data = this.heuristics.getSampleData(templateId);
      this.debug('Using heuristics sample data for template:', templateId);
    }
    this.debug('Template data payload:', JSON.stringify(data, null, 2));

    // Setup browser
    const browser = await chromium.launch({
      headless: !this.debugEnabled,
      args: ['--font-render-hinting=none']
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 400 },
      deviceScaleFactor: 2,
      recordVideo: {
        dir: path.join(this.outputDir, 'videos-raw'),
        size: { width: 1280, height: 400 }
      }
    });

  const page = await context.newPage();
  // Capture handle to the page video (if recording is enabled)
  const pageVideo = (typeof page.video === 'function') ? page.video() : null;

    try {
      // Navigate to hdisplay
      this.log('Loading hdisplay page...');
    await page.goto(this.serverUrl, { 
        waitUntil: 'networkidle',
        timeout: 10000 
      });

  // Apply template and wait until page reflects it (title update via socket event)
  this.log('Applying template...');
  await this.applyTemplateAndWait(page, templateId, data);

      // Generate profile if needed
      if (!profile) {
        profile = await this.heuristics.generateProfile(page, templateId);
      }

      // Wait for readiness
      this.log('Waiting for content readiness...');
      await this.detector.detectReadiness(page, profile);

      // Capture screenshot
      await this.captureScreenshot(page, templateId, profile);

      // Wait for video duration
      if (profile.video && profile.video.duration > 0) {
        this.log(`Recording video for ${profile.video.duration}ms...`);
        await page.waitForTimeout(profile.video.duration);
      }

      this.log(`✅ Successfully captured ${templateId}`);

    } catch (error) {
      this.log(`❌ Failed to capture ${templateId}: ${error.message}`);
      throw error;
    } finally {
      await page.close();
      await context.close();
      await browser.close();

      // Process video
      if (profile.video && profile.video.duration > 0) {
        await this.processVideo(templateId, pageVideo);
      }

      // Clear after capture so the next run starts from a blank state without recording the clear.
      try {
        await this.clearDisplay(null);
      } catch (e) {
        this.debug(`Post-capture clear failed: ${e.message}`);
      }
    }
  }

  async clearDisplay(page) {
    // Use the CLI codepath for 'clear' which is known-good
    this.log('Clearing display via CLI...');
    const cliPath = path.join(__dirname, '..', 'cli', 'index.js');
    await new Promise((resolve) => {
      const args = [cliPath, '--server', this.serverUrl, 'clear'];
      const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      child.stdout.on('data', (d) => { out += d.toString(); });
      child.stderr.on('data', (d) => { err += d.toString(); });
      child.on('close', (code) => {
        if (this.debugEnabled) {
          if (out.trim()) this.debug('[clear stdout]', out.trim());
          if (err.trim()) this.debug('[clear stderr]', err.trim());
        }
        if (code !== 0) this.debug(`CLI clear exited with code ${code}`);
        resolve();
      });
    });
    // Allow frontend crossfade cleanup (~520ms); add headroom. If no page provided, sleep.
    const waitMs = 1200;
    if (page && typeof page.isClosed === 'function' && !page.isClosed()) {
      await page.waitForTimeout(waitMs);
    } else {
      await new Promise((r) => setTimeout(r, waitMs));
    }
    this.debug('Display cleared');
  }

  async applyTemplateAndWait(page, templateId, data) {
    const maxAttempts = 3;
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await page.request.post(`${this.serverUrl}/api/template/${templateId}`, {
          data: { data }
        });
        if (!res.ok()) {
          const txt = await res.text();
          throw new Error(`HTTP ${res.status()} ${txt}`);
        }
        this.debug(`Applied template (attempt ${attempt}), waiting for page update...`);
        await page.waitForFunction(
          (id) => document.title === `hdisplay - ${id}`,
          templateId,
          { timeout: 4000 }
        );
        this.debug('Page reflected template');
        return;
      } catch (e) {
        lastError = e;
        this.log(`Apply attempt ${attempt} did not reflect on page yet: ${e.message}`);
        // Small backoff before retry
        await page.waitForTimeout(500);
      }
    }
    throw new Error(`Failed to apply template '${templateId}' after ${maxAttempts} attempts: ${lastError?.message || 'unknown error'}`);
  }

  async captureScreenshot(page, templateId, profile) {
    const delay = profile.screenshot?.after_detection || 500;
    
    if (delay > 0) {
      this.debug(`Waiting ${delay}ms before screenshot`);
      await page.waitForTimeout(delay);
    }

    await fs.ensureDir(path.join(this.outputDir, 'screenshots'));
    const screenshotPath = path.join(this.outputDir, 'screenshots', `${templateId}.png`);
    
    await page.screenshot({
      path: screenshotPath,
      type: 'png',
      fullPage: false
    });

    this.log(`📷 Screenshot saved: ${screenshotPath}`);
  }

  async processVideo(templateId, pageVideo) {
    const rawVideoDir = path.join(this.outputDir, 'videos-raw');
    const videoDir = path.join(this.outputDir, 'videos');
    
    await fs.ensureDir(videoDir);

    // Prefer the specific page video path when available
    let sourcePath = null;
    if (pageVideo && typeof pageVideo.path === 'function') {
      try {
        sourcePath = await pageVideo.path();
      } catch (e) {
        this.debug(`Could not resolve page video path: ${e.message}`);
      }
    }

    if (!sourcePath) {
      // Fallback: find a recorded .webm in the raw directory
      const files = (await fs.readdir(rawVideoDir)).filter(f => f.endsWith('.webm'));
      if (files.length > 0) {
        sourcePath = path.join(rawVideoDir, files[0]);
      }
    }

    if (sourcePath && await fs.pathExists(sourcePath)) {
      const webmPath = path.join(videoDir, `${templateId}.webm`);
      await fs.move(sourcePath, webmPath, { overwrite: true });
      this.log(`🎬 Video saved: ${webmPath}`);

      // Also produce an MP4 for wider compatibility (best-effort via ffmpeg)
      const mp4Path = path.join(videoDir, `${templateId}.mp4`);
      try {
        const ok = await this.convertWebmToMp4(webmPath, mp4Path);
        if (ok) {
          this.log(`📼 MP4 saved: ${mp4Path}`);
        } else {
          this.debug('FFmpeg conversion did not succeed; MP4 not generated.');
        }
      } catch (e) {
        this.debug(`FFmpeg conversion error: ${e.message}`);
      }
    } else {
      this.debug('No video file found to process.');
    }

    // Clean up raw videos directory
    await fs.emptyDir(rawVideoDir);
  }

  async convertWebmToMp4(webmPath, mp4Path) {
    return new Promise((resolve) => {
      // Avoid an initial white frame by input-seeking and dropping the first decoded frame.
      // ffmpeg -y -ss 0.1 -i input.webm -vf "select=not(eq(n\\,0)),setpts=N/FRAME_RATE/TB,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p" -c:v libx264 -preset veryfast -crf 23 -movflags +faststart -an output.mp4
      const args = [
        '-y',
        '-ss', '0.1',
        '-i', webmPath,
        '-vf', 'select=not(eq(n\\,0)),setpts=N/FRAME_RATE/TB,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '23',
        '-movflags', '+faststart',
        '-an',
        mp4Path,
      ];
      let stderr = '';
      let stdout = '';
      const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.on('data', d => { stdout += d.toString(); });
      child.stderr.on('data', d => { stderr += d.toString(); });
      child.on('error', (err) => {
        if (err.code === 'ENOENT') {
          this.debug('ffmpeg not found on PATH; skipping MP4 generation.');
        } else {
          this.debug(`ffmpeg spawn error: ${err.message}`);
        }
        resolve(false);
      });
      child.on('close', (code) => {
        if (this.debugEnabled) {
          if (stdout.trim()) this.debug('[ffmpeg stdout]', stdout.trim());
          if (stderr.trim()) this.debug('[ffmpeg stderr]', stderr.trim());
        }
        resolve(code === 0);
      });
    });
  }

  async captureAll() {
    this.log('Fetching available templates...');
    const templates = await this.getAvailableTemplates();
    
    this.log(`Found ${templates.length} templates to capture`);

    const results = {
      successful: [],
      failed: []
    };

    for (const template of templates) {
      try {
        await this.captureTemplate(template.id);
        results.successful.push(template.id);
      } catch (error) {
        console.error(`❌ Failed to capture ${template.id}:`, error.message);
        results.failed.push({ id: template.id, error: error.message });
      }
    }

    this.log(`\n📊 Capture Summary:`);
    this.log(`✅ Successful: ${results.successful.length}`);
    this.log(`❌ Failed: ${results.failed.length}`);

    if (results.failed.length > 0) {
      console.log('\nFailed templates:');
      results.failed.forEach(f => console.log(`  - ${f.id}: ${f.error}`));
    }

    return results;
  }

  async generateGallery() {
    const screenshotsDir = path.join(this.outputDir, 'screenshots');
    const videosDir = path.join(this.outputDir, 'videos');
    
    if (!fs.existsSync(screenshotsDir)) {
      throw new Error('No screenshots found. Run capture first.');
    }

    const screenshots = await fs.readdir(screenshotsDir);
    const videos = fs.existsSync(videosDir) ? await fs.readdir(videosDir) : [];

    const templateData = screenshots
      .filter(f => f.endsWith('.png'))
      .map(f => {
        const templateId = path.basename(f, '.png');
        const hasVideo = videos.includes(`${templateId}.webm`);
        return { templateId, hasVideo };
      });

    const html = this.generateGalleryHTML(templateData);
    const galleryPath = path.join(this.outputDir, 'gallery.html');
    
    await fs.writeFile(galleryPath, html);
    this.log(`📚 Gallery generated: ${galleryPath}`);
    
    return galleryPath;
  }

  generateGalleryHTML(templateData) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>hdisplay Template Gallery</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
            background: #f5f5f5;
        }
        .header {
            text-align: center;
            margin-bottom: 3rem;
        }
        .template-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 2rem;
        }
        .template-demo {
            background: white;
            border-radius: 8px;
            padding: 1.5rem;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .template-title {
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: 1rem;
            color: #333;
        }
        .screenshot {
            width: 100%;
            border: 1px solid #ddd;
            border-radius: 4px;
            margin-bottom: 1rem;
        }
        video {
            width: 100%;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
        .no-video {
            color: #666;
            font-style: italic;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>hdisplay Template Gallery</h1>
        <p>Automatically generated screenshots and videos of all available templates</p>
    </div>
    
    <div class="template-grid">
        ${templateData.map(template => `
        <div class="template-demo">
            <h2 class="template-title">${template.templateId}</h2>
            <img class="screenshot" src="screenshots/${template.templateId}.png" alt="${template.templateId} screenshot" />
            ${template.hasVideo 
                ? `<video controls muted>
                     <source src="videos/${template.templateId}.webm" type="video/webm">
                     Your browser does not support video.
                   </video>`
                : '<p class="no-video">No video available</p>'
            }
        </div>
        `).join('')}
    </div>
</body>
</html>`;
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    const capture = new BlackBoxCapture();

    switch (command) {
      case 'all':
        await capture.captureAll();
        break;
        
      case 'gallery':
        await capture.generateGallery();
        break;
        
      case 'template':
        const templateId = args[1];
        if (!templateId) {
          console.error('❌ Template ID required: node capture.js template <template-id>');
          process.exit(1);
        }
        await capture.captureTemplate(templateId);
        break;
        
      default:
        console.log(`
hdisplay Black-Box Template Capture System

Usage:
  node capture/capture.js all                    - Capture all templates
  node capture/capture.js template <template-id> - Capture specific template  
  node capture/capture.js gallery                - Generate HTML gallery

Environment variables:
  CAPTURE_DEBUG=true                             - Enable debug logging
        `);
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Capture failed:', error.message);
    if (process.env.CAPTURE_DEBUG === 'true') {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = BlackBoxCapture;

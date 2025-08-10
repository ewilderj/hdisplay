const sharp = require('sharp');

/**
 * Visual detection heuristics for determining when template content is ready for capture
 * Works without modifying templates - pure external observation
 */
class VisualDetector {
  constructor() {
    this.debugEnabled = process.env.CAPTURE_DEBUG === 'true';
    // Public registry of supported detection strategies (for introspection/tests)
    this.strategies = new Set([
      'animation',
      'pixel_coverage',
      'visual_stability',
      'text_content',
      'media_loading',
      'wait_ms',
    ]);
  }

  log(...args) {
    if (this.debugEnabled) console.log('🔍', ...args);
  }

  async detectReadiness(page, profile) {
    // Support two formats:
    // 1) YAML profiles: profile.readiness_detection = { strategy, ... }
    // 2) Heuristics fallback: profile.detection = [ { wait_ms }, { wait_for_text: {...} }, ... ]

    if (Array.isArray(profile?.detection) && profile.detection.length) {
      this.log(`Starting detection with ${profile.detection.length} step(s)`);
      for (const [i, step] of profile.detection.entries()) {
        this.log(`Step ${i + 1}/${profile.detection.length}`);
        await this.executeLegacyStep(page, step);
      }
      this.log('All detection steps completed');
      return;
    }

    const detection = profile.readiness_detection;
    if (!detection) {
      this.log('No detection configuration found, using default wait');
      await page.waitForTimeout(2000);
      return;
    }

    const strategy = detection.strategy;
    const timeout = detection.timeout || 5000;
    this.log(`Starting detection with strategy: ${strategy}, timeout: ${timeout}ms`);
    try {
      await this.executeStrategy(page, detection, timeout);
      this.log('Detection strategy completed successfully');
    } catch (error) {
      this.log('Detection strategy failed:', error.message);
      await page.waitForTimeout(1000);
    }
  }

  async executeLegacyStep(page, step) {
    if (step.wait_ms) {
      const ms = Number(step.wait_ms) || 200;
      this.log(`Legacy: wait_ms ${ms}`);
      await page.waitForTimeout(ms);
      return;
    }
    if (step.wait_for_animation) {
      const cfg = step.wait_for_animation || {};
      this.log('Legacy: wait_for_animation');
      await this.detectAnimation(page, cfg, cfg.timeout || 5000);
      return;
    }
    if (step.wait_for_coverage) {
      const cfg = step.wait_for_coverage || {};
      this.log('Legacy: wait_for_coverage');
      await this.detectPixelCoverage(page, cfg, cfg.timeout || 5000);
      return;
    }
    if (step.wait_for_stability) {
      const legacy = step.wait_for_stability || {};
      // Map legacy keys to new names
      const cfg = { ...legacy };
      if (cfg.threshold != null && cfg.stability_threshold == null) {
        // Legacy threshold was similarity (e.g., 0.95); convert to diff threshold
        cfg.stability_threshold = Math.max(0, Math.min(1, 1 - Number(cfg.threshold)));
      }
      if (cfg.stable_frames != null && cfg.interval != null && cfg.stable_duration == null) {
        cfg.stable_duration = Number(cfg.stable_frames) * Number(cfg.interval);
      }
      this.log('Legacy: wait_for_stability');
      await this.detectVisualStability(page, cfg, cfg.timeout || 5000);
      return;
    }
    if (step.wait_for_text) {
      const legacy = step.wait_for_text || {};
      const cfg = { ...legacy };
      if (cfg.min_chars != null && cfg.min_content_length == null) {
        cfg.min_content_length = Number(cfg.min_chars);
      }
      this.log('Legacy: wait_for_text');
      await this.detectTextContent(page, cfg, cfg.timeout || 3000);
      return;
    }
    if (step.wait_for_media) {
      const cfg = step.wait_for_media || {};
      this.log('Legacy: wait_for_media');
      await this.detectMediaLoaded(page, cfg, cfg.timeout || 10000);
      return;
    }
    this.log('Legacy: unknown step, skipping');
  }

  async executeStrategy(page, config, timeout) {
    const strategy = config.strategy;

    switch (strategy) {
      case 'animation':
        await this.detectAnimation(page, config, timeout);
        break;
      case 'pixel_coverage':
        await this.detectPixelCoverage(page, config, timeout);
        break;
      case 'visual_stability':
        await this.detectVisualStability(page, config, timeout);
        break;
      case 'text_content':
        await this.detectTextContent(page, config, timeout);
        break;
      case 'media_loading':
        await this.detectMediaLoaded(page, config, timeout);
        break;
      case 'wait_ms':
        const waitTime = config.wait_ms || 2000;
        this.log(`Simple wait for ${waitTime}ms`);
        await page.waitForTimeout(waitTime);
        break;
      default:
        this.log(`Unknown strategy: ${strategy}, falling back to simple wait`);
        await page.waitForTimeout(2000);
    }

    this.log(`Strategy ${strategy} completed`);
  }

  async detectAnimation(page, config, timeout = 5000) {
    const animationThreshold = config.animation_threshold || 0.05;
    const stableFrames = config.stable_frames || 3;

    this.log(
      `Detecting animation with threshold ${animationThreshold}, stable frames: ${stableFrames}`
    );

    const startTime = Date.now();
    let stableCount = 0;
    let lastScreenshot = null;

    while (Date.now() - startTime < timeout) {
      const screenshot = await page.screenshot({ type: 'png' });

      if (lastScreenshot) {
        const diff = await this.compareScreenshots(lastScreenshot, screenshot);

        if (diff > animationThreshold) {
          stableCount = 0;
          this.log(`Animation detected (diff: ${diff.toFixed(3)})`);
        } else {
          stableCount++;
          if (stableCount >= stableFrames) {
            this.log('Animation stabilized');
            return;
          }
        }
      }

      lastScreenshot = screenshot;
      await page.waitForTimeout(100);
    }

    this.log('Animation detection timed out');
  }

  async detectPixelCoverage(page, config, timeout = 5000) {
    const minCoverage = config.min_coverage || 0.1;
    const maxRetries = Math.floor(timeout / 500);

    this.log(`Detecting pixel coverage, min coverage: ${minCoverage}`);

    for (let retry = 0; retry < maxRetries; retry++) {
      const screenshot = await page.screenshot({ type: 'png' });
      const coverage = await this.calculateCoverage(screenshot);

      this.log(`Attempt ${retry + 1}: coverage ${coverage.toFixed(3)}`);

      if (coverage >= minCoverage) {
        this.log('Sufficient pixel coverage detected');
        return;
      }

      await page.waitForTimeout(500);
    }

    this.log('Pixel coverage detection timed out');
  }

  async calculateCoverage(screenshotBuffer) {
    try {
      const image = sharp(screenshotBuffer);
      const { width, height } = await image.metadata();
      const totalPixels = width * height;

      const { data } = await image.greyscale().raw().toBuffer({ resolveWithObject: true });

      let nonBlackPixels = 0;
      const threshold = 10;

      for (let i = 0; i < data.length; i++) {
        if (data[i] > threshold) {
          nonBlackPixels++;
        }
      }

      return nonBlackPixels / totalPixels;
    } catch (error) {
      this.log('Error calculating coverage:', error.message);
      return 0;
    }
  }

  async detectVisualStability(page, config, timeout = 5000) {
    const stabilityThreshold = config.stability_threshold || 0.01;
    const stableDuration = config.stable_duration || 1000;

    this.log(
      `Detecting visual stability, threshold: ${stabilityThreshold}, duration: ${stableDuration}ms`
    );

    let lastScreenshot = await page.screenshot({ type: 'png' });
    let stableStart = null;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      await page.waitForTimeout(200);

      const currentScreenshot = await page.screenshot({ type: 'png' });
      const diff = await this.compareScreenshots(lastScreenshot, currentScreenshot);

      if (diff <= stabilityThreshold) {
        if (!stableStart) {
          stableStart = Date.now();
          this.log('Visual stability detected, monitoring...');
        } else if (Date.now() - stableStart >= stableDuration) {
          this.log('Visual stability confirmed');
          return;
        }
      } else {
        stableStart = null;
        this.log(`Visual change detected (diff: ${diff.toFixed(3)})`);
      }

      lastScreenshot = currentScreenshot;
    }

    this.log('Visual stability detection timed out');
  }

  async compareScreenshots(buf1, buf2) {
    try {
      const img1 = sharp(buf1).greyscale().raw();
      const img2 = sharp(buf2).greyscale().raw();

      const [data1, data2] = await Promise.all([img1.toBuffer(), img2.toBuffer()]);

      if (data1.length !== data2.length) {
        return 1.0;
      }

      let totalDiff = 0;
      for (let i = 0; i < data1.length; i++) {
        totalDiff += Math.abs(data1[i] - data2[i]);
      }

      return totalDiff / (data1.length * 255);
    } catch (error) {
      this.log('Error comparing screenshots:', error.message);
      return 0;
    }
  }

  async detectTextContent(page, config, timeout = 3000) {
    const waitForText = config.wait_for_text !== false;
    const minContentLength = config.min_content_length || 1;

    if (!waitForText) {
      this.log('Text detection disabled, skipping');
      return;
    }

    this.log(`Detecting text content, min length: ${minContentLength}`);

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const textContent = await page.evaluate(() => {
          return document.body.innerText || '';
        });

        const contentLength = textContent.trim().length;
        this.log(`Text content length: ${contentLength}`);

        if (contentLength >= minContentLength) {
          this.log('Sufficient text content detected');
          return;
        }
      } catch (error) {
        this.log('Error checking text content:', error.message);
      }

      await page.waitForTimeout(200);
    }

    this.log('Text content detection timed out');
  }

  async detectMediaLoaded(page, config, timeout = 10000) {
    const waitForImages = config.wait_for_images !== false;
    const waitForVideos = config.wait_for_videos !== false;

    this.log(`Detecting media loading - images: ${waitForImages}, videos: ${waitForVideos}`);

    try {
      await page.waitForFunction(
        ({ waitForImages, waitForVideos }) => {
          const images = Array.from(document.images);
          const videos = Array.from(document.querySelectorAll('video'));

          let allLoaded = true;

          if (waitForImages && images.length > 0) {
            allLoaded = allLoaded && images.every((img) => img.complete && img.naturalWidth > 0);
          }

          if (waitForVideos && videos.length > 0) {
            allLoaded = allLoaded && videos.every((video) => video.readyState >= 3);
          }

          return allLoaded;
        },
        { waitForImages, waitForVideos },
        { timeout }
      );

      this.log('All media loaded successfully');
    } catch (error) {
      this.log('Media loading detection timed out or failed:', error.message);
    }
  }
}

module.exports = VisualDetector;

/**
 * Template heuristics for intelligent capture without explicit profiles
 * Analyzes template behavior patterns to determine optimal capture strategies
 */
class TemplateHeuristics {
  constructor() {
    this.debug = process.env.CAPTURE_DEBUG === 'true';
  }

  log(...args) {
    if (this.debug) console.log('🧠', ...args);
  }

  /**
   * Generate a capture profile based on template ID and patterns
   */
  async generateProfile(page, templateId) {
    this.log(`Generating profile for ${templateId}`);

    const profile = {
      template: templateId,
      detection: [],
      screenshot: { after_detection: 500 },
      video: { duration: 5000 },
    };

    // Always start with basic stabilization
    profile.detection.push({ wait_ms: 300 });

    // Detect by template name patterns
    if (templateId.includes('clock') || templateId.includes('time')) {
      profile.detection = [
        { wait_ms: 200 },
        { wait_for_text: { contains_digits: true, min_chars: 5 } },
      ];
      profile.screenshot.after_detection = 1100; // After clock tick
      profile.video.duration = 5000;
    } else if (
      templateId.includes('text') ||
      templateId.includes('marquee') ||
      templateId.includes('animated')
    ) {
      // Text animation detection
      profile.detection.push({
        wait_for_animation: { selector: '*', property: 'transform', stable_after: 200 },
      });
      profile.screenshot.after_detection = 1500; // Let text scroll into view
      profile.video.duration = 8000;
    } else if (templateId.includes('carousel') || templateId.includes('slide')) {
      // Image carousel detection
      profile.detection.push(
        { wait_for_media: { timeout: 8000 } },
        { wait_for_stability: { stable_frames: 3, interval: 300, threshold: 0.95 } }
      );
      profile.screenshot.after_detection = 1000;
      profile.video.duration = 12000; // Multiple transitions
    } else if (
      templateId.includes('webp') ||
      templateId.includes('video') ||
      templateId.includes('image')
    ) {
      // Media content
      profile.detection.push({ wait_for_media: { timeout: 10000 } });
      profile.screenshot.after_detection = 200;
      profile.video.duration = 6000;
    } else if (templateId.includes('snake') || templateId.includes('game')) {
      // Game content
      profile.detection.push(
        { wait_ms: 1000 }, // Let game initialize
        { wait_for_coverage: { min_pixels: 2000, region: [100, 50, 1180, 350] } }
      );
      profile.video.duration = 15000; // Show gameplay
    } else if (templateId.includes('banner') || templateId.includes('message')) {
      // Static message content
      profile.detection.push({ wait_for_text: { min_chars: 1 } });
      profile.screenshot.after_detection = 200;
      profile.video.duration = 3000;
    } else {
      // Default: wait for visual stability
      profile.detection.push({
        wait_for_stability: { stable_frames: 3, interval: 200, threshold: 0.95 },
      });
    }

    this.log(`Generated profile:`, JSON.stringify(profile, null, 2));
    return profile;
  }

  /**
   * Analyze page content to detect template patterns
   */
  async analyzePageContent(page) {
    const analysis = await page.evaluate(() => {
      const hasImages = document.querySelectorAll('img').length > 0;
      const hasVideo = document.querySelectorAll('video').length > 0;
      const hasCanvas = document.querySelectorAll('canvas').length > 0;
      const hasAnimations = Array.from(document.querySelectorAll('*')).some((el) => {
        const style = window.getComputedStyle(el);
        return style.animation && style.animation !== 'none';
      });
      const textLength = (document.body.textContent || '').length;
      const hasNumbers = /\d/.test(document.body.textContent || '');

      return {
        hasImages,
        hasVideo,
        hasCanvas,
        hasAnimations,
        textLength,
        hasNumbers,
      };
    });

    this.log('Page analysis:', analysis);
    return analysis;
  }

  /**
   * Get sample data for a template based on its ID
   */
  getSampleData(templateId) {
    const samples = {
      'animated-text': {
        text: 'Welcome to hdisplay demos',
        velocity: 100,
      },
      carousel: {
        items: [
          'https://picsum.photos/id/1015/1280/400',
          'https://picsum.photos/id/1022/1280/400',
          'https://picsum.photos/id/1035/1280/400',
        ],
        duration: 3000,
        zoomScale: 1.05,
      },
      'message-banner': {
        title: 'hdisplay',
        subtitle: 'Template Demo',
      },
      'webp-loop': {
        url: 'https://raw.githubusercontent.com/ewilderj/tidbyt/refs/heads/main/github/invert-mark-github-64x32.webp',
        fit: 'contain',
      },
      timeleft: {
        minutes: 15,
        label: 'Demo Time',
      },
      snake: {
        cellSize: 20,
        tickMs: 50,
      },
      'simple-clock': {},
    };

    // Try exact match first
    if (samples[templateId]) {
      return samples[templateId];
    }

    // Try pattern matching
    for (const [key, data] of Object.entries(samples)) {
      if (templateId.includes(key.split('-')[0])) {
        return data;
      }
    }

    // Default empty data
    return {};
  }
}

module.exports = TemplateHeuristics;

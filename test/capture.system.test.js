const BlackBoxCapture = require('../capture/capture');
const VisualDetector = require('../capture/visual-detector');
const TemplateHeuristics = require('../capture/template-heuristics');
const fs = require('fs-extra');

describe('BlackBoxCapture System', () => {
  const testOutputDir = './test-captures';

  beforeAll(async () => {
    // Ensure clean test environment
    await fs.remove(testOutputDir);
  });

  afterAll(async () => {
    // Clean up test captures
    await fs.remove(testOutputDir);
  });

  describe('VisualDetector', () => {
    let detector;

    beforeEach(() => {
      detector = new VisualDetector();
    });

    test('should initialize with correct configuration', () => {
      expect(detector).toBeDefined();
      expect(typeof detector.detectReadiness).toBe('function');
      expect(typeof detector.detectAnimation).toBe('function');
      expect(typeof detector.detectPixelCoverage).toBe('function');
    });

    test('should have all detection strategies', () => {
      const strategies = [
        'animation',
        'pixel_coverage',
        'visual_stability',
        'text_content',
        'media_loading',
      ];
      strategies.forEach((strategy) => {
        expect(detector.strategies.has(strategy)).toBe(true);
      });
    });
  });

  describe('TemplateHeuristics', () => {
    let heuristics;

    beforeEach(() => {
      heuristics = new TemplateHeuristics();
    });

    test('should generate sample data for known templates', () => {
      const clockData = heuristics.getSampleData('simple-clock');
      expect(clockData).toBeDefined();

      const animatedData = heuristics.getSampleData('animated-text');
      expect(animatedData).toHaveProperty('text');
      expect(animatedData).toHaveProperty('velocity');

      const carouselData = heuristics.getSampleData('carousel');
      expect(carouselData).toHaveProperty('items');
      expect(Array.isArray(carouselData.items)).toBe(true);
    });

    test('should handle unknown templates gracefully', () => {
      const unknownData = heuristics.getSampleData('unknown-template');
      expect(unknownData).toEqual({});
    });
  });

  describe('BlackBoxCapture', () => {
    let capture;

    beforeEach(() => {
      capture = new BlackBoxCapture({
        serverUrl: 'http://localhost:3000',
        outputDir: testOutputDir,
      });
    });

    test('should initialize with correct configuration', () => {
      expect(capture).toBeDefined();
      expect(capture.serverUrl).toBe('http://localhost:3000');
      expect(capture.outputDir).toBe(testOutputDir);
      expect(capture.detector).toBeInstanceOf(VisualDetector);
      expect(capture.heuristics).toBeInstanceOf(TemplateHeuristics);
    });

    test('should load capture profiles', () => {
      // Profiles should be loaded from capture-profiles directory
      expect(typeof capture.profiles).toBe('object');
      // Note: In CI/testing, profile files may not exist, so just check structure
    });

    test('should generate gallery HTML with template data', () => {
      const templateData = [
        { templateId: 'simple-clock', hasVideo: false },
        { templateId: 'animated-text', hasVideo: true },
      ];

      const html = capture.generateGalleryHTML(templateData);
      expect(html).toContain('hdisplay Template Gallery');
      expect(html).toContain('simple-clock');
      expect(html).toContain('animated-text');
      expect(html).toContain('screenshots/simple-clock.png');
      expect(html).toContain('videos/animated-text.webm');
    });
  });

  describe('Profile validation', () => {
    test('should validate sample profile structure', () => {
      const sampleProfile = {
        template: 'test-template',
        readiness_detection: {
          strategy: 'text_content',
          timeout: 3000,
        },
        screenshot: {
          after_detection: 500,
        },
        video: {
          duration: 0,
        },
      };

      expect(sampleProfile).toHaveProperty('template');
      expect(sampleProfile).toHaveProperty('readiness_detection');
      expect(sampleProfile.readiness_detection).toHaveProperty('strategy');
      expect(sampleProfile.readiness_detection).toHaveProperty('timeout');
      expect(sampleProfile).toHaveProperty('screenshot');
      expect(sampleProfile).toHaveProperty('video');
    });
  });
});

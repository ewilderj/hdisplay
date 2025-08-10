describe('Capture module shapes', () => {
  test('visual-detector exports a constructor', () => {
    const mod = require('../capture/visual-detector');
    const C = (typeof mod === 'function') ? mod : (mod && mod.default) || mod.VisualDetector;
    expect(typeof C).toBe('function');
    const instance = new C();
    expect(instance).toBeTruthy();
    expect(typeof instance.detectReadiness).toBe('function');
  });

  test('template-heuristics exports a constructor', () => {
    const mod = require('../capture/template-heuristics');
    const C = (typeof mod === 'function') ? mod : (mod && mod.default) || mod.TemplateHeuristics;
    expect(typeof C).toBe('function');
    const instance = new C();
    expect(instance).toBeTruthy();
    expect(typeof instance.getSampleData).toBe('function');
  });
});

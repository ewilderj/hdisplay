# Black-Box Template Capture System

The Black-Box Template Capture System automatically generates screenshots and videos of hdisplay templates without modifying any source code. It treats hdisplay as a black box and uses intelligent heuristics to detect when content is ready for capture.

## Features

- **Automated Screenshot Capture**: High-quality PNG screenshots of all templates
- **Video Recording**: WebM videos showing animated content and interactions, plus optional MP4 copies
- **Intelligent Detection**: Multiple strategies to detect when content is ready
- **Profile-Based Configuration**: YAML profiles for fine-tuning capture behavior
- **Gallery Generation**: HTML gallery showcasing all captured templates
- **Zero Code Intrusion**: No modifications to templates or server code required

## Quick Start

1. **Install Dependencies**

   ```bash
   npm install
   ```

2. **Start hdisplay Server**

   ```bash
   npm start
   ```

3. **Capture All Templates** (in another terminal)

   ```bash
   hdisplay capture:all
   ```

4. **Generate Gallery**

   ```bash
   hdisplay capture:gallery
   ```

5. **View Results**
   ```bash
   open captures/gallery.html
   ```

## CLI Commands

### `hdisplay capture:all`

Captures screenshots and videos of all available templates.

**Options:**

- `--output <dir>` - Output directory (default: `./captures`)

**Example:**

```bash
hdisplay capture:all --output ./demo-captures
```

### `hdisplay capture:template <templateId>`

Captures a specific template with optional custom data.

**Options:**

- `--output <dir>` - Output directory (default: `./captures`)
- `--data <json>` - Custom template data as JSON

**Examples:**

```bash
# Basic capture
hdisplay capture:template simple-clock

# With custom data
hdisplay capture:template animated-text --data '{"text":"Custom Message","velocity":150}'
```

### `hdisplay capture:gallery`

Generates an HTML gallery from existing captures.

**Options:**

- `--output <dir>` - Directory containing captures (default: `./captures`)

## Capture Profiles

Capture profiles are YAML files in `capture-profiles/` that define how each template should be captured. They specify detection strategies, timing, and sample data.

### Profile Structure

```yaml
template: template-name
description: 'Human-readable description'

readiness_detection:
  strategy: 'detection_method' # See strategies below
  timeout: 5000 # Max wait time in ms
  # Strategy-specific options...

screenshot:
  after_detection: 500 # Delay after detection (ms)

video:
  duration: 8000 # Video length in ms (0 = no video)
  trim_ms: 150 # Optional: trim this much from the start (ms)

sample_data:
  # Template-specific data
  key: 'value'
```

### Detection Strategies

#### `animation`

Detects content that moves or changes over time.

```yaml
readiness_detection:
  strategy: 'animation'
  animation_threshold: 0.05 # Minimum change to detect
  stable_frames: 3 # Frames to confirm animation
  timeout: 5000
```

#### `pixel_coverage`

Waits for sufficient visual content to appear.

```yaml
readiness_detection:
  strategy: 'pixel_coverage'
  min_coverage: 0.1 # Minimum coverage ratio (0-1)
  timeout: 5000
```

#### `visual_stability`

Waits for content to stop changing.

```yaml
readiness_detection:
  strategy: 'visual_stability'
  stability_threshold: 0.01 # Max change for "stable"
  stable_duration: 1000 # How long to stay stable (ms)
  timeout: 5000
```

#### `text_content`

Waits for text content to appear.

```yaml
readiness_detection:
  strategy: 'text_content'
  wait_for_text: true
  min_content_length: 5 # Minimum text length
  timeout: 3000
```

#### `media_loading`

Waits for images or videos to load.

```yaml
readiness_detection:
  strategy: 'media_loading'
  wait_for_images: true
  wait_for_videos: true
  timeout: 10000
```

## File Structure

```
capture/
├── capture.js              # Main capture orchestrator
├── visual-detector.js      # Detection strategies
└── template-heuristics.js  # Intelligent defaults

capture-profiles/
├── simple-clock.yaml
├── animated-text.yaml
├── carousel.yaml
├── snake.yaml
├── timeleft.yaml
└── message-banner.yaml

captures/                   # Output directory
├── screenshots/           # PNG screenshots
├── videos/               # WEBM and MP4 videos
└── gallery.html          # Generated gallery
```

## Environment Variables

- `CAPTURE_DEBUG=true` - Enable debug logging
- `HDISPLAY_SERVER` - Override server URL

## Video Encoding

MP4 creation is best-effort and requires ffmpeg on your PATH. WEBM is always produced when recording is enabled; MP4 is generated from the same raw source when ffmpeg is available.

- Encoder settings:
  - WEBM (VP9): CRF 35, row-mt, cpu-used 4
  - MP4 (H.264): CRF 23, preset veryfast, +faststart, yuv420p
- Trimming: The first portion of the raw recording can be trimmed to avoid initial white flashes or loading transitions. Use `video.trim_ms` in the profile. Default is 150ms.

Example per-profile override (carousel):

```yaml
template: carousel
video:
  duration: 15000
  trim_ms: 2000 # Trim 2s to account for image load
```

## Troubleshooting

### Server Not Running

```
❌ Capture failed: Failed to fetch templates: connect ECONNREFUSED
```

**Solution:** Start hdisplay server with `npm start`

### Permission Errors

```
❌ Capture failed: EACCES: permission denied
```

**Solution:** Check write permissions for output directory

### Template Not Found

```
❌ Failed to apply template: 404
```

**Solution:** Verify template exists with `hdisplay templates`

### Browser Launch Failed

```
❌ Capture failed: Browser executable not found
```

**Solution:** Install Playwright browsers with `npx playwright install chromium`

## Advanced Usage

### Custom Detection Strategy

Create a custom profile for templates with unique behavior:

```yaml
template: my-custom-template
readiness_detection:
  strategy: 'visual_stability'
  stability_threshold: 0.005 # More sensitive
  stable_duration: 2000 # Wait longer
  timeout: 15000 # Extended timeout
```

### Batch Processing

Capture specific templates only:

```bash
for template in simple-clock animated-text; do
  hdisplay capture:template $template
done
hdisplay capture:gallery
```

### Integration with CI/CD

```bash
# In your CI pipeline
npm start &                    # Start server in background
sleep 5                        # Wait for startup
hdisplay capture:all           # Generate captures
hdisplay capture:gallery       # Create gallery
# Upload captures/ to artifact storage
```

## Technical Details

### Browser Configuration

- **Engine**: Chromium via Playwright
- **Resolution**: 1280x400 (matches target display)
- **Scale**: 2x for high-DPI screenshots
- **Format**: PNG for screenshots, WebM for videos

### Visual Detection

The system uses Sharp for image processing to analyze:

- Pixel differences between frames
- Content coverage ratios
- Animation detection
- Text presence verification

### Performance

- **Parallel Processing**: Templates captured sequentially for stability
- **Memory Management**: Browser instances cleaned up after each template
- **Timeout Protection**: All operations have configurable timeouts
- **Error Handling**: Individual template failures don't stop batch processing

## Contributing

To add support for a new template:

1. Create a profile in `capture-profiles/template-name.yaml`
2. Test with `hdisplay capture:template template-name`
3. Verify output in generated gallery
4. Submit profile with pull request

Profile contributions should include:

- Appropriate detection strategy for the template's behavior
- Reasonable timeouts and delays
- Sample data that showcases the template's features
- Video duration that captures full functionality (animations, interactions)

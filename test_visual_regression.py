"""
Visual regression test for Rublo Arena game using Playwright sync API.
Launches the game, waits for Three.js map rendering, captures screenshots,
and compares them against a reference image using MSE, PSNR, and SSIM metrics.
"""

import json
import os
import sys
import time
import uuid
from pathlib import Path
from PIL import Image
import numpy as np

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("[ERROR] playwright not installed. Run: pip install playwright")
    sys.exit(1)

# ─── Configuration ───────────────────────────────────────────────
GAME_URL = os.getenv("GAME_URL", "http://localhost:3001/")
REFERENCE_PATH = os.getenv(
    "REFERENCE_PATH",
    str(Path(__file__).parent / "Gemini_Generated_Image_qgbvlxqgbvlxqgbv.png"),
)
SCREENSHOT_DIR = Path(__file__).parent / "test-results" / "visual-screenshots"
REPORT_DIR = Path(__file__).parent / "test-results" / "visual-comparison"
MAX_ATTEMPTS = 5
ATTEMPT_DELAY = 3.0
MAP_READY_TIMEOUT = 60  # seconds to wait for map generation
RENDER_STABILIZE = 5.0  # seconds to wait after game starts for rendering
SSIM_THRESHOLD = 0.85
PSNR_THRESHOLD = 25.0
MSE_THRESHOLD = 2500.0

# ─── Image comparison ────────────────────────────────────────────

def compute_ssim(ref: np.ndarray, test: np.ndarray) -> float:
    """Compute simplified SSIM between two images using sliding window."""
    C1 = (0.01 * 255) ** 2
    C2 = (0.03 * 255) ** 2

    ref = ref.astype(np.float64)
    test = test.astype(np.float64)

    # Convert to grayscale if needed
    if len(ref.shape) == 3 and ref.shape[2] > 1:
        ref_gray = np.mean(ref, axis=2)
        test_gray = np.mean(test, axis=2)
    else:
        ref_gray = ref.squeeze() if len(ref.shape) > 2 else ref
        test_gray = test.squeeze() if len(test.shape) > 2 else test

    h, w = ref_gray.shape
    window_size = 11

    if h < window_size or w < window_size:
        return 0.0

    # Compute local mean using sliding window
    def local_mean(arr, size):
        pad = size // 2
        arr_padded = np.pad(arr, ((pad, pad), (pad, pad)), mode='constant')
        result = np.zeros_like(arr)
        for i in range(arr.shape[0]):
            for j in range(arr.shape[1]):
                result[i, j] = arr_padded[i:i+size, j:j+size].mean()
        return result

    def local_covariance(arr1, arr2, mean1, mean2, size):
        pad = size // 2
        a1_padded = np.pad(arr1, ((pad, pad), (pad, pad)), mode='constant')
        a2_padded = np.pad(arr2, ((pad, pad), (pad, pad)), mode='constant')
        m1_padded = np.pad(mean1, ((pad, pad), (pad, pad)), mode='constant')
        m2_padded = np.pad(mean2, ((pad, pad), (pad, pad)), mode='constant')
        result = np.zeros_like(arr1)
        for i in range(arr1.shape[0]):
            for j in range(arr1.shape[1]):
                w1 = a1_padded[i:i+size, j:j+size] - m1_padded[i:i+size, j:j+size]
                w2 = a2_padded[i:i+size, j:j+size] - m2_padded[i:i+size, j:j+size]
                result[i, j] = np.mean(w1 * w2)
        return result

    mu_x = local_mean(ref_gray, window_size)
    mu_y = local_mean(test_gray, window_size)
    sigma_x_sq = local_covariance(ref_gray, ref_gray, mu_x, mu_x, window_size) - mu_x ** 2
    sigma_y_sq = local_covariance(test_gray, test_gray, mu_y, mu_y, window_size) - mu_y ** 2
    cov_xy = local_covariance(ref_gray, test_gray, mu_x, mu_y, window_size)

    mu_x_sq = mu_x ** 2
    mu_y_sq = mu_y ** 2

    num = (2 * mu_x * mu_y + C1) * (2 * cov_xy + C2)
    den = (mu_x_sq + mu_y_sq + C1) * (sigma_x_sq + sigma_y_sq + C2)

    with np.errstate(divide='ignore', invalid='ignore'):
        ssim_map = num / den

    return float(np.nanmean(ssim_map)) if np.any(np.isfinite(ssim_map)) else 0.0


def compare_images(ref_path: Path, test_path: Path) -> dict:
    """Compare reference and test screenshot images."""
    try:
        ref_img = Image.open(ref_path).convert("RGB")
        test_img = Image.open(test_path).convert("RGB")

        ref_np = np.array(ref_img)
        test_np = np.array(test_img)

        # Resize test to match reference dimensions
        if test_np.shape != ref_np.shape:
            test_img_resized = test_img.resize(ref_img.size, Image.LANCZOS)
            test_np = np.array(test_img_resized)

        # MSE
        diff = ref_np.astype(np.float64) - test_np.astype(np.float64)
        mse = float(np.mean(diff ** 2))

        # PSNR
        if mse < 1e-10:
            psnr = 100.0
        else:
            psnr = float(10 * np.log10(255 ** 2 / mse))

        # SSIM
        ssim = compute_ssim(ref_np, test_np)

        # Pixel difference stats
        diff_abs = np.abs(diff).astype(np.float64)
        max_diff = float(np.max(diff_abs))
        mean_diff = float(np.mean(diff_abs))
        pct_different = float(np.sum(diff_abs > 5) / diff_abs.size * 100)

        return {
            "mse": round(mse, 2),
            "psnr": round(psnr, 2),
            "ssim": round(ssim, 4),
            "max_diff": round(max_diff, 2),
            "mean_diff": round(mean_diff, 2),
            "pct_different_pixels": round(pct_different, 2),
            "ref_size": ref_img.size,
            "test_size": test_img.size,
            "pass": ssim >= SSIM_THRESHOLD and psnr >= PSNR_THRESHOLD,
        }
    except Exception as e:
        return {"error": str(e), "ssim": 0, "psnr": 0, "mse": -1, "pass": False}


# ─── Browser interaction ────────────────────────────────────────

def enable_test_mode(page):
    """Enable test mode safely after page load."""
    try:
        page.evaluate("""() => {
            try {
                localStorage.setItem('testMode', 'true');
            } catch(e) {
                console.warn('localStorage not available:', e.message);
            }
            window._testModeEnabled = true;
            if (typeof window.setTestMode === 'function') {
                window.setTestMode(true);
            }
        }""")
    except Exception:
        pass


def wait_for_map_ready(page, timeout=MAP_READY_TIMEOUT):
    """Wait until the Three.js map is rendered and visible."""
    start = time.time()
    last_frame_count = 0

    while time.time() - start < timeout:
        elapsed = time.time() - start

        # Check game state
        state = page.evaluate("""() => {
            const g = window.game || null;
            if (!g) return { hasGame: false };
            return {
                hasGame: true,
                isStarted: g.isStarted || false,
                hasMap: !!g.map,
                hasRenderer: !!g.renderer,
                hasScene: !!g.scene,
                hasCamera: !!g.camera,
                hasPlayer: !!g.player,
                hasHUD: !!g.hud,
                renderCount: g.renderFrameCount || 0,
                gameState: g.gameState || 'unknown',
                loadingOverlay: !!document.getElementById('loadingOverlay'),
                loadingHidden: document.getElementById('loadingOverlay')?.style?.display === 'none',
                startScreen: !!document.getElementById('startScreen'),
                canvasCount: document.querySelectorAll('canvas').length,
                bodyClass: document.body?.className || '',
            };
        }""")

        # Count canvas elements
        canvas_count = page.evaluate("document.querySelectorAll('canvas').length")

        status_parts = [f"[{elapsed:.0f}s]"]
        for k in ["hasGame", "isStarted", "hasMap", "hasRenderer", "hasScene", "hasCamera", "canvasCount", "renderCount"]:
            if k in state:
                status_parts.append(f"{k}={state[k]}")

        print(f"  {' '.join(status_parts)}")

        # Check if map is ready (canvas exists and renderer has rendered frames)
        if (state.get("hasGame") and
            state.get("isStarted") and
            state.get("hasMap") and
            state.get("hasRenderer") and
            canvas_count > 0 and
            state.get("renderCount", 0) > 10 and
            last_frame_count != state.get("renderCount", 0)):

            last_frame_count = state["renderCount"]

            # Force a few render passes
            page.evaluate("""() => {
                if (window.game && window.game.renderer && window.game.scene && window.game.camera) {
                    for (let i = 0; i < 5; i++) {
                        window.game.renderer.render(window.game.scene, window.game.camera);
                    }
                }
            }""")
            page.wait_for_timeout(2000)

            print(f"  ✓ Map ready after {elapsed:.0f}s")
            return True

        page.wait_for_timeout(2000)

    print(f"  ✗ Timeout after {timeout}s")
    return False


def capture_map_screenshot(page, screenshot_path):
    """Capture screenshot of the game canvas."""
    try:
        # Wait a moment for rendering
        page.wait_for_timeout(2000)

        # Try canvas screenshot first
        canvas = page.query_selector("canvas")
        if canvas:
            canvas.screenshot(path=str(screenshot_path))
            # Verify screenshot is not empty
            if Path(screenshot_path).stat().st_size > 1000:
                print(f"  ✓ Canvas screenshot saved ({Path(screenshot_path).stat().st_size} bytes)")
                return True

        # Fallback to full page screenshot
        page.screenshot(path=str(screenshot_path), full_page=False)
        print(f"  ✓ Page screenshot saved ({Path(screenshot_path).stat().st_size} bytes)")
        return True

    except Exception as e:
        print(f"  ✗ Screenshot failed: {e}")
        return False


def click_start_button(page):
    """Click the game start button."""
    try:
        # Try desktop button first
        btn = page.query_selector("#startButtonDesktop")
        if not btn:
            btn = page.query_selector(".start-btn")

        if btn:
            btn.click()
            print("  ✓ Clicked start button")
            page.wait_for_timeout(2000)

            # Wait for loading overlay to disappear
            try:
                page.wait_for_selector("#loadingOverlay", state="hidden", timeout=15000)
                print("  ✓ Loading overlay hidden")
            except Exception:
                print("  ⚠ Loading overlay still visible, continuing...")
        else:
            print("  ⚠ Start button not found")

    except Exception as e:
        print(f"  ✗ Click start failed: {e}")


def force_initialize_game(page):
    """Force game initialization through JavaScript."""
    try:
        # Set test mode and force initialization
        page.evaluate("""() => {
            if (window.game && !window.game.isStarted) {
                window.game._testMode = true;
                localStorage.setItem('testMode', 'true');
                window.game.startGame().catch(err => console.error('Start failed:', err));
            }
        }""")
        print("  ✓ Forced game start")
        page.wait_for_timeout(5000)
    except Exception as e:
        print(f"  ✗ Force init failed: {e}")


def get_console_logs(page, count=100):
    """Get console logs from the page."""
    try:
        logs = page.evaluate(f"""() => {{
            return (window._consoleLogs || []).slice(-{count});
        }}""")
        return logs or []
    except Exception:
        return []


def debug_page_state(page):
    """Collect diagnostic information about the page state."""
    info = page.evaluate("""() => {
        const result = {
            url: window.location.href,
            domContentLoaded: document.readyState,
            hasGameRoot: !!document.getElementById('gameRoot'),
            hasStartScreen: !!document.getElementById('startScreen'),
            hasLoadingOverlay: !!document.getElementById('loadingOverlay'),
            loadingVisible: document.getElementById('loadingOverlay')?.offsetParent !== null,
            startScreenVisible: document.getElementById('startScreen')?.offsetParent !== null,
            bodyClass: document.body?.className || '',
            canvasCount: document.querySelectorAll('canvas').length,
            threeDefined: typeof THREE !== 'undefined',
            gameDefined: typeof window.game !== 'undefined',
        };

        if (window.game) {
            result.gameState = {
                isStarted: window.game.isStarted,
                initialized: window.game.initialized,
                hasScene: !!window.game.scene,
                hasCamera: !!window.game.camera,
                hasRenderer: !!window.game.renderer,
                hasMap: !!window.game.map,
                hasPlayer: !!window.game.player,
                hasHUD: !!window.game.hud,
                renderFrameCount: window.game.renderFrameCount || 0,
                gameState: window.game.gameState,
            };
        }

        return result;
    }""")

    print("\n  Page State:")
    for k, v in info.items():
        if isinstance(v, dict):
            print(f"    {k}:")
            for kk, vv in v.items():
                print(f"      {kk}: {vv}")
        else:
            print(f"    {k}: {v}")

    return info


# ─── Main test loop ─────────────────────────────────────────────

def run_visual_test():
    """Run the complete visual regression test."""
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    ref_path = Path(REFERENCE_PATH)
    if not ref_path.exists():
        print(f"[ERROR] Reference image not found: {ref_path}")
        return False

    print(f"\n{'='*60}")
    print(f"Rublo Arena Visual Regression Test")
    print(f"{'='*60}")
    print(f"URL: {GAME_URL}")
    print(f"Reference: {ref_path}")
    print(f"Max attempts: {MAX_ATTEMPTS}")
    print(f"Thresholds: SSIM>={SSIM_THRESHOLD}, PSNR>={PSNR_THRESHOLD}dB")
    print(f"{'='*60}\n")

    results = []

    with sync_playwright() as p:
        for attempt in range(1, MAX_ATTEMPTS + 1):
            print(f"\n{'─'*40}")
            print(f"Attempt {attempt}/{MAX_ATTEMPTS}")
            print(f"{'─'*40}")

            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                viewport={"width": 1280, "height": 720},
                ignore_https_errors=True,
                locale="ru-RU",
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
            )
            page = context.new_page()

            attempt_id = uuid.uuid4().hex[:8]
            screenshot_path = SCREENSHOT_DIR / f"attempt_{attempt}_{attempt_id}.png"

            try:
                print(f"\n  [1/6] Navigating to {GAME_URL}...")
                page.goto(GAME_URL, wait_until="domcontentloaded", timeout=30000)
                print(f"  ✓ Page loaded ({page.url})")

                # Enable test mode after navigation
                print(f"  [2/6] Enabling test mode...")
                enable_test_mode(page)

                # Check for JS errors
                page.wait_for_timeout(3000)
                console_logs = get_console_logs(page)
                error_logs = [l for l in console_logs if l.get("type") == "error"]
                if error_logs:
                    print(f"  ⚠ Found {len(error_logs)} console errors:")
                    for err in error_logs[:5]:
                        print(f"    - {err.get('text', '')[:200]}")

                print(f"\n  [3/6] Checking game initialization...")
                debug_info = debug_page_state(page)

                print(f"\n  [4/6] Clicking start button...")
                click_start_button(page)

                print(f"\n  [5/6] Waiting for map rendering...")
                map_ready = wait_for_map_ready(page, timeout=MAP_READY_TIMEOUT)

                if not map_ready:
                    print(f"  ⚠ Map not ready, attempting force initialization...")
                    force_initialize_game(page)
                    map_ready = wait_for_map_ready(page, timeout=15)

                if map_ready:
                    print(f"\n  [6/6] Capturing screenshot...")
                    capture_map_screenshot(page, screenshot_path)

                    # Wait for render stabilization
                    page.wait_for_timeout(int(RENDER_STABILIZE * 1000))

                    # Extra render passes for consistency
                    page.evaluate("""() => {
                        if (window.game && window.game.renderer && window.game.scene && window.game.camera) {
                            for (let i = 0; i < 3; i++) {
                                window.game.renderer.render(window.game.scene, window.game.camera);
                            }
                        }
                    }""")
                    page.wait_for_timeout(2000)

                    # Take final screenshot
                    final_screenshot = SCREENSHOT_DIR / f"final_{attempt}_{attempt_id}.png"
                    capture_map_screenshot(page, final_screenshot)
                    screenshot_path = final_screenshot

                    # Compare with reference
                    print(f"\n  Comparing images...")
                    comparison = compare_images(ref_path, screenshot_path)
                    comparison["attempt"] = attempt
                    comparison["screenshot"] = str(screenshot_path)
                    comparison["console_logs"] = console_logs[-50:]
                    comparison["map_ready"] = map_ready

                    results.append(comparison)

                    print(f"\n  Results:")
                    print(f"    SSIM:    {comparison.get('ssim', 'N/A')} (threshold: {SSIM_THRESHOLD})")
                    print(f"    PSNR:    {comparison.get('psnr', 'N/A')} dB (threshold: {PSNR_THRESHOLD})")
                    print(f"    MSE:     {comparison.get('mse', 'N/A')} (threshold: {MSE_THRESHOLD})")
                    print(f"    Different pixels: {comparison.get('pct_different_pixels', 'N/A')}%")
                    print(f"    Max diff: {comparison.get('max_diff', 'N/A')}")
                    print(f"    Pass: {comparison.get('pass', False)}")

                    if comparison.get("pass"):
                        print(f"\n  ✓✓✓ MATCH FOUND — Test PASSED ✓✓✓")
                        browser.close()
                        return True

                    print(f"\n  ✗✗✗ Below threshold — will retry ✗✗✗")

                else:
                    print(f"  ✗ Map rendering failed completely")
                    page.screenshot(path=str(screenshot_path), full_page=True)
                    results.append({
                        "attempt": attempt,
                        "error": "Map rendering failed",
                        "screenshot": str(screenshot_path),
                        "map_ready": False,
                        "debug_info": debug_info,
                        "console_logs": console_logs[-50:],
                    })

            except Exception as e:
                print(f"  ✗ Test error: {e}")
                try:
                    page.screenshot(path=str(screenshot_path), full_page=True)
                except Exception:
                    pass
                results.append({
                    "attempt": attempt,
                    "error": str(e),
                    "screenshot": str(screenshot_path),
                })

            browser.close()

        if attempt < MAX_ATTEMPTS:
            print(f"\n  Waiting {ATTEMPT_DELAY}s before retry...")
            time.sleep(ATTEMPT_DELAY)

    # ─── Generate report ─────────────────────────────────────────
    print(f"\n{'='*60}")
    print(f"Test Complete — Generating Report")
    print(f"{'='*60}")

    report = {
        "test_id": uuid.uuid4().hex,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "reference": str(ref_path),
        "url": GAME_URL,
        "thresholds": {
            "ssim_min": SSIM_THRESHOLD,
            "psnr_min": PSNR_THRESHOLD,
            "mse_max": MSE_THRESHOLD,
        },
        "attempts": len(results),
        "passed": any(r.get("pass", False) for r in results),
        "results": results,
    }

    report_path = REPORT_DIR / f"report_{uuid.uuid4().hex[:8]}.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False, default=str)

    print(f"\n  Report saved: {report_path}")

    # Print summary
    print(f"\n{'─'*40}")
    print(f"Summary:")
    print(f"  Total attempts: {len(results)}")
    print(f"  Passed: {any(r.get('pass', False) for r in results)}")

    for r in results:
        ssim = r.get("ssim", "N/A")
        psnr = r.get("psnr", "N/A")
        pass_flag = r.get("pass", False)
        status = "✓ PASS" if pass_flag else "✗ FAIL"
        print(f"  {status} | SSIM={ssim} | PSNR={psnr}")

    # Save best screenshot
    if results:
        best = max(results, key=lambda r: r.get("ssim", -1))
        best_path = best.get("screenshot", "")
        if best_path and Path(best_path).exists():
            best_copy = SCREENSHOT_DIR / "best_match.png"
            best_img = Image.open(best_path)
            best_img.save(best_copy)
            print(f"\n  Best match saved: {best_copy}")
            print(f"    SSIM: {best.get('ssim', 'N/A')}")
            print(f"    PSNR: {best.get('psnr', 'N/A')} dB")

    return report["passed"]


# ─── Entry point ────────────────────────────────────────────────

def main():
    """Main entry point."""
    passed = run_visual_test()

    print(f"\n{'='*60}")
    if passed:
        print("FINAL RESULT: PASSED")
    else:
        print("FINAL RESULT: FAILED")
    print(f"{'='*60}")

    sys.exit(0 if passed else 1)


if __name__ == "__main__":
    main()

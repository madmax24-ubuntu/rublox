import sys
from PIL import Image
import numpy as np

ref_path = r".\Gemini_Generated_Image_qgbvlxqgbvlxqgbv.png"
test_path = r".\test-results\visual-screenshots\attempt_1_5dbb41b4.png"

print("Loading images...", file=sys.stderr)
ref_img = Image.open(ref_path).convert('RGB')
test_img = Image.open(test_path).convert('RGB')
test_img = test_img.resize(ref_img.size)

ref_np = np.array(ref_img)
test_np = np.array(test_img)

print(f"REF shape: {ref_np.shape}, TEST shape: {test_np.shape}", file=sys.stderr)

# MSE
diff = ref_np.astype(np.float64) - test_np.astype(np.float64)
mse = float(np.mean(diff ** 2))
print(f"MSE: {mse}", file=sys.stderr)

# PSNR
psnr = 100.0 if mse < 1e-10 else float(10 * np.log10(255 ** 2 / mse))
print(f"PSNR: {psnr}", file=sys.stderr)

# Simple correlation as fallback
if mse > 0:
    ssim = np.corrcoef(ref_np.flatten(), test_np.flatten())[0, 1]
    print(f"SSIM (corr): {ssim}", file=sys.stderr)
else:
    print("SSIM: 1.0", file=sys.stderr)

print("DONE", file=sys.stderr)

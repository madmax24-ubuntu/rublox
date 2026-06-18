import sys
from PIL import Image
import numpy as np
import json
from scipy.ndimage import uniform_filter

def compare(ref_path, test_path, ssim_threshold=0.85, psnr_threshold=25.0):
    try:
        ref_img = Image.open(ref_path).convert('RGB')
        test_img = Image.open(test_path).convert('RGB')
        test_img = test_img.resize(ref_img.size)
        
        ref_np = np.array(ref_img)
        test_np = np.array(test_img)
        
        # MSE
        diff = ref_np.astype(np.float64) - test_np.astype(np.float64)
        mse = float(np.mean(diff ** 2))
        
        # PSNR
        psnr = 100.0 if mse < 1e-10 else float(10 * np.log10(255 ** 2 / mse))
        
        # Vectorized SSIM
        C1 = (0.01 * 255) ** 2
        C2 = (0.03 * 255) ** 2
        window_size = 11
        
        ref_gray = np.mean(ref_np, axis=2) if len(ref_np.shape) == 3 else ref_np
        test_gray = np.mean(test_np, axis=2) if len(test_np.shape) == 3 else test_np
        
        mu_x = uniform_filter(ref_gray, size=window_size)
        mu_y = uniform_filter(test_gray, size=window_size)
        sigma_x_sq = uniform_filter(ref_gray ** 2, size=window_size) - mu_x ** 2
        sigma_y_sq = uniform_filter(test_gray ** 2, size=window_size) - mu_y ** 2
        cov_xy = uniform_filter(ref_gray * test_gray, size=window_size) - mu_x * mu_y
        
        with np.errstate(divide='ignore', invalid='ignore'):
            ssim_map = ((2 * mu_x * mu_y + C1) * (2 * cov_xy + C2)) / ((mu_x ** 2 + mu_y ** 2 + C1) * (sigma_x_sq + sigma_y_sq + C2))
        ssim = float(np.nanmean(ssim_map))
        
        diff_abs = np.abs(diff).astype(np.float64)
        max_diff = float(np.max(diff_abs))
        mean_diff = float(np.mean(diff_abs))
        pct_different = float(np.sum(diff_abs > 5) / diff_abs.size * 100)
        
        result = {
            'mse': round(mse, 2),
            'psnr': round(psnr, 2),
            'ssim': round(ssim, 4),
            'max_diff': round(max_diff, 2),
            'mean_diff': round(mean_diff, 2),
            'pct_different_pixels': round(pct_different, 2),
            'ref_size': list(ref_img.size),
            'test_size': list(test_img.size),
            'pass': ssim >= ssim_threshold and psnr >= psnr_threshold
        }
        print('RESULT:' + json.dumps(result))
    except Exception as e:
        print('ERROR:' + str(e))

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('Usage: compare_images.py <ref_path> <test_path>')
        sys.exit(1)
    compare(sys.argv[1], sys.argv[2])

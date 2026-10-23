"""
Processes the supplied WL BizStore logo (AppStoreLogo.jpg) into all the
branding assets needed for the admin portal and the Android app:

  - admin-portal/src/assets/logo-mark.png   (square shield-only icon, transparent bg)
  - admin-portal/src/assets/logo-full.png   (full wordmark, transparent bg)
  - admin-portal/public/favicon.png         (browser tab favicon)
  - android launcher icons (legacy + adaptive) at all densities
  - android/.../res/drawable/logo_mark.png  (used on the enrollment screen)

Run: python scripts/process_logo.py
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = r"C:\Users\a692784\Downloads\AppStoreLogo.jpg"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ADMIN_ASSETS = os.path.join(ROOT, "admin-portal", "src", "assets")
ADMIN_PUBLIC = os.path.join(ROOT, "admin-portal", "public")
ANDROID_RES = os.path.join(ROOT, "android", "app", "src", "main", "res")

os.makedirs(ADMIN_ASSETS, exist_ok=True)
os.makedirs(ADMIN_PUBLIC, exist_ok=True)


def chroma_key_to_transparent(img: Image.Image, threshold=28) -> Image.Image:
    """Removes the near-white background by flood-filling from the image
    border, so interior near-white highlights inside the logo are kept."""
    arr = np.array(img.convert("RGB")).astype(np.float32)
    border_px = np.concatenate(
        [arr[0, :, :], arr[-1, :, :], arr[:, 0, :], arr[:, -1, :]], axis=0
    )
    bg_ref = border_px.mean(axis=0)
    dist = np.linalg.norm(arr - bg_ref, axis=2)
    bg_like = dist < threshold
    lbl, _ = ndimage.label(bg_like)
    border_labels = set(lbl[0, :]) | set(lbl[-1, :]) | set(lbl[:, 0]) | set(lbl[:, -1])
    border_labels.discard(0)
    bg_mask = np.isin(lbl, list(border_labels))
    alpha = np.where(bg_mask, 0, 255).astype(np.uint8)
    rgba = np.dstack([arr.astype(np.uint8), alpha])
    return Image.fromarray(rgba, mode="RGBA")


def trim(img: Image.Image, pad=0) -> Image.Image:
    """Crop to the bounding box of non-transparent pixels."""
    alpha = np.array(img.split()[-1])
    rows = np.where(alpha.max(axis=1) > 8)[0]
    cols = np.where(alpha.max(axis=0) > 8)[0]
    if len(rows) == 0 or len(cols) == 0:
        return img
    top, bottom = max(rows[0] - pad, 0), min(rows[-1] + pad + 1, img.height)
    left, right = max(cols[0] - pad, 0), min(cols[-1] + pad + 1, img.width)
    return img.crop((left, top, right, bottom))


def pad_to_square(img: Image.Image, margin_frac=0.12) -> Image.Image:
    """Pads a trimmed RGBA image to a square canvas with transparent margins."""
    w, h = img.size
    side = max(w, h)
    side = int(side * (1 + margin_frac * 2))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - w) // 2, (side - h) // 2), img)
    return canvas


def main():
    src = Image.open(SRC)
    full_rgba = trim(chroma_key_to_transparent(src), pad=6)
    full_rgba.save(os.path.join(ADMIN_ASSETS, "logo-full.png"))
    print("full logo:", full_rgba.size)

    # The shield mark sits in roughly the left ~40% of the full (trimmed) wordmark.
    w, h = full_rgba.size
    shield_crop = full_rgba.crop((0, 0, int(w * 0.40), h))
    shield = pad_to_square(trim(shield_crop, pad=4), margin_frac=0.10)
    print("shield icon:", shield.size)

    mark_512 = shield.resize((512, 512), Image.LANCZOS)
    mark_512.save(os.path.join(ADMIN_ASSETS, "logo-mark.png"))

    # Favicon (flatten onto white so it reads cleanly in browser tabs)
    favicon_canvas = Image.new("RGBA", shield.size, (255, 255, 255, 255))
    favicon_canvas.alpha_composite(shield)
    favicon_canvas.resize((256, 256), Image.LANCZOS).save(os.path.join(ADMIN_PUBLIC, "favicon.png"))
    favicon_canvas.resize((32, 32), Image.LANCZOS).save(os.path.join(ADMIN_PUBLIC, "favicon-32.png"))
    favicon_canvas.resize((180, 180), Image.LANCZOS).save(os.path.join(ADMIN_PUBLIC, "apple-touch-icon.png"))

    # ── Android ──────────────────────────────────────────────────────────
    bg_color = (255, 255, 255, 255)  # white adaptive-icon background

    # Adaptive icon foreground: shield centered within the ~66% safe zone of a 108dp canvas
    def make_foreground(px: int) -> Image.Image:
        canvas = Image.new("RGBA", (px, px), (0, 0, 0, 0))
        target = int(px * 0.62)
        icon = shield.resize((target, target), Image.LANCZOS)
        canvas.paste(icon, ((px - target) // 2, (px - target) // 2), icon)
        return canvas

    def make_legacy(px: int, round_mask: bool) -> Image.Image:
        canvas = Image.new("RGBA", (px, px), bg_color)
        target = int(px * 0.72)
        icon = shield.resize((target, target), Image.LANCZOS)
        canvas.paste(icon, ((px - target) // 2, (px - target) // 2), icon)
        if round_mask:
            mask = Image.new("L", (px, px), 0)
            from PIL import ImageDraw
            ImageDraw.Draw(mask).ellipse((0, 0, px, px), fill=255)
            out = Image.new("RGBA", (px, px), (0, 0, 0, 0))
            out.paste(canvas, (0, 0), mask)
            return out
        return canvas

    densities = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192,
    }
    fg_sizes = {
        "mipmap-mdpi": 108,
        "mipmap-hdpi": 162,
        "mipmap-xhdpi": 216,
        "mipmap-xxhdpi": 324,
        "mipmap-xxxhdpi": 432,
    }

    for folder, px in densities.items():
        d = os.path.join(ANDROID_RES, folder)
        os.makedirs(d, exist_ok=True)
        make_legacy(px, round_mask=False).save(os.path.join(d, "ic_launcher.png"))
        make_legacy(px, round_mask=True).save(os.path.join(d, "ic_launcher_round.png"))
        make_foreground(fg_sizes[folder]).save(os.path.join(d, "ic_launcher_foreground.png"))

    # Enrollment-screen logo mark (regular drawable, not density-bucketed)
    drawable_dir = os.path.join(ANDROID_RES, "drawable")
    os.makedirs(drawable_dir, exist_ok=True)
    shield.resize((400, 400), Image.LANCZOS).save(os.path.join(drawable_dir, "logo_mark.png"))

    print("Done.")


if __name__ == "__main__":
    main()

import os

from PIL import Image
from rembg import remove


def ensure_parent(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)


def resize_if_needed(image: Image.Image, max_edge: int | None) -> Image.Image:
    if not max_edge:
        return image
    w, h = image.size
    if max(w, h) <= max_edge:
        return image
    scale = max_edge / max(w, h)
    return image.resize((int(w * scale), int(h * scale)), Image.LANCZOS)


def remove_background(input_path: str, output_path: str, max_edge: int | None = None) -> None:
    ensure_parent(output_path)
    with Image.open(input_path) as img:
        img = img.convert("RGBA")
        img = resize_if_needed(img, max_edge)
        result = remove(img, alpha_matting=True)
        result.save(output_path, "PNG")


def composite_solid_background(input_png: str, color_hex: str) -> bytes:
    with Image.open(input_png) as img:
        img = img.convert("RGBA")
        bg = Image.new("RGBA", img.size, color_hex)
        bg.alpha_composite(img)
        out = bg.convert("RGB")
        from io import BytesIO

        buf = BytesIO()
        out.save(buf, format="PNG")
        return buf.getvalue()

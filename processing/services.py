import os
from functools import lru_cache

from PIL import Image
from django.conf import settings


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


@lru_cache(maxsize=1)
def _rembg_session():
    # Import lazily to avoid expensive model initialization during unrelated commands.
    from rembg import new_session

    return new_session(getattr(settings, "REMBG_MODEL", "u2netp"))


def _effective_max_edge(max_edge: int | None) -> int | None:
    work_cap = int(getattr(settings, "REMBG_WORK_MAX_EDGE", 1600))
    if not max_edge:
        return work_cap
    return min(max_edge, work_cap)


def remove_background(input_path: str, output_path: str, max_edge: int | None = None) -> None:
    from rembg import remove

    ensure_parent(output_path)
    with Image.open(input_path) as img:
        original = img.convert("RGBA")
        effective_edge = _effective_max_edge(max_edge)
        working = resize_if_needed(original, effective_edge)
        result = remove(
            working,
            session=_rembg_session(),
            alpha_matting=bool(getattr(settings, "REMBG_ALPHA_MATTING", False)),
            post_process_mask=bool(getattr(settings, "REMBG_POST_PROCESS_MASK", True)),
        )
        if result.size != original.size:
            result = result.resize(original.size, Image.LANCZOS)
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

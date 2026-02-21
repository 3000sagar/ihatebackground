from pathlib import Path

from PIL import Image
from rembg import remove


def main() -> None:
    base = Path(__file__).resolve().parents[1]
    img_path = base / "static" / "img" / "pexels-caspersomia-20433618.jpg"
    out_path = base / "static" / "img" / "pexels-caspersomia-20433618-removed.png"
    img = Image.open(img_path).convert("RGBA")
    result = remove(img, alpha_matting=True)
    result.save(out_path, "PNG")
    print(out_path)


if __name__ == "__main__":
    main()

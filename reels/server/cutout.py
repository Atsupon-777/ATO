"""Cuts the product out of a photo with BiRefNet and trims it to its bounds.

Usage: python3 cutout.py <input> <output.png>
Prints JSON: {"width", "height", "aspect", "bbox": [left, top, right, bottom] in the source photo}.
Requires: pip install "rembg[cpu]" (the model downloads on first run).
"""
import json
import sys

from PIL import Image
from rembg import new_session, remove

MODEL = "birefnet-general-lite"


def main(src: str, out: str) -> None:
    image = Image.open(src).convert("RGB")
    cut = remove(image, session=new_session(MODEL), post_process_mask=True)
    alpha = cut.getchannel("A")
    # ignore faint fringe pixels when finding the bounds
    bbox = alpha.point(lambda a: 255 if a > 24 else 0).getbbox()
    if not bbox:
        raise SystemExit("no product found in the photo")
    trimmed = cut.crop(bbox)
    trimmed.save(out)
    w, h = trimmed.size
    print(json.dumps({"width": w, "height": h, "aspect": round(w / h, 4), "bbox": list(bbox)}))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

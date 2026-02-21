import imghdr

from django.conf import settings
from django.core.exceptions import ValidationError


ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".webp"}
ALLOWED_TYPES = {"png", "jpeg", "webp"}


def validate_upload(uploaded_file):
    if uploaded_file.size > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise ValidationError(f"Max file size is {settings.MAX_UPLOAD_MB}MB.")
    ext = f".{uploaded_file.name.split('.')[-1].lower()}"
    if ext not in ALLOWED_EXT:
        raise ValidationError("Unsupported file type.")
    header_type = imghdr.what(uploaded_file.file)
    if header_type not in ALLOWED_TYPES:
        raise ValidationError("Invalid image content.")

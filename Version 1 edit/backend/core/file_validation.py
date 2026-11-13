import os
from django.conf import settings
from rest_framework.exceptions import ValidationError

ALLOWED_EXTENSIONS = {".pdf", ".doc", ".docx", ".ppt", ".pptx", ".zip", ".png", ".jpg", ".jpeg", ".txt"}
def validate_upload(upload):
    max_size = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if upload.size > max_size:
        raise ValidationError(f"حجم هر فایل نباید بیشتر از {settings.MAX_UPLOAD_SIZE_MB} مگابایت باشد.")
    ext = os.path.splitext(upload.name)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValidationError("پسوند فایل مجاز نیست.")
    head = upload.read(16)
    upload.seek(0)
    signatures = {
        ".pdf": [b"%PDF-"], ".png": [b"\\x89PNG\\r\\n\\x1a\\n"],
        ".jpg": [b"\\xff\\xd8\\xff"], ".jpeg": [b"\\xff\\xd8\\xff"],
        ".zip": [b"PK\\x03\\x04"], ".docx": [b"PK\\x03\\x04"], ".pptx": [b"PK\\x03\\x04"],
    }
    if ext in signatures and not any(head.startswith(sig) for sig in signatures[ext]):
        raise ValidationError("محتوای فایل با پسوند آن مطابقت ندارد.")
    return ext

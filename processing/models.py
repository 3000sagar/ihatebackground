import uuid

from django.conf import settings
from django.db import models


class ProcessingJob(models.Model):
    STATUS_CHOICES = [
        ("queued", "Queued"),
        ("processing", "Processing"),
        ("done", "Done"),
        ("failed", "Failed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL
    )
    original_name = models.CharField(max_length=255)
    input_path = models.CharField(max_length=512)
    output_path = models.CharField(max_length=512, blank=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="queued")
    stage = models.CharField(max_length=64, blank=True)
    progress = models.PositiveSmallIntegerField(default=0)
    error_message = models.TextField(blank=True)
    bg_color = models.CharField(max_length=16, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    expires_at = models.DateTimeField()

    def __str__(self):
        return f"{self.id} ({self.status})"

import os
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.utils import timezone

from .cleanup import cleanup_expired_data
from .models import ProcessingJob
from .services import remove_background


@shared_task
def process_image(job_id: str) -> None:
    try:
        job = ProcessingJob.objects.get(id=job_id)
    except ProcessingJob.DoesNotExist:
        return

    def set_stage(stage: str, progress: int) -> None:
        job.stage = stage
        job.progress = max(0, min(100, int(progress)))
        job.expires_at = timezone.now() + timedelta(minutes=settings.JOB_TTL_MINUTES)
        job.save(update_fields=["stage", "progress", "expires_at", "updated_at"])

    job.status = "processing"
    job.stage = "queued_in_worker"
    job.progress = 5
    job.expires_at = timezone.now() + timedelta(minutes=settings.JOB_TTL_MINUTES)
    job.save(update_fields=["status", "stage", "progress", "expires_at", "updated_at"])
    try:
        set_stage("loading_image", 15)
        output_path = os.path.join(settings.TEMP_DIR, f"{job.id}_out.png")
        max_edge = settings.FREE_MAX_EDGE if not job.user or job.user.plan == "free" else None
        set_stage("segmenting_foreground", 45)
        remove_background(job.input_path, output_path, max_edge=max_edge)
        set_stage("refining_edges", 78)
        job.output_path = output_path
        job.stage = "saving_output"
        job.progress = 96
        job.expires_at = timezone.now() + timedelta(minutes=settings.JOB_TTL_MINUTES)
        job.save(update_fields=["output_path", "stage", "progress", "expires_at", "updated_at"])
        job.status = "done"
        job.stage = "complete"
        job.progress = 100
        job.expires_at = timezone.now() + timedelta(minutes=settings.JOB_TTL_MINUTES)
        job.save(update_fields=["status", "stage", "progress", "expires_at", "updated_at"])
    except Exception as exc:
        job.status = "failed"
        job.stage = "failed"
        job.error_message = str(exc)
        job.save(update_fields=["status", "stage", "error_message", "updated_at"])


@shared_task
def cleanup_expired_jobs() -> int:
    return cleanup_expired_data()["jobs_deleted"]

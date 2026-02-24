import os
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from .models import ProcessingJob


def _safe_remove(path: str) -> bool:
    if not path:
        return False
    if not os.path.exists(path):
        return False
    try:
        os.remove(path)
        return True
    except OSError:
        return False


def cleanup_expired_data() -> dict[str, int]:
    now = timezone.now()
    cutoff = now - timedelta(minutes=settings.JOB_TTL_MINUTES)

    expired_jobs = ProcessingJob.objects.filter(
        expires_at__lt=now,
        status__in=["done", "failed"],
    )
    stale_incomplete_jobs = ProcessingJob.objects.filter(
        status__in=["queued", "processing"],
        updated_at__lt=now - timedelta(hours=24),
    )
    active_jobs = ProcessingJob.objects.filter(expires_at__gte=now).only(
        "input_path", "output_path"
    )

    active_paths = set()
    for job in active_jobs:
        if job.input_path:
            active_paths.add(os.path.abspath(job.input_path))
        if job.output_path:
            active_paths.add(os.path.abspath(job.output_path))

    files_deleted = 0
    jobs_deleted = 0

    for job in expired_jobs:
        files_deleted += int(_safe_remove(job.input_path))
        files_deleted += int(_safe_remove(job.output_path))
        job.delete()
        jobs_deleted += 1

    # Cleanup stuck/incomplete jobs only after a long grace window.
    for job in stale_incomplete_jobs:
        files_deleted += int(_safe_remove(job.input_path))
        files_deleted += int(_safe_remove(job.output_path))
        job.delete()
        jobs_deleted += 1

    temp_dir = str(settings.TEMP_DIR)
    if os.path.isdir(temp_dir):
        cutoff_ts = cutoff.timestamp()
        for name in os.listdir(temp_dir):
            path = os.path.abspath(os.path.join(temp_dir, name))
            if not os.path.isfile(path):
                continue
            if path in active_paths:
                continue
            try:
                if os.path.getmtime(path) < cutoff_ts:
                    files_deleted += int(_safe_remove(path))
            except OSError:
                continue

    return {"jobs_deleted": jobs_deleted, "files_deleted": files_deleted}

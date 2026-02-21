import os
import mimetypes
import json
import time
from datetime import timedelta
from io import BytesIO

from django.contrib.auth.views import redirect_to_login
from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.http import FileResponse, Http404, HttpResponse, JsonResponse, StreamingHttpResponse
from django.shortcuts import render
from django.urls import reverse
from django.utils import timezone
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_GET, require_POST
from django_ratelimit.decorators import ratelimit
from PIL import Image

from .models import ProcessingJob
from .cleanup import cleanup_expired_data
from .services import composite_solid_background
from .tasks import process_image
from .validators import validate_upload


STAGE_LABELS = {
    "queued_in_worker": "Queued in worker",
    "loading_image": "Loading image",
    "segmenting_foreground": "Segmenting foreground",
    "refining_edges": "Refining edges",
    "saving_output": "Saving output",
    "complete": "Complete",
    "failed": "Failed",
}


def _stage_label(stage: str) -> str:
    if not stage:
        return ""
    return STAGE_LABELS.get(stage, stage.replace("_", " ").strip().title())


def _get_job_for_request_user(request, job_id):
    try:
        job = ProcessingJob.objects.get(id=job_id)
    except ProcessingJob.DoesNotExist:
        raise Http404
    if not request.user.is_authenticated:
        raise Http404
    if job.user_id and job.user_id != request.user.id and not request.user.is_staff:
        raise Http404
    return job


def _best_effort_cleanup() -> None:
    try:
        cleanup_expired_data()
    except Exception:
        # Cleanup must never block user-facing processing endpoints.
        pass


@require_POST
@ratelimit(key="ip", rate=settings.RATELIMIT_UPLOAD_PER_MIN, block=True)
@ratelimit(key="ip", rate=settings.RATELIMIT_UPLOAD_PER_DAY, block=True)
def upload(request):
    _best_effort_cleanup()
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Login required."}, status=401)
    if "image" not in request.FILES:
        return JsonResponse({"error": "No file uploaded."}, status=400)
    uploaded = request.FILES["image"]
    try:
        validate_upload(uploaded)
    except Exception as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    os.makedirs(settings.TEMP_DIR, exist_ok=True)
    fs = FileSystemStorage(location=settings.TEMP_DIR)
    filename = fs.save(f"{timezone.now().timestamp()}_{uploaded.name}", uploaded)
    input_path = os.path.join(settings.TEMP_DIR, filename)

    job = ProcessingJob.objects.create(
        user=request.user if request.user.is_authenticated else None,
        original_name=uploaded.name,
        input_path=input_path,
        status="queued",
        expires_at=timezone.now() + timedelta(minutes=settings.JOB_TTL_MINUTES),
        bg_color=request.POST.get("bg_color", ""),
    )
    process_image.delay(str(job.id))
    return JsonResponse({"job_id": str(job.id)})


@require_GET
def status(request, job_id):
    _best_effort_cleanup()
    try:
        job = ProcessingJob.objects.get(id=job_id)
    except ProcessingJob.DoesNotExist:
        raise Http404
    data = {
        "status": job.status,
        "stage": _stage_label(job.stage),
        "progress": int(job.progress or 0),
    }
    if job.status == "done":
        data.update(
            {
                "before_url": request.build_absolute_uri(
                    f"/process/preview/{job.id}/before/"
                ),
                "after_url": request.build_absolute_uri(
                    f"/process/preview/{job.id}/after/"
                ),
                "download_url": request.build_absolute_uri(
                    f"/process/download/{job.id}/"
                ),
            }
        )
    if job.status == "failed":
        data["error"] = job.error_message or "Processing failed."
    return JsonResponse(data)


@login_required
@require_GET
def status_stream(request, job_id):
    job = _get_job_for_request_user(request, job_id)

    def stream():
        last_signature = None
        heartbeat_count = 0
        while True:
            job.refresh_from_db(fields=["status", "stage", "progress", "error_message"])
            signature = (job.status, job.stage, int(job.progress or 0))
            if signature != last_signature:
                payload = {
                    "status": job.status,
                    "stage": _stage_label(job.stage),
                    "progress": int(job.progress or 0),
                }
                if job.status == "failed":
                    payload["error"] = job.error_message or "Processing failed."
                yield f"data: {json.dumps(payload)}\n\n"
                last_signature = signature
                if job.status in ("done", "failed"):
                    break
            else:
                heartbeat_count += 1
                if heartbeat_count >= 10:
                    yield ": keep-alive\n\n"
                    heartbeat_count = 0
            time.sleep(1)

    response = StreamingHttpResponse(stream(), content_type="text/event-stream")
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response


@require_GET
def preview(request, job_id, kind):
    try:
        job = ProcessingJob.objects.get(id=job_id)
    except ProcessingJob.DoesNotExist:
        raise Http404
    if kind == "before":
        path = job.input_path
    elif kind == "after":
        path = job.output_path
    else:
        raise Http404
    if not path or not os.path.exists(path):
        raise Http404
    content_type, _ = mimetypes.guess_type(path)
    return FileResponse(open(path, "rb"), content_type=content_type or "application/octet-stream")


def _stream_and_cleanup(path, job):
    with open(path, "rb") as f:
        while True:
            chunk = f.read(8192)
            if not chunk:
                break
            yield chunk
    for p in [job.input_path, job.output_path]:
        if p and os.path.exists(p):
            try:
                os.remove(p)
            except OSError:
                pass
    job.delete()


@require_GET
def download(request, job_id):
    _best_effort_cleanup()
    if not request.user.is_authenticated:
        result_url = reverse("processing:result", args=[job_id])
        preferred_bg = request.GET.get("bg", "").strip()
        if preferred_bg:
            result_url = f"{result_url}?bg={preferred_bg}"
        return redirect_to_login(result_url, login_url=settings.LOGIN_URL)

    try:
        job = ProcessingJob.objects.get(id=job_id)
    except ProcessingJob.DoesNotExist:
        raise Http404
    if job.status != "done" or not job.output_path:
        raise Http404

    bg = request.GET.get("bg", "").strip()
    if bg and bg.lower() != "transparent":
        content = composite_solid_background(job.output_path, bg)
        response = HttpResponse(content, content_type="image/png")
        response["Content-Disposition"] = f"attachment; filename={job.id}.png"
        for p in [job.input_path, job.output_path]:
            if p and os.path.exists(p):
                try:
                    os.remove(p)
                except OSError:
                    pass
        job.delete()
        return response

    response = HttpResponse(
        _stream_and_cleanup(job.output_path, job),
        content_type="image/png",
    )
    response["Content-Disposition"] = f"attachment; filename={job.id}.png"
    return response


@login_required
@require_GET
def result(request, job_id):
    _best_effort_cleanup()
    job = _get_job_for_request_user(request, job_id)

    preferred_bg = request.GET.get("bg", "").strip() or "transparent"
    before_url = f"/process/preview/{job.id}/before/"
    after_url = f"/process/preview/{job.id}/after/"
    return render(
        request,
        "processing/result.html",
        {
            "job": job,
            "preferred_bg": preferred_bg,
            "before_url": before_url,
            "after_url": after_url,
            "save_edit_url": f"/process/edit/{job.id}/save/",
            "download_transparent_url": f"/process/download/{job.id}/?bg=transparent",
            "download_solid_url": f"/process/download/{job.id}/?bg={preferred_bg if preferred_bg != 'transparent' else '#0b0b10'}",
        },
    )


@login_required
@require_POST
def save_edit(request, job_id):
    job = _get_job_for_request_user(request, job_id)
    if job.status != "done" or not job.output_path or not os.path.exists(job.output_path):
        return JsonResponse({"error": "Result is not ready for editing."}, status=400)
    if "edited_image" not in request.FILES:
        return JsonResponse({"error": "No edited image provided."}, status=400)

    try:
        edited_file = request.FILES["edited_image"]
        with Image.open(edited_file) as img:
            edited = img.convert("RGBA")
        with Image.open(job.output_path) as current:
            base_size = current.size
        if edited.size != base_size:
            edited = edited.resize(base_size, Image.LANCZOS)

        buf = BytesIO()
        edited.save(buf, format="PNG")
        with open(job.output_path, "wb") as out:
            out.write(buf.getvalue())
    except Exception:
        return JsonResponse({"error": "Could not save edited image."}, status=400)

    cache_key = int(timezone.now().timestamp())
    return JsonResponse(
        {
            "ok": True,
            "after_url": f"/process/preview/{job.id}/after/?v={cache_key}",
            "download_transparent_url": f"/process/download/{job.id}/?bg=transparent",
            "download_solid_url": f"/process/download/{job.id}/?bg={(job.bg_color or '#0b0b10')}",
        }
    )

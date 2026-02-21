from django.conf import settings


def core_defaults(request):
    return {
        "app_name": "ihatebackground",
        "free_daily_limit": settings.FREE_DAILY_LIMIT,
        "job_ttl_minutes": settings.JOB_TTL_MINUTES,
    }

def get_request_identifier(request):
    if request.user.is_authenticated:
        return f"user:{request.user.id}"
    ip = request.META.get("REMOTE_ADDR", "unknown")
    return f"ip:{ip}"

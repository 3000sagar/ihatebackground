def user_header_profile(request):
    if not request.user.is_authenticated:
        return {}

    user = request.user
    raw_name = (getattr(user, "name", "") or "").strip()
    if raw_name:
        first_name = raw_name.split()[0]
    else:
        email = (getattr(user, "email", "") or "").strip()
        first_name = (email.split("@")[0] if "@" in email else email) or "there"

    avatar_url = ""
    try:
        social_auth = user.social_auth.first()
        if social_auth and isinstance(social_auth.extra_data, dict):
            avatar_url = (
                social_auth.extra_data.get("picture")
                or social_auth.extra_data.get("avatar_url")
                or ""
            )
    except Exception:
        avatar_url = ""

    return {
        "header_first_name": first_name,
        "header_avatar_url": avatar_url,
        "header_initial": first_name[:1].upper() if first_name else "U",
    }

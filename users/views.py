from django.contrib.auth import login, logout
from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect, render
from django.utils.http import url_has_allowed_host_and_scheme

from .forms import LoginForm, SignupForm


def _get_safe_next(request):
    next_url = request.POST.get("next") or request.GET.get("next")
    if next_url and url_has_allowed_host_and_scheme(
        next_url, allowed_hosts={request.get_host()}, require_https=request.is_secure()
    ):
        return next_url
    return ""


def signup(request):
    next_url = _get_safe_next(request)
    if request.user.is_authenticated:
        return redirect(next_url or "core:landing")

    if request.method == "POST":
        form = SignupForm(request.POST)
        if form.is_valid():
            user = form.save()
            login(request, user, backend="django.contrib.auth.backends.ModelBackend")
            return redirect(next_url or "core:landing")
    else:
        form = SignupForm()
    return render(request, "users/signup.html", {"form": form, "next_url": next_url})


def user_login(request):
    next_url = _get_safe_next(request)
    if request.user.is_authenticated:
        return redirect(next_url or "core:landing")

    if request.method == "POST":
        form = LoginForm(request.POST, request=request)
        if form.is_valid():
            login(request, form.cleaned_data["user"])
            return redirect(next_url or "core:landing")
    else:
        form = LoginForm(request=request)
    return render(request, "users/login.html", {"form": form, "next_url": next_url})


@login_required
def user_logout(request):
    logout(request)
    return redirect("core:landing")

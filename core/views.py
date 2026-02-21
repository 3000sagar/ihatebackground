from django.http import JsonResponse
from django.shortcuts import redirect, render


def landing(request):
    return render(request, "core/landing.html")


def pricing(request):
    return redirect("core:landing")


def privacy(request):
    return render(request, "core/privacy.html")


def status(request):
    return JsonResponse({"status": "ok"})

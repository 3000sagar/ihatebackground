from django.urls import path

from . import views

app_name = "core"

urlpatterns = [
    path("", views.landing, name="landing"),
    path("pricing/", views.pricing, name="pricing"),
    path("privacy/", views.privacy, name="privacy"),
    path("status/", views.status, name="status"),
]

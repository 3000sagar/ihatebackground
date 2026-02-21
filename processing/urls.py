from django.urls import path

from . import views

app_name = "processing"

urlpatterns = [
    path("upload/", views.upload, name="upload"),
    path("status/<uuid:job_id>/", views.status, name="status"),
    path("status-stream/<uuid:job_id>/", views.status_stream, name="status_stream"),
    path("result/<uuid:job_id>/", views.result, name="result"),
    path("edit/<uuid:job_id>/save/", views.save_edit, name="save_edit"),
    path("preview/<uuid:job_id>/<str:kind>/", views.preview, name="preview"),
    path("download/<uuid:job_id>/", views.download, name="download"),
]

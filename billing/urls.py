from django.urls import path

from . import views

app_name = "billing"

urlpatterns = [
    path("stripe/checkout/", views.stripe_checkout, name="stripe_checkout"),
    path("stripe/webhook/", views.stripe_webhook, name="stripe_webhook"),
    path("razorpay/checkout/", views.razorpay_checkout, name="razorpay_checkout"),
    path("razorpay/verify/", views.razorpay_verify, name="razorpay_verify"),
    path("razorpay/webhook/", views.razorpay_webhook, name="razorpay_webhook"),
    path("success/", views.success, name="success"),
    path("cancel/", views.cancel, name="cancel"),
]

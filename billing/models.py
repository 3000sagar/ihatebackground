from django.conf import settings
from django.db import models


class Subscription(models.Model):
    PROVIDER_CHOICES = [("stripe", "Stripe"), ("razorpay", "Razorpay")]
    STATUS_CHOICES = [("active", "Active"), ("past_due", "Past Due"), ("canceled", "Canceled")]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    provider = models.CharField(max_length=16, choices=PROVIDER_CHOICES)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES)
    plan = models.CharField(max_length=32, default="pro")
    provider_customer_id = models.CharField(max_length=128, blank=True)
    provider_subscription_id = models.CharField(max_length=128, blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user_id} {self.provider} {self.status}"

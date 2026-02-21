from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models

from .managers import UserManager


class User(AbstractBaseUser, PermissionsMixin):
    PLAN_CHOICES = [("free", "Free"), ("pro", "Pro")]

    email = models.EmailField(unique=True)
    name = models.CharField(max_length=120, blank=True)
    plan = models.CharField(max_length=16, choices=PLAN_CHOICES, default="free")
    full_access_override = models.BooleanField(
        default=False,
        help_text="Grant full Pro features from admin regardless of subscription status.",
    )
    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    date_joined = models.DateTimeField(auto_now_add=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    def __str__(self):
        return self.email


class DailyUsage(models.Model):
    identifier = models.CharField(max_length=128)
    date = models.DateField()
    count = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = ("identifier", "date")

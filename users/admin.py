from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import DailyUsage, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ("email",)
    list_display = ("email", "plan", "full_access_override", "is_staff", "is_active")
    list_filter = ("plan", "full_access_override", "is_staff", "is_active")
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Profile", {"fields": ("name", "plan", "full_access_override")}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("email", "password1", "password2", "is_staff", "is_superuser")}),
    )
    search_fields = ("email",)
    actions = ("grant_full_access", "revoke_full_access")

    @admin.action(description="Grant full access override to selected users")
    def grant_full_access(self, request, queryset):
        queryset.update(full_access_override=True)

    @admin.action(description="Revoke full access override from selected users")
    def revoke_full_access(self, request, queryset):
        queryset.update(full_access_override=False)


@admin.register(DailyUsage)
class DailyUsageAdmin(admin.ModelAdmin):
    list_display = ("identifier", "date", "count")

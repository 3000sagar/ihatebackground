from django.utils.deprecation import MiddlewareMixin


class PlanEnforcementMiddleware(MiddlewareMixin):
    def process_request(self, request):
        if request.user.is_authenticated:
            # Free-for-all mode: all authenticated users get full features.
            request.plan = "pro"
        else:
            request.plan = "free"

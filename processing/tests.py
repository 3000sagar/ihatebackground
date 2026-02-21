from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse

from billing.models import Subscription


def tiny_png_file(name="test.png"):
    # 1x1 transparent PNG
    content = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\x0bIDATx\x9cc``\x00"
        b"\x00\x00\x03\x00\x01h&Y\r\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    return SimpleUploadedFile(name, content, content_type="image/png")


@override_settings(
    FREE_DAILY_LIMIT=5,
    RATELIMIT_ENABLE=False,
)
class UploadLimitTests(TestCase):
    def setUp(self):
        self.url = reverse("processing:upload")
        self.User = get_user_model()

    @patch("processing.views.process_image.delay")
    def test_anonymous_user_is_limited_to_free_daily_limit(self, mocked_delay):
        for _ in range(5):
            response = self.client.post(self.url, {"image": tiny_png_file()})
            self.assertEqual(response.status_code, 200)
        blocked = self.client.post(self.url, {"image": tiny_png_file()})
        self.assertEqual(blocked.status_code, 429)
        self.assertIn("Free limit reached", blocked.json().get("error", ""))
        self.assertEqual(mocked_delay.call_count, 5)

    @patch("processing.views.process_image.delay")
    def test_authenticated_free_user_is_limited(self, mocked_delay):
        user = self.User.objects.create_user(
            email="free@example.com",
            password="testpass123",
            plan="free",
        )
        self.client.force_login(user)
        for _ in range(5):
            response = self.client.post(self.url, {"image": tiny_png_file()})
            self.assertEqual(response.status_code, 200)
        blocked = self.client.post(self.url, {"image": tiny_png_file()})
        self.assertEqual(blocked.status_code, 429)
        self.assertIn("Free limit reached", blocked.json().get("error", ""))
        self.assertEqual(mocked_delay.call_count, 5)

    @patch("processing.views.process_image.delay")
    def test_authenticated_pro_user_is_not_limited(self, mocked_delay):
        user = self.User.objects.create_user(
            email="pro@example.com",
            password="testpass123",
            plan="pro",
        )
        Subscription.objects.create(
            user=user,
            provider="stripe",
            status="active",
            plan="pro",
        )
        self.client.force_login(user)
        for _ in range(7):
            response = self.client.post(self.url, {"image": tiny_png_file()})
            self.assertEqual(response.status_code, 200)
        self.assertEqual(mocked_delay.call_count, 7)

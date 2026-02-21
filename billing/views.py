import json
from datetime import timedelta

import razorpay
import stripe
from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse, HttpResponseBadRequest, JsonResponse
from django.shortcuts import redirect, render
from django.utils import timezone
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import csrf_exempt

from users.models import User

from .models import Subscription


def _activate_user_subscription(user, provider, subscription_id="", customer_id=""):
    period_end = timezone.now() + timedelta(hours=settings.PRO_ACCESS_HOURS)
    existing = Subscription.objects.filter(user=user, provider=provider).order_by("-id").first()
    if existing:
        existing.status = "active"
        existing.plan = "pro"
        existing.provider_subscription_id = subscription_id
        existing.provider_customer_id = customer_id
        existing.current_period_end = period_end
        existing.save(
            update_fields=[
                "status",
                "plan",
                "provider_subscription_id",
                "provider_customer_id",
                "current_period_end",
            ]
        )
    else:
        Subscription.objects.create(
            user=user,
            provider=provider,
            status="active",
            plan="pro",
            provider_subscription_id=subscription_id,
            provider_customer_id=customer_id,
            current_period_end=period_end,
        )
    user.plan = "pro"
    user.save(update_fields=["plan"])


@login_required
def stripe_checkout(request):
    if not settings.STRIPE_SECRET_KEY or not settings.STRIPE_PRICE_ID:
        return HttpResponse("Stripe not configured.", status=500)
    stripe.api_key = settings.STRIPE_SECRET_KEY
    session = stripe.checkout.Session.create(
        mode="subscription",
        line_items=[{"price": settings.STRIPE_PRICE_ID, "quantity": 1}],
        customer_email=request.user.email,
        success_url=request.build_absolute_uri("/billing/success/"),
        cancel_url=request.build_absolute_uri("/billing/cancel/"),
    )
    return redirect(session.url)


@login_required
def razorpay_checkout(request):
    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
        return HttpResponse("Razorpay not configured.", status=500)
    client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
    amount = settings.RAZORPAY_PLAN_AMOUNT
    order = client.order.create(
        {
            "amount": amount,
            "currency": "INR",
            "payment_capture": 1,
            "notes": {"user_id": str(request.user.id), "email": request.user.email},
        }
    )
    return render(
        request,
        "billing/razorpay_checkout.html",
        {
            "razorpay_key": settings.RAZORPAY_KEY_ID,
            "order_id": order["id"],
            "amount": amount,
            "display_amount": amount / 100,
            "user_email": request.user.email,
            "user_name": request.user.name or request.user.email.split("@")[0],
        },
    )


@login_required
@require_POST
def razorpay_verify(request):
    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
        return JsonResponse({"ok": False, "error": "Razorpay is not configured."}, status=500)

    payment_id = (request.POST.get("razorpay_payment_id") or "").strip()
    order_id = (request.POST.get("razorpay_order_id") or "").strip()
    signature = (request.POST.get("razorpay_signature") or "").strip()
    if not payment_id or not order_id or not signature:
        return JsonResponse({"ok": False, "error": "Missing payment details."}, status=400)

    client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
    try:
        client.utility.verify_payment_signature(
            {
                "razorpay_order_id": order_id,
                "razorpay_payment_id": payment_id,
                "razorpay_signature": signature,
            }
        )
    except Exception:
        return JsonResponse({"ok": False, "error": "Payment verification failed."}, status=400)

    _activate_user_subscription(
        request.user,
        provider="razorpay",
        subscription_id=payment_id,
        customer_id=order_id,
    )
    return JsonResponse({"ok": True, "redirect": "/billing/success/"})


@csrf_exempt
def stripe_webhook(request):
    payload = request.body
    sig_header = request.headers.get("Stripe-Signature")
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except Exception:
        return HttpResponseBadRequest("Invalid signature.")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        email = session.get("customer_email")
        if email:
            user = User.objects.filter(email=email).first()
            if user:
                _activate_user_subscription(
                    user,
                    provider="stripe",
                    subscription_id=session.get("subscription") or "",
                    customer_id=session.get("customer") or "",
                )
    elif event["type"] == "customer.subscription.deleted":
        sub = event["data"]["object"]
        Subscription.objects.filter(
            provider="stripe", provider_subscription_id=sub.get("id")
        ).update(status="canceled")
    return HttpResponse(status=200)


@csrf_exempt
def razorpay_webhook(request):
    if not settings.RAZORPAY_WEBHOOK_SECRET:
        return HttpResponse(status=200)
    body = request.body.decode()
    signature = request.headers.get("X-Razorpay-Signature")
    client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
    try:
        client.utility.verify_webhook_signature(body, signature, settings.RAZORPAY_WEBHOOK_SECRET)
    except Exception:
        return HttpResponseBadRequest("Invalid signature.")

    event = json.loads(body)
    if event.get("event") == "payment.captured":
        payment = event["payload"]["payment"]["entity"]
        notes = payment.get("notes") or {}
        user = None

        user_id = notes.get("user_id")
        if user_id:
            user = User.objects.filter(id=user_id).first()
        if not user:
            email = payment.get("email")
            if email:
                user = User.objects.filter(email=email).first()
        if user:
            _activate_user_subscription(
                user,
                provider="razorpay",
                subscription_id=payment.get("id", ""),
                customer_id=payment.get("order_id", ""),
            )
    return HttpResponse(status=200)


def success(request):
    return render(request, "billing/success.html")


def cancel(request):
    return render(request, "billing/cancel.html")

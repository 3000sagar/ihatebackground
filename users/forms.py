from django import forms
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password

from .models import User


class SignupForm(forms.ModelForm):
    password1 = forms.CharField(widget=forms.PasswordInput)
    password2 = forms.CharField(widget=forms.PasswordInput)

    class Meta:
        model = User
        fields = ("email", "name")

    def clean_email(self):
        email = (self.cleaned_data.get("email") or "").strip().lower()
        if not email:
            return email

        qs = User.objects.filter(email__iexact=email)
        if self.instance.pk:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise forms.ValidationError("An account with this email already exists.")

        return email

    def clean_password1(self):
        password = self.cleaned_data.get("password1")
        validate_password(password)
        return password

    def clean(self):
        cleaned = super().clean()
        password1 = cleaned.get("password1")
        password2 = cleaned.get("password2")
        if password1 and password2 and password1 != password2:
            self.add_error("password2", "Passwords do not match.")
        return cleaned

    def save(self, commit=True):
        user = super().save(commit=False)
        user.email = (self.cleaned_data["email"] or "").lower()
        user.set_password(self.cleaned_data["password1"])
        if commit:
            user.save()
        return user


class LoginForm(forms.Form):
    email = forms.EmailField()
    password = forms.CharField(widget=forms.PasswordInput)

    def __init__(self, *args, request=None, **kwargs):
        self.request = request
        super().__init__(*args, **kwargs)

    def clean_email(self):
        return (self.cleaned_data.get("email") or "").strip().lower()

    def clean(self):
        cleaned = super().clean()
        email = cleaned.get("email")
        password = cleaned.get("password")
        if not email or not password:
            return cleaned

        user = authenticate(self.request, email=email, password=password)
        if not user:
            user = authenticate(self.request, username=email, password=password)
        if not user:
            raise forms.ValidationError("Invalid credentials.")
        if not user.is_active:
            raise forms.ValidationError("This account is inactive.")
        cleaned["user"] = user
        return cleaned

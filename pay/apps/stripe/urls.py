from django.urls import path

from .views import index, pay, generate_response, fetch_key

urlpatterns = [
    path('', index, name='index'),
    path('stripe/stripe-key/', fetch_key, name='fetch_key'),
    path('stripe/pay/', pay, name='pay'),
]

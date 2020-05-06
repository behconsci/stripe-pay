import os
import json

import stripe

from django.shortcuts import render, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings

stripe.api_key = settings.STRIPE_SECRET_KEY
stripe.api_version = settings.STRIPE_API_VERSION


def index(request):
    # Display checkout page

    payment_methods = []
    if request.user.is_authenticated and request.user.stripe_id:
        payment_methods = stripe.PaymentMethod.list(
            customer=request.user.stripe_id,
            type="card",
        )
    return render(request, 'index.html', {'payment_methods': payment_methods})


def fetch_key(request):
    # Send publishable key to client
    return HttpResponse(json.dumps({'publicKey': settings.STRIPE_PUBLISHABLE_KEY}))


@csrf_exempt
def pay(request):
    data = json.loads(request.body.decode('utf-8'))
    try:
        order_amount = 1400
        payment_intent_data = dict(
            amount=order_amount,
            currency=data['currency'],
            payment_method=data['paymentMethodId'],
            confirmation_method='automatic',
            confirm=True,
            payment_method_options={'card': {'request_three_d_secure': 'any'}}
        )

        using_saved_card = data.get('usingSavedCard', False)
        if using_saved_card:
            payment_intent_data['customer'] = request.user.stripe_id

        if data.get('isSavingCard') and not using_saved_card:
            if not request.user.stripe_id:
                customer = stripe.Customer.create()
                request.user.stripe_id = customer['id']
                request.user.save()

            payment_intent_data['customer'] = request.user.stripe_id
            payment_intent_data['setup_future_usage'] = 'off_session'

        # Create a new PaymentIntent for the order
        intent = stripe.PaymentIntent.create(**payment_intent_data)
        return generate_response(intent)
    except Exception as e:
        return HttpResponse(json.dumps({'error': str(e)}), status=403)


def generate_response(intent):
    status = intent['status']
    if status == 'requires_action' or status == 'requires_source_action':
        # Card requires authentication
        return HttpResponse(json.dumps(
            {
                'requiresAction': True,
                'paymentIntentId': intent['id'],
                'clientSecret': intent['client_secret']
            }
        ))
    elif status == 'requires_payment_method' or status == 'requires_source':
        # Card was not properly authenticated, suggest a new payment method
        return HttpResponse(json.dumps({'error': 'Your card was denied, please provide a new payment method'}))
    elif status == 'succeeded':
        # Payment is complete, authentication not required
        # To cancel the payment after capture you will need to issue a Refund (https://stripe.com/docs/api/refunds)
        print("💰 Payment received!")
        return HttpResponse(json.dumps({'clientSecret': intent['client_secret']}))

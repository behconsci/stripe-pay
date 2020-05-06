"use strict";

var stripe;

var orderData = {
    items: [{id: "photo-subscription"}],
    currency: "usd"
};

fetch("/stripe/stripe-key/")
    .then(function (result) {
        return result.json();
    })
    .then(function (data) {
        return setupElements(data);
    })
    .then(function ({stripe, card, clientSecret}) {
        document.querySelector("#submit").addEventListener("click", function (evt) {
            evt.preventDefault();
            pay(stripe, card, clientSecret);
        });
    });

var setupElements = function (data) {
    stripe = Stripe(data.publicKey);
    /* ------- Set up Stripe Elements to use in checkout form ------- */
    var elements = stripe.elements();
    var style = {
        base: {
            color: "#32325d",
            fontFamily: '"Helvetica Neue", Helvetica, sans-serif',
            fontSmoothing: "antialiased",
            fontSize: "14px",
            "::placeholder": {
                color: "#aab7c4"
            }
        },
        invalid: {
            color: "#fa755a",
            iconColor: "#fa755a"
        }
    };

    var card = elements.create("card", {style: style});
    card.mount("#card-element");

    card.on('focus', function (event) {
        document.querySelector('#new-card-radio').checked = true;
    });

    return {
        stripe,
        card,
        clientSecret: data.clientSecret
    };
};

var handleAction = function (clientSecret, card, paymentMethodId) {
    // here we have to re-mount the element
    var data;

    if (paymentMethodId) {
        data = {
            'payment_method': paymentMethodId
        };
    } else {
        data = {
            'payment_method': {
                'card': card,
            }
        };
    }

    // Show the authentication modal if the PaymentIntent has a status of "requires_action"
    stripe.confirmCardPayment(clientSecret, data).then(function (data) {
        if (data.error) {
            showError(data.error.message);
        } else if (data.paymentIntent.status === "succeeded") {
            // Card was properly authenticated, we can attempt to confirm the payment again with the same PaymentIntent
            orderComplete(clientSecret);
        }
    });
};


/*
 * Collect card details and pay for the order 
 */
var pay = function (stripe, card) {

    // var cardholderName = document.querySelector("#name").value;
    var data = {
        billing_details: {}
    };

    changeLoadingState(true);

    var saved_card_radio_btn = document.querySelector('input[name="payment-source"]:checked');
    if (saved_card_radio_btn.value === 'new-card') {
        // new card, so use createPaymentMethod
        stripe.createPaymentMethod("card", card, data)
            .then(function (result) {
                if (result.error) {
                    showError(result.error.message);
                } else {
                    orderData.paymentMethodId = result.paymentMethod.id;
                    if (document.querySelector("#save-card")) {
                        orderData.isSavingCard = document.querySelector("#save-card").checked;
                    }
                    orderData.csrfmiddlewaretoken = window.csrf_token;

                    return fetch("/stripe/pay/", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify(orderData)
                    });
                }
            })
            .then(function (result) {
                return result.json();
            })
            .then(function (paymentData) {
                if (paymentData.requiresAction) {
                    // Request authentication
                    handleAction(paymentData.clientSecret, card);
                } else if (paymentData.error) {
                    showError(paymentData.error);
                } else {
                    orderComplete(paymentData.clientSecret);
                }
            });
    } else {
        // using previous card, so just pass payment method id
        orderData.paymentMethodId = saved_card_radio_btn.value;
        orderData.usingSavedCard = true;
        orderData.csrfmiddlewaretoken = window.csrf_token;

        fetch("/stripe/pay/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(orderData)
        }).then(function (result) {
            return result.json();
        }).then(function (paymentData) {
            if (paymentData.requiresAction) {
                // Request authentication
                handleAction(paymentData.clientSecret, card, saved_card_radio_btn.value);
            } else if (paymentData.error) {
                showError(paymentData.error);
            } else {
                orderComplete(paymentData.clientSecret);
            }
        });
    }
};

/* ------- Post-payment helpers ------- */

/* Shows a success / error message when the payment is complete */
var orderComplete = function (clientSecret) {
    stripe.retrievePaymentIntent(clientSecret).then(function (result) {
        var paymentIntent = result.paymentIntent;
        var paymentIntentJson = JSON.stringify(paymentIntent, null, 2);
        document.querySelectorAll(".payment-view").forEach(function (view) {
            view.classList.add("hidden");
        });
        document.querySelector(".status").textContent =
            paymentIntent.status === "succeeded" ? "succeeded" : "failed";
    });
};

var showError = function (errorMsgText) {
    changeLoadingState(false);
    var errorMsg = document.querySelector(".sr-field-error");
    errorMsg.textContent = errorMsgText;

    // hide error message after 10 seconds
    setTimeout(function () {
        errorMsg.textContent = "";
    }, 10000);
};

// Show a spinner on payment submission
var changeLoadingState = function (isLoading) {
    if (isLoading) {
        document.querySelector("button").disabled = true;
        document.querySelector("#button-text").innerText = 'Please wait ...';
    } else {
        document.querySelector("button").disabled = false;
        document.querySelector("#button-text").innerText = 'Pay';
    }
};

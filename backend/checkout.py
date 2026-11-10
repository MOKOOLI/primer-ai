import stripe
import os

stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "sk_test_...")

# این تابع در آینده برای ساخت لینک پرداخت استفاده می‌شود
def create_checkout_session(email: str, price_id: str):
    try:
        session = stripe.checkout.Session.create(
            payment_method_types=['card'],
            line_items=[{'price': price_id, 'quantity': 1}],
            mode='subscription',
            success_url='https://primer-ai-nu.vercel.app/success',
            cancel_url='https://primer-ai-nu.vercel.app/cancel',
            customer_email=email,
        )
        return session.url
    except Exception as e:
        return str(e)

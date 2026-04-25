"""
Seller example: FastAPI endpoint protected by Circle Gateway x402.

Run: uvicorn examples.seller:app --port 3020
Env: SELLER_PRIVATE_KEY=0x..., SELLER_ADDRESS=0x...
"""
import os
import sys
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent))

from fastapi import FastAPI, Depends, Request
from fastapi.responses import JSONResponse
from pay2play_arc.middleware import create_gateway_middleware, PaymentGate

app = FastAPI(title="pay2play_arc seller demo")

PAY_TO = os.getenv("SELLER_ADDRESS", "0x0077777d7EBA4688BDeF3E311b846F25870A19B9")

# $0.001 per weather request
weather_gate = create_gateway_middleware(pay_to=PAY_TO, price="$0.001", description="Weather data")

# $0.002 per premium analysis
analysis_gate = create_gateway_middleware(pay_to=PAY_TO, price="$0.002", description="Premium analysis")


@app.get("/weather")
async def weather(request: Request, payment: PaymentGate = Depends(lambda r=None: weather_gate(r))):
    return {
        "temperature": 72,
        "conditions": "sunny",
        "paid_by": payment.payer,
        "tx": payment.transaction,
    }


@app.get("/analysis")
async def analysis(request: Request, payment: PaymentGate = Depends(lambda r=None: analysis_gate(r))):
    return {
        "sentiment": "positive",
        "confidence": 0.92,
        "paid_by": payment.payer,
        "amount": payment.amount,
    }


@app.get("/")
async def root():
    return {
        "service": "pay2play_arc seller demo",
        "endpoints": [
            "GET /weather  ($0.001)",
            "GET /analysis ($0.002)",
        ],
    }

"""
Cart route controller for checkout endpoint.
Delegates HTTP payloads to order processing.
"""
from typing import Dict, Any
from order_service import process_order


def handle_checkout(cart: Dict[str, Any]) -> Dict[str, Any]:
    """Handles POST /api/checkout."""
    # Line 12: Frame matching stack trace log
    return process_order(cart)

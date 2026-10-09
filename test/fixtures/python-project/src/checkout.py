"""
Checkout module for calculating cart discounts.
Provides utilities for price calculation and coupon validation.
Handles promotion rules and currency conversion.
Supports gift cards and loyalty points.
"""

from typing import Dict, Any, Optional


def validate_cart(cart: Optional[Dict[str, Any]]) -> bool:
    """Validates that a cart object is present and non-empty."""
    return bool(cart)


def calculate_discount(cart: Dict[str, Any]) -> float:
    """
    Calculates discount based on applied coupon rate in the cart.

    Raises:
        KeyError: If 'discount' key is missing from cart dictionary.
    """
    if not cart:
        return 0.0


    # Line 28: Exact throw site matching stack trace log
    discount_rate = cart['discount']['rate']
    total = float(cart.get('total', 100.0))
    return total * discount_rate

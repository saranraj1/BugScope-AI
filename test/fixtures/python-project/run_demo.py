"""Demonstration runner for the Python project fixture."""
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), 'src')))

from routes.cart import handle_checkout

if __name__ == '__main__':
    cart = {'items': ['Laptop'], 'total': 1200.0}
    print("Executing handle_checkout without 'discount' key...")
    try:
        handle_checkout(cart)
    except KeyError as exc:
        print(f"Caught expected KeyError: {exc}")
        print("Traceback generated successfully for BugScope AI analysis.")

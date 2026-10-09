# Python Checkout Sample Project

This sample project is used to test BugScope AI's native Python dependency resolution, stack trace analysis, and test suite discovery.

## Structure
- `src/checkout.py`: Calculates discounts based on cart coupons (raises `KeyError` if coupon is missing).
- `src/order_service.py`: Orchestrates checkout pipeline and imports `checkout.py`.
- `src/routes/cart.py`: Web route handler importing `order_service.py`.
- `tests/test_checkout.py`: Python `unittest` suite covering `calculate_discount`.

## Running the Unit Tests
```bash
python -m unittest discover -s tests -p "test_*.py"
```

## Running the Demo
```bash
python run_demo.py
```

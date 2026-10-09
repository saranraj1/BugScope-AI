"""Unit test suite for checkout calculation using Python native unittest."""
import unittest
import sys
import os

# Add src to sys.path for native python test execution
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))

from checkout import calculate_discount


class TestCheckout(unittest.TestCase):
    def test_empty_cart(self):
        self.assertEqual(calculate_discount({}), 0.0)

    def test_valid_discount(self):
        cart = {'total': 100.0, 'discount': {'rate': 0.15}}
        self.assertEqual(calculate_discount(cart), 15.0)

    def test_missing_discount_raises_key_error(self):
        cart = {'total': 100.0}
        with self.assertRaises(KeyError):
            calculate_discount(cart)


if __name__ == '__main__':
    unittest.main()

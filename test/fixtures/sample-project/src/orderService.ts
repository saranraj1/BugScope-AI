import { calculateDiscount, ShoppingCart } from './checkout';

export interface OrderResult {
  orderId: string;
  total: number;
}

export function processOrder(cart: ShoppingCart): OrderResult {
  const discount = calculateDiscount(cart);
  const subtotal = cart.items.reduce((s, i) => s + i.price, 0);

  return {
    orderId: 'ORD-' + Math.floor(Math.random() * 10000),
    total: Math.max(0, subtotal - discount)
  };
}

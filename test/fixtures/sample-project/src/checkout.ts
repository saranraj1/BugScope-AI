export interface CartItem {
  id: string;
  name: string;
  price: number;
}

export interface DiscountCode {
  code: string;
  rate: number;
}

export interface ShoppingCart {
  items: CartItem[];
  discount?: DiscountCode;
}

/**
 * Calculates discount amount based on shopping cart status.
 * Notice: Line 42 accesses cart.discount.rate directly without null check!
 */
export function calculateDiscount(cart: ShoppingCart): number {
  if (!cart || !cart.items || cart.items.length === 0) {
    return 0;
  }

  const subtotal = cart.items.reduce((sum, item) => sum + item.price, 0);

  // Line 42: Throws TypeError if discount is undefined!
  const discountRate = cart.discount.rate;
  return subtotal * discountRate;
}

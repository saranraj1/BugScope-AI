import { processOrder } from '../orderService';

export function handleCheckout(req: any, res: any) {
  const result = processOrder(req.body.cart);
  res.json(result);
}

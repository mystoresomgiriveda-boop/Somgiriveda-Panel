export interface Order {
  id: string;
  orderId: string;
  customerName: string;
  amount: number;
  status: 'pending' | 'delivered' | 'rto_success' | 'cancelled';
  courierName: string;
  date: string;
  createdAt?: any;
}

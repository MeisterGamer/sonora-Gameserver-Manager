export type ContractStatus = 'active' | 'expiring_soon' | 'grace_period' | 'suspended';

export interface CustomerContract {
  id: string;
  customerId: string;
  customerName: string;
  serverId: string;
  serverName: string;
  gameName: string;
  planName: string;
  monthlyPrice: number;
  startDate: string;
  expiresAt: string; // ISO date string
  daysRemaining: number;
  autoRenew: boolean;
  status: ContractStatus;
  location: string;
  ipAddress: string;
}

export interface CustomerProfile {
  id: string;
  username: string;
  fullName: string;
  company?: string;
  email: string;
  phone: string;
  street: string;
  zipCity: string;
  country: string;
  balance: number; // in Euros
  totalSpent: number;
  customerNumber: string;
  registeredAt: string;
  status: 'active' | 'suspended';
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerAddress: string;
  date: string;
  dueDate: string;
  paidDate?: string;
  items: InvoiceItem[];
  subtotal: number;
  taxRate: number; // 0.19 for 19% MwSt.
  taxAmount: number;
  total: number;
  status: 'paid' | 'pending' | 'cancelled';
  paymentMethod: string;
  transactionReference: string;
}

export interface SupportTicketMessage {
  id: string;
  sender: 'customer' | 'support';
  author: string;
  timestamp: string;
  text: string;
}

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  customerId: string;
  customerName: string;
  serverName?: string;
  subject: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'closed';
  createdAt: string;
  updatedAt: string;
  messages: SupportTicketMessage[];
}

export interface PaymentTransaction {
  id: string;
  customerId: string;
  amount: number;
  method: 'PayPal' | 'Kreditkarte' | 'Sofort / Klarna' | 'Paysafecard' | 'Krypto (BTC/ETH)' | 'SEPA Prepaid';
  timestamp: string;
  reference: string;
  status: 'completed' | 'pending' | 'failed';
  note: string;
}

export interface ExpiryNotification {
  id: string;
  contractId: string;
  serverName: string;
  type: 'warning_7d' | 'warning_3d' | 'grace_period' | 'renewed' | 'suspended';
  daysLeft: number;
  timestamp: string;
  message: string;
  read: boolean;
}

import { 
  CustomerProfile, 
  CustomerContract, 
  Invoice, 
  SupportTicket, 
  PaymentTransaction, 
  ExpiryNotification 
} from '../types/crm';

const CONTRACTS_STORAGE_KEY = 'apexhost_contracts_data';
const CUSTOMERS_STORAGE_KEY = 'apexhost_customers_data';
const INVOICES_STORAGE_KEY = 'apexhost_invoices_data';
const TICKETS_STORAGE_KEY = 'apexhost_tickets_data';
const TRANSACTIONS_STORAGE_KEY = 'apexhost_transactions_data';
const NOTIFICATIONS_STORAGE_KEY = 'apexhost_notifications_data';

export const INITIAL_CUSTOMERS: CustomerProfile[] = [
  {
    id: 'usr_dominik',
    username: 'Dominik',
    fullName: 'Dominik Neumayer',
    company: 'PixelCraft Studios',
    email: 'dominik.neumail@gmail.com',
    phone: '+49 170 8829104',
    street: 'Kaiserstraße 42',
    zipCity: '60311 Frankfurt am Main',
    country: 'Deutschland',
    balance: 45.00,
    totalSpent: 124.90,
    customerNumber: 'KD-2026-1049',
    registeredAt: '2026-03-20',
    status: 'active'
  },
  {
    id: 'usr_gamer99',
    username: 'PixelWarrior',
    fullName: 'Markus Weber',
    email: 'warrior@games.de',
    phone: '+49 152 4910283',
    street: 'Bahnhofstraße 12',
    zipCity: '80335 München',
    country: 'Deutschland',
    balance: 12.50,
    totalSpent: 49.95,
    customerNumber: 'KD-2026-1050',
    registeredAt: '2026-06-10',
    status: 'active'
  },
  {
    id: 'usr_clan_ev',
    username: 'EsportsCommunity',
    fullName: 'Apex Legends Germany e.V.',
    company: 'Apex e.V.',
    email: 'leitung@apex-clan.de',
    phone: '+49 30 9182301',
    street: 'Friedrichstraße 180',
    zipCity: '10117 Berlin',
    country: 'Deutschland',
    balance: 89.00,
    totalSpent: 380.00,
    customerNumber: 'KD-2026-1051',
    registeredAt: '2026-01-10',
    status: 'active'
  }
];

export const INITIAL_CONTRACTS: CustomerContract[] = [
  {
    id: 'cnt_001',
    customerId: 'usr_dominik',
    customerName: 'Dominik Neumayer',
    serverId: 'srv_paper_smp',
    serverName: 'Survival SMP Season 4',
    gameName: 'Minecraft 26.3 (PaperMC)',
    planName: 'Minecraft Cloud (v26.3)',
    monthlyPrice: 4.99,
    startDate: '2026-09-13',
    expiresAt: '2026-10-13',
    daysRemaining: 3, // EXPIRING SOON!
    autoRenew: true,
    status: 'expiring_soon',
    location: 'Frankfurt am Main (DE)',
    ipAddress: '185.120.44.10:25565'
  },
  {
    id: 'cnt_002',
    customerId: 'usr_dominik',
    customerName: 'Dominik Neumayer',
    serverId: 'srv_palworld_prime',
    serverName: 'Palworld Official Co-op',
    gameName: 'Palworld Dedicated',
    planName: 'Steam Survival Titan',
    monthlyPrice: 19.99,
    startDate: '2026-10-04',
    expiresAt: '2026-11-04',
    daysRemaining: 25,
    autoRenew: true,
    status: 'active',
    location: 'Frankfurt am Main (DE)',
    ipAddress: '185.120.44.10:8211'
  },
  {
    id: 'cnt_003',
    customerId: 'usr_dominik',
    customerName: 'Dominik Neumayer',
    serverId: 'srv_rust_pvp',
    serverName: 'Rust 2x Vanilla+ Wipe Friday',
    gameName: 'Rust Dedicated',
    planName: 'Steam Survival Titan',
    monthlyPrice: 19.99,
    startDate: '2026-09-08',
    expiresAt: '2026-10-08',
    daysRemaining: -2, // IN GRACE PERIOD! (48h left before deletion)
    autoRenew: false,
    status: 'grace_period',
    location: 'Falkenstein (DE)',
    ipAddress: '142.132.88.24:28015'
  }
];

export const INITIAL_INVOICES: Invoice[] = [
  {
    id: 'inv_001',
    invoiceNumber: 'INV-2026-0842',
    customerId: 'usr_dominik',
    customerName: 'Dominik Neumayer',
    customerAddress: 'Kaiserstraße 42, 60311 Frankfurt am Main',
    date: '2026-10-04',
    dueDate: '2026-10-04',
    paidDate: '2026-10-04 14:32',
    items: [
      {
        description: 'Gameserver: Palworld Official Co-op (16 GB DDR5, 6 vCores)',
        quantity: 1,
        unitPrice: 16.80,
        total: 16.80
      },
      {
        description: 'DDoS Schutz Corero 2.4 Tbps & IPv4 Port 8211',
        quantity: 1,
        unitPrice: 0.00,
        total: 0.00
      }
    ],
    subtotal: 16.80,
    taxRate: 0.19,
    taxAmount: 3.19,
    total: 19.99,
    status: 'paid',
    paymentMethod: 'Prepaid-Guthaben',
    transactionReference: 'TXN-982104-PP'
  },
  {
    id: 'inv_002',
    invoiceNumber: 'INV-2026-0791',
    customerId: 'usr_dominik',
    customerName: 'Dominik Neumayer',
    customerAddress: 'Kaiserstraße 42, 60311 Frankfurt am Main',
    date: '2026-09-13',
    dueDate: '2026-09-13',
    paidDate: '2026-09-13 10:15',
    items: [
      {
        description: 'Gameserver: Survival SMP Season 4 (Minecraft 26.3 PaperMC)',
        quantity: 1,
        unitPrice: 4.19,
        total: 4.19
      }
    ],
    subtotal: 4.19,
    taxRate: 0.19,
    taxAmount: 0.80,
    total: 4.99,
    status: 'paid',
    paymentMethod: 'PayPal Express',
    transactionReference: 'TXN-941038-PY'
  }
];

export const INITIAL_TRANSACTIONS: PaymentTransaction[] = [
  {
    id: 'tx_01',
    customerId: 'usr_dominik',
    amount: 50.00,
    method: 'PayPal',
    timestamp: '2026-10-01 11:24',
    reference: 'PAYPAL-994102941',
    status: 'completed',
    note: 'Prepaid Guthaben-Aufladung'
  },
  {
    id: 'tx_02',
    customerId: 'usr_dominik',
    amount: -19.99,
    method: 'SEPA Prepaid',
    timestamp: '2026-10-04 14:32',
    reference: 'SERVER-PALWORLD-RENEW',
    status: 'completed',
    note: 'Buchung: Palworld Official Co-op (30 Tage)'
  },
  {
    id: 'tx_03',
    customerId: 'usr_dominik',
    amount: 25.00,
    method: 'Paysafecard',
    timestamp: '2026-09-10 18:00',
    reference: 'PSC-10948192841',
    status: 'completed',
    note: 'Prepaid Guthaben-Aufladung'
  }
];

export const INITIAL_TICKETS: SupportTicket[] = [
  {
    id: 'tkt_001',
    ticketNumber: 'TKT-2026-4019',
    customerId: 'usr_dominik',
    customerName: 'Dominik Neumayer',
    serverName: 'Survival SMP Season 4',
    subject: 'Aikar JVM Flags bei Minecraft 26.3 Optimierung',
    priority: 'medium',
    status: 'open',
    createdAt: 'Heute 12:45',
    updatedAt: 'Heute 13:10',
    messages: [
      {
        id: 'msg_1',
        sender: 'customer',
        author: 'Dominik Neumayer',
        timestamp: 'Heute 12:45',
        text: 'Hallo Support-Team, greifen die Aikar Flags auch für Minecraft 26.3 oder sollte der Garbage Collector auf ZGC umgestellt werden?'
      },
      {
        id: 'msg_2',
        sender: 'support',
        author: 'ApexHost Tech-Support (Jonas)',
        timestamp: 'Heute 13:10',
        text: 'Hallo Dominik, für PaperMC 26.3 mit Java 21 empfehlen wir weiterhin die vorkonfigurierten G1GC Aikar Flags. Sie sind bereits in deinem Starter hinterlegt und halten die TPS stabil auf 20.0!'
      }
    ]
  }
];

export const INITIAL_NOTIFICATIONS: ExpiryNotification[] = [
  {
    id: 'notif_1',
    contractId: 'cnt_001',
    serverName: 'Survival SMP Season 4',
    type: 'warning_3d',
    daysLeft: 3,
    timestamp: 'Heute 08:00',
    message: 'Achtung: Dein Server "Survival SMP Season 4" läuft in 3 Tagen ab! Bitte stelle sicher, dass ausreichend Prepaid-Guthaben vorhanden ist.',
    read: false
  },
  {
    id: 'notif_2',
    contractId: 'cnt_003',
    serverName: 'Rust 2x Vanilla+ Wipe Friday',
    type: 'grace_period',
    daysLeft: 0,
    timestamp: 'Vor 2 Tagen',
    message: 'Dringend: Dein Server "Rust 2x Vanilla+" ist abgelaufen und befindet sich in der 72h-Karenzzeit! Verlängere jetzt, um eine Löschung der Kartendaten zu verhindern.',
    read: false
  }
];

// LocalStorage helpers
export function getStoredContracts(): CustomerContract[] {
  try {
    const raw = localStorage.getItem(CONTRACTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : INITIAL_CONTRACTS;
  } catch {
    return INITIAL_CONTRACTS;
  }
}

export function saveStoredContracts(contracts: CustomerContract[]): void {
  localStorage.setItem(CONTRACTS_STORAGE_KEY, JSON.stringify(contracts));
}

export function getStoredCustomers(): CustomerProfile[] {
  try {
    const raw = localStorage.getItem(CUSTOMERS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : INITIAL_CUSTOMERS;
  } catch {
    return INITIAL_CUSTOMERS;
  }
}

export function saveStoredCustomers(customers: CustomerProfile[]): void {
  localStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify(customers));
}

export function getStoredInvoices(): Invoice[] {
  try {
    const raw = localStorage.getItem(INVOICES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : INITIAL_INVOICES;
  } catch {
    return INITIAL_INVOICES;
  }
}

export function saveStoredInvoices(invoices: Invoice[]): void {
  localStorage.setItem(INVOICES_STORAGE_KEY, JSON.stringify(invoices));
}

export function getStoredTransactions(): PaymentTransaction[] {
  try {
    const raw = localStorage.getItem(TRANSACTIONS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : INITIAL_TRANSACTIONS;
  } catch {
    return INITIAL_TRANSACTIONS;
  }
}

export function saveStoredTransactions(txs: PaymentTransaction[]): void {
  localStorage.setItem(TRANSACTIONS_STORAGE_KEY, JSON.stringify(txs));
}

export function getStoredTickets(): SupportTicket[] {
  try {
    const raw = localStorage.getItem(TICKETS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : INITIAL_TICKETS;
  } catch {
    return INITIAL_TICKETS;
  }
}

export function saveStoredTickets(tickets: SupportTicket[]): void {
  localStorage.setItem(TICKETS_STORAGE_KEY, JSON.stringify(tickets));
}

export function getStoredNotifications(): ExpiryNotification[] {
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : INITIAL_NOTIFICATIONS;
  } catch {
    return INITIAL_NOTIFICATIONS;
  }
}

export function saveStoredNotifications(notifs: ExpiryNotification[]): void {
  localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notifs));
}

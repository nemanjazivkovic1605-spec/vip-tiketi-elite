export const PAYMENT_ACCOUNT = '265000000674036614';
export const PAYMENT_RECIPIENT = 'ELITE VIP TIPS';
export const PAYMENT_SUPPORT_EMAIL = 'support@eliteviptips.com';

const configuredExchangeRate = Number(import.meta.env.VITE_EUR_RSD_RATE);
export const EUR_RSD_RATE = Number.isFinite(configuredExchangeRate) && configuredExchangeRate > 0
  ? configuredExchangeRate
  : 117.2;

export type PaymentProductId =
  | 'vip-ticket-day'
  | 'safe-pick-day'
  | 'silver-7'
  | 'gold-30'
  | 'elite-90';

export type PaymentProduct = {
  id: PaymentProductId;
  name: string;
  shortName: string;
  description: string;
  priceEur: number;
  purpose: string;
  accent: 'gold' | 'rose' | 'blue' | 'purple' | 'silver';
};

export const PAYMENT_PRODUCTS: Record<PaymentProductId, PaymentProduct> = {
  'vip-ticket-day': {
    id: 'vip-ticket-day',
    name: 'Elite tiket',
    shortName: 'ELITE TIKET',
    description: 'Premium tiket sa 2 do 6 mečeva, većom kvotom i fokusom na veći profit.',
    priceEur: 15,
    purpose: 'ELITE TIPS - ELITE TIKET',
    accent: 'rose',
  },
  'safe-pick-day': {
    id: 'safe-pick-day',
    name: 'Safe pick',
    shortName: 'SAFE PICK',
    description: 'Stabilniji dnevni predlog sa fokusom na kontrolisani rizik.',
    priceEur: 10,
    purpose: 'ELITE TIPS - SAFE PICK',
    accent: 'blue',
  },
  'silver-7': {
    id: 'silver-7',
    name: 'Silver 7 dana',
    shortName: 'SILVER 7 DANA',
    description: 'Osnovni VIP pristup u trajanju od 7 dana.',
    priceEur: 15,
    purpose: 'ELITE TIPS - SILVER 7 DANA',
    accent: 'silver',
  },
  'gold-30': {
    id: 'gold-30',
    name: 'Gold 30 dana',
    shortName: 'GOLD 30 DANA',
    description: 'Najbolji odnos cene i dugoročnog VIP pristupa.',
    priceEur: 40,
    purpose: 'ELITE TIPS - GOLD 30 DANA',
    accent: 'gold',
  },
  'elite-90': {
    id: 'elite-90',
    name: 'Elite 90 dana',
    shortName: 'ELITE 90 DANA',
    description: 'Premium VIP pristup u trajanju od 90 dana.',
    priceEur: 100,
    purpose: 'ELITE TIPS - ELITE 90 DANA',
    accent: 'purple',
  },
};

export const getCheckoutPath = (productId: PaymentProductId) => `/checkout?product=${productId}`;

export const calculateRsdPrice = (priceEur: number) => Math.round(priceEur * EUR_RSD_RATE);

export const formatRsdAmount = (amount: number) => new Intl.NumberFormat('sr-RS').format(amount);

export const buildIpsQrPayload = (product: PaymentProduct) => {
  const amount = `${calculateRsdPrice(product.priceEur)},00`;
  const purpose = product.purpose.slice(0, 35);

  return [
    'K:PR',
    'V:01',
    'C:1',
    `R:${PAYMENT_ACCOUNT}`,
    `N:${PAYMENT_RECIPIENT}`,
    `I:RSD${amount}`,
    'SF:289',
    `S:${purpose}`,
  ].join('|');
};

export const buildPaymentSummary = (product: PaymentProduct, note: string) => [
  `Primalac: ${PAYMENT_RECIPIENT}`,
  `Tekući račun: ${PAYMENT_ACCOUNT}`,
  `Iznos: ${formatRsdAmount(calculateRsdPrice(product.priceEur))} RSD`,
  `Svrha uplate: ${product.purpose}`,
  `Napomena: ${note}`,
].join('\n');

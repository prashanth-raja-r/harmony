import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { Transaction } from '../entities/transaction.entity';
import { User } from '../entities/user.entity';
import { toNum } from '../common/db.helpers';

export interface DetectedSubscription {
  merchant: string; normalizedName: string; icon: string; category: string;
  amount: number; currency: string;
  frequency: 'monthly' | 'weekly' | 'annual' | 'unknown';
  monthlyEquivalent: number; lastCharged: string; firstSeen: string;
  occurrences: number; transactionIds: string[];
  priceChange: { from: number; to: number; detectedAt: string } | null;
}

const MERCHANT_PATTERNS: Array<[RegExp, string, string, string]> = [
  [/netflix/i,          'Netflix',         '🎬', 'Entertainment'],
  [/prime\s?video|amazon prime/i, 'Amazon Prime', '📦', 'Entertainment'],
  [/hotstar|disney/i,   'Disney+ Hotstar', '⭐', 'Entertainment'],
  [/spotify/i,          'Spotify',         '🎵', 'Entertainment'],
  [/apple\s?music/i,    'Apple Music',     '🍎', 'Entertainment'],
  [/youtube\s?premium/i,'YouTube Premium', '▶️', 'Entertainment'],
  [/zee5/i,             'ZEE5',            '🎭', 'Entertainment'],
  [/sonyliv/i,          'SonyLIV',         '📺', 'Entertainment'],
  [/mxplayer/i,         'MX Player',       '▶️', 'Entertainment'],
  [/jiocinema/i,        'JioCinema',       '🎥', 'Entertainment'],
  [/google\s?(one|storage|workspace|drive)/i, 'Google One', '☁️', 'Subscriptions'],
  [/icloud|apple\s?storage/i, 'iCloud+',   '🍎', 'Subscriptions'],
  [/microsoft\s?365|office\s?365|ms\s?365/i, 'Microsoft 365', '💼', 'Subscriptions'],
  [/dropbox/i,          'Dropbox',         '📁', 'Subscriptions'],
  [/notion/i,           'Notion',          '📝', 'Subscriptions'],
  [/slack/i,            'Slack',           '💬', 'Subscriptions'],
  [/zoom/i,             'Zoom',            '📹', 'Subscriptions'],
  [/figma/i,            'Figma',           '🎨', 'Subscriptions'],
  [/github/i,           'GitHub',          '🐙', 'Subscriptions'],
  [/cult\.fit|curefit/i,'Cult.fit',        '💪', 'Health & Medical'],
  [/strava/i,           'Strava',          '🏃', 'Health & Medical'],
  [/headspace/i,        'Headspace',       '🧘', 'Health & Medical'],
  [/calm/i,             'Calm',            '😌', 'Health & Medical'],
  [/swiggy\s?one/i,     'Swiggy One',      '🍔', 'Food & Dining'],
  [/zomato\s?pro|zomato\s?gold/i, 'Zomato Pro', '🍕', 'Food & Dining'],
  [/jio\s?(post|plan|recharge)/i, 'Jio',   '📱', 'Subscriptions'],
  [/airtel/i,           'Airtel',          '📡', 'Subscriptions'],
  [/bsnl/i,             'BSNL',            '📶', 'Subscriptions'],
  [/vi\b|vodafone\s?idea/i, 'Vi',          '📱', 'Subscriptions'],
  [/zerodha/i,          'Zerodha',         '📈', 'Investments'],
  [/groww/i,            'Groww',           '🌱', 'Investments'],
  [/paytm\s?(gold|money)/i, 'Paytm Money', '💰', 'Investments'],
];

function detectMerchant(description: string) {
  for (const [pattern, name, icon, category] of MERCHANT_PATTERNS) {
    if (pattern.test(description)) return { name, icon, category };
  }
  return null;
}

function inferFrequency(amounts: number[], dates: Date[]): DetectedSubscription['frequency'] {
  if (dates.length < 2) return 'unknown';
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push((sorted[i]!.getTime() - sorted[i - 1]!.getTime()) / (1000 * 60 * 60 * 24));
  }
  const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  if (avgGap >= 300 && avgGap <= 400) return 'annual';
  if (avgGap >= 25  && avgGap <= 35)  return 'monthly';
  if (avgGap >= 6   && avgGap <= 10)  return 'weekly';
  if (amounts.length >= 1) {
    const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    if (avg > 500 && avgGap > 300) return 'annual';
  }
  return 'unknown';
}

function toMonthly(amount: number, freq: DetectedSubscription['frequency']): number {
  if (freq === 'monthly') return amount;
  if (freq === 'weekly')  return amount * 4.33;
  if (freq === 'annual')  return amount / 12;
  return amount;
}

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactions: Repository<Transaction>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async detect(userId: string) {
    const user = await this.users.findOne({ where: { id: userId }, select: ['currency'] });
    const currency = user?.currency ?? 'INR';

    const since = new Date();
    since.setMonth(since.getMonth() - 13);

    const txRows = await this.transactions.find({
      where: { userId, date: MoreThanOrEqual(since) },
      select: ['id', 'description', 'amount', 'date'],
      order: { date: 'DESC' },
    });

    const groups = new Map<string, { meta: { name: string; icon: string; category: string }; txs: Array<{ id: string; amount: number; date: Date }> }>();

    for (const tx of txRows) {
      const merchant = detectMerchant(tx.description);
      if (!merchant) continue;
      if (!groups.has(merchant.name)) groups.set(merchant.name, { meta: merchant, txs: [] });
      groups.get(merchant.name)!.txs.push({ id: tx.id, amount: toNum(tx.amount), date: tx.date });
    }

    const subscriptions: DetectedSubscription[] = [];

    for (const [, { meta, txs }] of groups) {
      if (txs.length < 2) continue;
      const amounts = txs.map((t) => t.amount);
      const dates   = txs.map((t) => t.date);
      const freq    = inferFrequency(amounts, dates);
      if (freq === 'unknown' && txs.length < 3) continue;

      const latestAmount = txs[0]!.amount;
      const sorted = [...txs].sort((a, b) => a.date.getTime() - b.date.getTime());
      const firstAmount = sorted[0]!.amount;
      const priceChange = Math.abs(latestAmount - firstAmount) > 1
        ? { from: firstAmount, to: latestAmount, detectedAt: txs[0]!.date.toISOString() }
        : null;

      subscriptions.push({
        merchant: meta.name,
        normalizedName: meta.name.toLowerCase().replace(/\s+/g, '-'),
        icon: meta.icon,
        category: meta.category,
        amount: latestAmount,
        currency,
        frequency: freq,
        monthlyEquivalent: toMonthly(latestAmount, freq),
        lastCharged: txs[0]!.date.toISOString(),
        firstSeen: sorted[0]!.date.toISOString(),
        occurrences: txs.length,
        transactionIds: txs.map((t) => t.id),
        priceChange,
      });
    }

    subscriptions.sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent);
    const totalMonthly = subscriptions.reduce((s, sub) => s + sub.monthlyEquivalent, 0);
    return { subscriptions, totalMonthly, totalAnnual: totalMonthly * 12, currency };
  }
}

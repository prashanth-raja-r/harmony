export interface User {
  id: string;
  name: string | null;
  email: string;
  currency: string;
  privacyMode: boolean;
  isOnboarded: boolean;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export interface EmiSummary {
  totalEmis: number | null;
  emisPaid: number;
  emisRemaining: number | null;
  currentEmiNumber: number;
  confirmedPayments: number;
  emiStartDate: string | null;
  emiEndDate: string | null;
  lastPaidDate: string | null;
  nextEmiDate: string | null;
}

export interface DebtPayment {
  id: string;
  amount: number;
  principalAmount: number;
  interestAmount: number;
  paymentDate: string;
  note: string | null;
}

export interface Debt {
  id: string;
  name: string;
  type: string;
  balance: number;
  originalAmount: number;
  apr: number;
  minimumPayment: number;
  termMonths: number | null;
  dueDate: number;
  lender: string | null;
  startDate: string;
  isPaidOff: boolean;
  paidOffAt: string | null;
  paidPercent: number;
  emiSummary: EmiSummary;
  payments: DebtPayment[];
  _count: { payments: number };
}

export interface PayoffStrategyItem {
  id: string;
  name: string;
  balance: number;
  apr: number;
  monthsToPayoff: number;
  totalInterest: number;
}

export interface PayoffStrategy {
  order: PayoffStrategyItem[];
  totalMonths: number;
  totalInterestPaid: number;
  debtFreeDate: string;
}

export interface PayoffStrategies {
  avalanche: PayoffStrategy;
  snowball: PayoffStrategy;
  monthlyBudget: number;
  totalMinimum: number;
}

export interface TodayAction {
  id: string;
  type: string;
  title: string;
  description: string | null;
  priority: number;
  metadata: Record<string, unknown> | null;
  isCompleted: boolean;
}

export interface TodayData {
  actions: TodayAction[];
  debtFree: {
    totalDebt: number;
    monthsRemaining: number | null;
    debtFreeDate: string | null;
  };
  streak: { current: number; longest: number; type: string } | null;
  todaySpend: number;
  dailyBudget: number;
}

export interface Transaction {
  id: string;
  amount: number;
  description: string;
  date: string;
  type: string;
  paymentMethod: string | null;
  category: { id: string; name: string; icon: string; color: string } | null;
}

export interface MonthlySummary {
  month: number;
  year: number;
  monthlyIncome: number;
  totalSpend: number;
  savings: number;
  savingsRate: number;
  transactionCount: number;
  byCategory: Array<{
    categoryId: string;
    name: string;
    icon: string;
    color: string;
    total: number;
  }>;
  budgetStatus: Array<{
    id: string;
    categoryId: string;
    category: { id: string; name: string; icon: string; color: string };
    budgeted: number;
    spent: number;
    remaining: number;
    pct: number;
  }>;
  transactions: Transaction[];
  categories: Array<{ id: string; name: string; icon: string; color: string }>;
}

export interface Income {
  id: string;
  source: string;
  type: string;
  amount: number;
  frequency: string;
  date: string;
}

export interface ScenarioMetric {
  label: string;
  baseline: string;
  scenario: string;
  delta: string;
  positive: boolean;
}

export interface ScenarioResult {
  type: string;
  title: string;
  keyMetrics: ScenarioMetric[];
  narrative: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GoalMilestone {
  id: string;
  title: string;
  amount: number;
  isReached: boolean;
  reachedAt: string | null;
}

export interface Goal {
  id: string;
  name: string;
  type: string;
  targetAmount: number;
  currentAmount: number;
  progress: number;
  targetDate: string | null;
  monthlyContribution: number | null;
  description: string | null;
  isCompleted: boolean;
  completedAt: string | null;
  createdAt: string;
  milestones: GoalMilestone[];
}

export interface ScorePillar {
  score: number;
  label: string;
  reason: string;
}

export interface LiveScore {
  score: number;
  debtRatioScore: number;
  savingsScore: number;
  paymentScore: number;
  budgetScore: number;
  emergencyScore: number;
  pillars: ScorePillar[];
}

export interface ScoreSnapshot {
  id: string;
  score: number;
  debtRatioScore: number;
  savingsScore: number;
  paymentScore: number;
  budgetScore: number;
  emergencyScore: number;
  date: string;
}

export interface ScoreLatest {
  live: LiveScore;
  stored: ScoreSnapshot | null;
}

export interface AnswerMetric {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}

export interface QuestionAnswer {
  questionId: string;
  question: string;
  answer: string;
  metrics?: AnswerMetric[];
  link?: string;
}

export interface Insight {
  id: string;
  type: 'alert' | 'tip' | 'win';
  category: 'spending' | 'debt' | 'savings' | 'budget' | 'income';
  title: string;
  description: string;
  link?: string;
  priority: number;
}

export interface TrendCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  total: number;
}

export interface TrendDelta {
  id: string;
  name: string;
  icon: string;
  color: string;
  current: number;
  previous: number;
  delta: number;
  pct: number;
}

export interface SpendingTrend {
  chartData: Array<Record<string, string | number>>;
  categories: TrendCategory[];
  deltas: TrendDelta[];
  monthLabels: string[];
}

export interface SpaceMemberItem {
  id: string;
  userId: string | null;
  name: string | null;
  email: string | null;
  isPendingSignup: boolean;
  role: string;
  status: string;
  joinedAt: string | null;
  invitedAt: string | null;
}

export interface Space {
  id: string;
  name: string;
  type: string;
  description: string | null;
  ownerId: string;
  owner: { id: string; name: string | null; email: string } | null;
  myRole: string | null;
  myStatus: string | null;
  memberCount: number;
  members: SpaceMemberItem[];
  createdAt: string;
}

export interface SpaceDashboardMember {
  memberId: string;
  userId: string;
  name: string | null;
  email: string;
  role: string;
  isCurrentUser: boolean;
  monthlyIncome: number;
  totalDebt: number;
  monthlyDebtPayment: number;
  monthlySpend: number;
  monthlySavings: number;
  goals: { count: number; totalTarget: number; totalCurrent: number; progress: number };
  harmonyScore: number | null;
  netWorth: number;
}

export interface SpaceDashboard {
  members: SpaceDashboardMember[];
  totals: {
    memberCount: number;
    combinedMonthlyIncome: number;
    combinedTotalDebt: number;
    combinedMonthlySpend: number;
    combinedMonthlySavings: number;
    combinedNetWorth: number;
    avgHarmonyScore: number | null;
  };
  month: number;
  year: number;
}

export interface PendingInvite {
  id: string;
  spaceId: string;
  spaceName: string;
  spaceType: string;
  invitedBy: { id: string; name: string | null; email: string };
  invitedAt: string;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

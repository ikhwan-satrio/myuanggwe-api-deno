// src/types/db.d.ts
import type {
  BudgetType,
  CategoryType,
  FinancialGoalType,
  OrganizationType,
  RecurringTransactionType,
  TransactionType,
  UserType,
  WalletType,
} from "#server/lib/db/schema.ts";

export type {
  BudgetType,
  CategoryType,
  FinancialGoalType,
  OrganizationType,
  RecurringTransactionType,
  TransactionType,
  UserType,
  WalletType,
};

import type {
  budgets,
  categories,
  financialGoals,
  invitation,
  member,
  organization,
  recurringTransactions,
  transactions,
  user,
  wallets,
} from "#server/lib/db/schema.ts";
import type { InferInsertModel } from "drizzle-orm";

export type InsertWallet = InferInsertModel<typeof wallets>;
export type InsertCategory = InferInsertModel<typeof categories>;
export type InsertTransaction = InferInsertModel<typeof transactions>;
export type InsertBudget = InferInsertModel<typeof budgets>;
export type InsertRecurringTransaction = InferInsertModel<typeof recurringTransactions>;
export type InsertFinancialGoal = InferInsertModel<typeof financialGoals>;
export type InsertOrganization = InferInsertModel<typeof organization>;
export type InsertUser = InferInsertModel<typeof user>;
export type InsertMember = InferInsertModel<typeof member>;
export type InsertInvitation = InferInsertModel<typeof invitation>;

export type WalletWithRelations = WalletType & {
  user?: UserType;
  organization?: OrganizationType | null;
  transactions?: TransactionType[];
  recurringTransactions?: RecurringTransactionType[];
  financialGoals?: FinancialGoalType[];
};

export type CategoryWithRelations = CategoryType & {
  user?: UserType;
  organization?: OrganizationType | null;
  transactions?: TransactionType[];
  budgets?: BudgetType[];
  recurringTransactions?: RecurringTransactionType[];
};

export type TransactionWithRelations = TransactionType & {
  wallet?: WalletType;
  toWallet?: WalletType | null;
  category?: CategoryType | null;
  user?: UserType;
  organization?: OrganizationType | null;
};

export type BudgetWithRelations = BudgetType & {
  category?: CategoryType;
  user?: UserType;
  organization?: OrganizationType | null;
};

export type RecurringTransactionWithRelations = RecurringTransactionType & {
  wallet?: WalletType;
  toWallet?: WalletType | null;
  category?: CategoryType | null;
  user?: UserType;
  organization?: OrganizationType | null;
};

export type FinancialGoalWithRelations = FinancialGoalType & {
  wallet?: WalletType;
  user?: UserType;
  organization?: OrganizationType | null;
};

export type MemberWithRelations = {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  createdAt: Date;
  organization?: OrganizationType;
  user?: UserType;
};

export type OrganizationWithRelations = OrganizationType & {
  members?: MemberWithRelations[];
  wallets?: WalletType[];
  categories?: CategoryType[];
  transactions?: TransactionType[];
  budgets?: BudgetType[];
  recurringTransactions?: RecurringTransactionType[];
  financialGoals?: FinancialGoalType[];
};

export type TransactionType_ = "income" | "expense" | "transfer";
export type BudgetPeriod = "monthly" | "yearly";
export type RecurringFrequency = "daily" | "weekly" | "monthly" | "yearly";
export type WalletType_ = "cash" | "bank" | "e-wallet" | "investment" | string;
export type MemberRole = "owner" | "admin" | "member";
export type InvitationStatus = "pending" | "accepted" | "rejected" | "cancelled";

export type UpdateWallet = Partial<InsertWallet> & { id: string };
export type UpdateCategory = Partial<InsertCategory> & { id: string };
export type UpdateTransaction = Partial<InsertTransaction> & { id: string };
export type UpdateBudget = Partial<InsertBudget> & { id: string };
export type UpdateRecurringTransaction = Partial<InsertRecurringTransaction> & { id: string };
export type UpdateFinancialGoal = Partial<InsertFinancialGoal> & { id: string };

declare module "hono" {
  interface ContextVariableMap {
    user: import("better-auth").User;
    session: import("better-auth").Session | null;
    activeOrg: OrganizationType | null;
    organizations: OrganizationType[];
    currentSession: { activeOrganizationId: string | null } | null | undefined;
  }
}

export {};

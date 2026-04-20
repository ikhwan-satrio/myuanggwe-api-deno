import { z } from "zod";

// auth validator
export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(6),
});

export const registerSchema = z
  .object({
    name: z.string().min(3),
    email: z.email(),
    password: z.string().min(8),
    passwordConfirm: z.string().min(8),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "Passwords do not match",
    path: ["passwordConfirm"],
  });

// transactions
export const transactionSchema = z.object({
  type: z.enum(["income", "expense", "transfer"]),
  amount: z.number().positive("Jumlah harus lebih dari 0"),
  walletId: z.string().min(1, "Pilih dompet"),
  toWalletId: z.string(),
  categoryId: z.string(),
  description: z.string(),
  date: z.string().min(1, "Tanggal harus diisi"),
});

// wallets
export const walletSchema = z.object({
  name: z.string().min(3, "Nama dompet minimal 3 karakter"),
  type: z.enum(["cash", "bank", "credit_card"]),
  balance: z.number().min(0, "Saldo awal tidak boleh negatif"),
  currency: z.string().min(1, "Pilih mata uang"),
});

// budgets
export const budgetSchema = z.object({
  amount: z.number().positive("Jumlah harus lebih dari 0"),
  period: z.enum(["monthly", "yearly"]),
  categoryId: z.string().min(1, "Pilih kategori"),
});

// recurring transactions
export const recurringTransactionSchema = z.object({
  amount: z.number().positive("Jumlah harus lebih dari 0"),
  type: z.enum(["income", "expense", "transfer"]),
  description: z.string(),
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
  startDate: z.string().min(1, "Tanggal mulai harus diisi"),
  walletId: z.string().min(1, "Pilih dompet"),
  toWalletId: z.string(),
  categoryId: z.string(),
});

// financial goals
export const financialGoalSchema = z.object({
  name: z.string().min(3, "Nama target minimal 3 karakter"),
  targetAmount: z.number().positive("Target jumlah harus lebih dari 0"),
  deadline: z.string(),
  walletId: z.string().min(1, "Pilih dompet sumber"),
});

// categories
export const categorySchema = z.object({
  name: z.string().min(2, "Minimal 2 karakter"),
  type: z.enum(["income", "expense"]),
  icon: z.string(),
});

// organizations
export const organizationSchema = z.object({
  name: z.string().min(2, "Nama organisasi minimal 2 karakter"),
  slug: z.string().min(2, "Slug minimal 2 karakter"),
});

export const inviteSchema = z.object({
  email: z.email("Email tidak valid"),
  role: z.enum(["admin", "member"]),
});

export const joinSchema = z.object({
  invitationId: z.string().min(1, "ID Undangan diperlukan"),
});

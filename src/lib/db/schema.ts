import { relations, sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// ============= BETTER AUTH TABLES (Tetap pakai timestamp_ms karena required) =============
export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: integer('email_verified', { mode: 'boolean' }).default(false).notNull(),
	image: text('image'),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.$onUpdate(() => new Date())
		.notNull(),
	username: text('username').unique(),
	displayUsername: text('display_username')
});

export const session = sqliteTable(
	'session',
	{
		id: text('id').primaryKey(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		token: text('token').notNull().unique(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.$onUpdate(() => new Date())
			.notNull(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		activeOrganizationId: text('active_organization_id')
	},
	(table) => [index('session_userId_idx').on(table.userId)]
);

export const account = sqliteTable(
	'account',
	{
		id: text('id').primaryKey(),
		accountId: text('account_id').notNull(),
		providerId: text('provider_id').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
		refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
		scope: text('scope'),
		password: text('password'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [index('account_userId_idx').on(table.userId)]
);

export const verification = sqliteTable(
	'verification',
	{
		id: text('id').primaryKey(),
		identifier: text('identifier').notNull(),
		value: text('value').notNull(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [index('verification_identifier_idx').on(table.identifier)]
);

export const organization = sqliteTable(
	'organization',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		slug: text('slug').notNull().unique(),
		logo: text('logo'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		metadata: text('metadata')
	},
	(table) => [uniqueIndex('organization_slug_uidx').on(table.slug)]
);

export const member = sqliteTable(
	'member',
	{
		id: text('id').primaryKey(),
		organizationId: text('organization_id')
			.notNull()
			.references(() => organization.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		role: text('role').default('member').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [
		index('member_organizationId_idx').on(table.organizationId),
		index('member_userId_idx').on(table.userId)
	]
);

export const invitation = sqliteTable(
	'invitation',
	{
		id: text('id').primaryKey(),
		organizationId: text('organization_id')
			.notNull()
			.references(() => organization.id, { onDelete: 'cascade' }),
		email: text('email').notNull(),
		role: text('role'),
		status: text('status').default('pending').notNull(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		inviterId: text('inviter_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' })
	},
	(table) => [
		index('invitation_organizationId_idx').on(table.organizationId),
		index('invitation_email_idx').on(table.email)
	]
);

// ============= APP TABLES (Ubah ke timestamp biasa) =============

export const wallets = sqliteTable('wallets', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	name: text('name').notNull(),
	type: text('type').default('cash').notNull(),
	balance: integer('balance').default(0).notNull(),
	currency: text('currency').default('IDR').notNull(),
	organizationId: text('organization_id').references(() => organization.id, {
		onDelete: 'cascade'
	}),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	// UBAH: timestamp_ms → timestamp
	createdAt: integer('created_at', { mode: 'timestamp' })
		.default(sql`(unixepoch())`)
		.notNull()
});

export const categories = sqliteTable('categories', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	name: text('name').notNull(),
	icon: text('icon'),
	type: text('type').notNull(),
	organizationId: text('organization_id').references(() => organization.id, {
		onDelete: 'cascade'
	}),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	// UBAH: timestamp_ms → timestamp
	createdAt: integer('created_at', { mode: 'timestamp' })
		.default(sql`(unixepoch())`)
		.notNull()
});

export const transactions = sqliteTable('transactions', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	amount: integer('amount').notNull(),
	type: text('type', { enum: ['income', 'expense', 'transfer'] }).notNull(),
	description: text('description'),
	currency: text('currency').default('IDR').notNull(),
	exchangeRate: integer('exchange_rate').default(1000000).notNull(), // Multiplied by 1,000,000 for precision
	// UBAH: timestamp_ms → timestamp
	date: integer('date', { mode: 'timestamp' }).notNull(),
	walletId: text('wallet_id')
		.notNull()
		.references(() => wallets.id, { onDelete: 'cascade' }),
	toWalletId: text('to_wallet_id').references(() => wallets.id, { onDelete: 'cascade' }),
	categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	organizationId: text('organization_id').references(() => organization.id, {
		onDelete: 'cascade'
	}),
	// UBAH: timestamp_ms → timestamp
	createdAt: integer('created_at', { mode: 'timestamp' })
		.default(sql`(unixepoch())`)
		.notNull()
});

export const budgets = sqliteTable('budgets', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	amount: integer('amount').notNull(),
	period: text('period', { enum: ['monthly', 'yearly'] })
		.default('monthly')
		.notNull(),
	categoryId: text('category_id')
		.notNull()
		.references(() => categories.id, { onDelete: 'cascade' }),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	organizationId: text('organization_id').references(() => organization.id, {
		onDelete: 'cascade'
	}),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.default(sql`(unixepoch())`)
		.notNull()
});

export const recurringTransactions = sqliteTable('recurring_transactions', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	amount: integer('amount').notNull(),
	type: text('type', { enum: ['income', 'expense', 'transfer'] }).notNull(),
	description: text('description'),
	frequency: text('frequency', { enum: ['daily', 'weekly', 'monthly', 'yearly'] }).notNull(),
	startDate: integer('start_date', { mode: 'timestamp' }).notNull(),
	nextRunDate: integer('next_run_date', { mode: 'timestamp' }).notNull(),
	lastRunDate: integer('last_run_date', { mode: 'timestamp' }),
	walletId: text('wallet_id')
		.notNull()
		.references(() => wallets.id, { onDelete: 'cascade' }),
	toWalletId: text('to_wallet_id').references(() => wallets.id, { onDelete: 'cascade' }),
	categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	organizationId: text('organization_id').references(() => organization.id, {
		onDelete: 'cascade'
	}),
	isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.default(sql`(unixepoch())`)
		.notNull()
});

export const financialGoals = sqliteTable('financial_goals', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	name: text('name').notNull(),
	targetAmount: integer('target_amount').notNull(),
	currentAmount: integer('current_amount').default(0).notNull(),
	deadline: integer('deadline', { mode: 'timestamp' }),
	walletId: text('wallet_id')
		.notNull()
		.references(() => wallets.id, { onDelete: 'cascade' }),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	organizationId: text('organization_id').references(() => organization.id, {
		onDelete: 'cascade'
	}),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.default(sql`(unixepoch())`)
		.notNull()
});

// ============= RELATIONS =============

export const walletRelations = relations(wallets, ({ one, many }) => ({
	organization: one(organization, {
		fields: [wallets.organizationId],
		references: [organization.id]
	}),
	user: one(user, {
		fields: [wallets.userId],
		references: [user.id]
	}),
	transactions: many(transactions),
	recurringTransactions: many(recurringTransactions),
	financialGoals: many(financialGoals)
}));

export const categoryRelations = relations(categories, ({ one, many }) => ({
	organization: one(organization, {
		fields: [categories.organizationId],
		references: [organization.id]
	}),
	user: one(user, {
		fields: [categories.userId],
		references: [user.id]
	}),
	transactions: many(transactions),
	budgets: many(budgets),
	recurringTransactions: many(recurringTransactions)
}));

export const transactionRelations = relations(transactions, ({ one }) => ({
	wallet: one(wallets, {
		fields: [transactions.walletId],
		references: [wallets.id]
	}),
	toWallet: one(wallets, {
		fields: [transactions.toWalletId],
		references: [wallets.id]
	}),
	category: one(categories, {
		fields: [transactions.categoryId],
		references: [categories.id]
	}),
	user: one(user, {
		fields: [transactions.userId],
		references: [user.id]
	}),
	organization: one(organization, {
		fields: [transactions.organizationId],
		references: [organization.id]
	})
}));

export const budgetRelations = relations(budgets, ({ one }) => ({
	category: one(categories, {
		fields: [budgets.categoryId],
		references: [categories.id]
	}),
	user: one(user, {
		fields: [budgets.userId],
		references: [user.id]
	}),
	organization: one(organization, {
		fields: [budgets.organizationId],
		references: [organization.id]
	})
}));

export const recurringTransactionRelations = relations(recurringTransactions, ({ one }) => ({
	wallet: one(wallets, {
		fields: [recurringTransactions.walletId],
		references: [wallets.id]
	}),
	toWallet: one(wallets, {
		fields: [recurringTransactions.toWalletId],
		references: [wallets.id]
	}),
	category: one(categories, {
		fields: [recurringTransactions.categoryId],
		references: [categories.id]
	}),
	user: one(user, {
		fields: [recurringTransactions.userId],
		references: [user.id]
	}),
	organization: one(organization, {
		fields: [recurringTransactions.organizationId],
		references: [organization.id]
	})
}));

export const financialGoalRelations = relations(financialGoals, ({ one }) => ({
	wallet: one(wallets, {
		fields: [financialGoals.walletId],
		references: [wallets.id]
	}),
	user: one(user, {
		fields: [financialGoals.userId],
		references: [user.id]
	}),
	organization: one(organization, {
		fields: [financialGoals.organizationId],
		references: [organization.id]
	})
}));

export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	accounts: many(account),
	members: many(member),
	invitations: many(invitation),
	wallets: many(wallets),
	categories: many(categories),
	transactions: many(transactions),
	budgets: many(budgets),
	recurringTransactions: many(recurringTransactions),
	financialGoals: many(financialGoals)
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id]
	})
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id]
	})
}));

export const organizationRelations = relations(organization, ({ many }) => ({
	members: many(member),
	invitations: many(invitation),
	wallets: many(wallets),
	categories: many(categories),
	transactions: many(transactions),
	budgets: many(budgets),
	recurringTransactions: many(recurringTransactions),
	financialGoals: many(financialGoals)
}));

export const memberRelations = relations(member, ({ one }) => ({
	organization: one(organization, {
		fields: [member.organizationId],
		references: [organization.id]
	}),
	user: one(user, {
		fields: [member.userId],
		references: [user.id]
	})
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
	organization: one(organization, {
		fields: [invitation.organizationId],
		references: [organization.id]
	}),
	inviter: one(user, {
		fields: [invitation.inviterId],
		references: [user.id]
	})
}));

// ============= TYPES =============

export type OrganizationType = typeof organization.$inferSelect;
export type UserType = typeof user.$inferSelect;
export type WalletType = typeof wallets.$inferSelect;
export type CategoryType = typeof categories.$inferSelect;
export type TransactionType = typeof transactions.$inferSelect;
export type BudgetType = typeof budgets.$inferSelect;
export type RecurringTransactionType = typeof recurringTransactions.$inferSelect;
export type FinancialGoalType = typeof financialGoals.$inferSelect;

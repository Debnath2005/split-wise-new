CREATE TABLE `expense_shares` (
	`id` integer PRIMARY KEY NOT NULL,
	`expense_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`owed_paise` integer NOT NULL,
	`input_value` integer,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "expense_shares_owed_check" CHECK("expense_shares"."owed_paise" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expense_shares_expense_user_unique` ON `expense_shares` (`expense_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `expense_shares_user_id_idx` ON `expense_shares` (`user_id`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` integer PRIMARY KEY NOT NULL,
	`group_id` integer,
	`description` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`currency` text DEFAULT 'INR' NOT NULL,
	`paid_by_user_id` integer NOT NULL,
	`split_type` text NOT NULL,
	`expense_date` text NOT NULL,
	`notes` text,
	`created_by_user_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_by_user_id` integer,
	`updated_at` integer,
	`deleted_at` integer,
	`deleted_by_user_id` integer,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`paid_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deleted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "expenses_amount_check" CHECK("expenses"."amount_paise" > 0),
	CONSTRAINT "expenses_split_type_check" CHECK("expenses"."split_type" IN ('equal', 'exact', 'percent'))
);
--> statement-breakpoint
CREATE INDEX `expenses_group_deleted_idx` ON `expenses` (`group_id`,`deleted_at`);--> statement-breakpoint
ALTER TABLE `activities` ADD `expense_id` integer REFERENCES expenses(id);
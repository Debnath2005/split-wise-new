CREATE TABLE `settlements` (
	`id` integer PRIMARY KEY NOT NULL,
	`group_id` integer,
	`from_user_id` integer NOT NULL,
	`to_user_id` integer NOT NULL,
	`amount_paise` integer NOT NULL,
	`method` text NOT NULL,
	`note` text,
	`settled_on` text NOT NULL,
	`created_by_user_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	`deleted_by_user_id` integer,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deleted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "settlements_parties_check" CHECK("settlements"."from_user_id" <> "settlements"."to_user_id"),
	CONSTRAINT "settlements_amount_check" CHECK("settlements"."amount_paise" > 0),
	CONSTRAINT "settlements_method_check" CHECK("settlements"."method" IN ('upi', 'cash', 'other'))
);
--> statement-breakpoint
CREATE INDEX `settlements_group_id_idx` ON `settlements` (`group_id`);--> statement-breakpoint
CREATE INDEX `settlements_from_user_id_idx` ON `settlements` (`from_user_id`);--> statement-breakpoint
CREATE INDEX `settlements_to_user_id_idx` ON `settlements` (`to_user_id`);--> statement-breakpoint
ALTER TABLE `activities` ADD `settlement_id` integer REFERENCES settlements(id);
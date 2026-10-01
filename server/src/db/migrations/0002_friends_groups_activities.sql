CREATE TABLE `activities` (
	`id` integer PRIMARY KEY NOT NULL,
	`actor_user_id` integer NOT NULL,
	`type` text NOT NULL,
	`group_id` integer,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `activity_recipients` (
	`id` integer PRIMARY KEY NOT NULL,
	`activity_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`read_at` integer,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_recipients_activity_user_unique` ON `activity_recipients` (`activity_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `activity_recipients_user_activity_idx` ON `activity_recipients` (`user_id`,`activity_id`);--> statement-breakpoint
CREATE TABLE `friendships` (
	`id` integer PRIMARY KEY NOT NULL,
	`user_low_id` integer NOT NULL,
	`user_high_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_low_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_high_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "friendships_order_check" CHECK("friendships"."user_low_id" < "friendships"."user_high_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `friendships_pair_unique` ON `friendships` (`user_low_id`,`user_high_id`);--> statement-breakpoint
CREATE INDEX `friendships_user_high_idx` ON `friendships` (`user_high_id`);--> statement-breakpoint
CREATE TABLE `group_members` (
	`id` integer PRIMARY KEY NOT NULL,
	`group_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`joined_at` integer NOT NULL,
	`left_at` integer,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `group_members_group_user_unique` ON `group_members` (`group_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `group_members_user_id_idx` ON `group_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `groups` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`simplify_debts` integer DEFAULT true NOT NULL,
	`created_by_user_id` integer NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE `ar_trials` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_hash` text NOT NULL,
	`label` text NOT NULL,
	`teams` text NOT NULL,
	`winner` text,
	`claimed_at` integer,
	`created_at` integer NOT NULL
);

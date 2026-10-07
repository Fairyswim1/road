CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_hash` text NOT NULL,
	`pin_hash` text NOT NULL,
	`state` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);

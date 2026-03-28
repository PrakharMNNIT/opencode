CREATE TABLE `session_skill` (
	`session_id` text NOT NULL,
	`skill_name` text NOT NULL,
	`added_at` integer NOT NULL,
	`token_estimate` integer,
	CONSTRAINT `session_skill_pk` PRIMARY KEY(`session_id`, `skill_name`),
	CONSTRAINT `fk_session_skill_session_id_session_id_fk` FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `session_skill_session_idx` ON `session_skill` (`session_id`);
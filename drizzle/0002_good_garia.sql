CREATE TABLE `accommodation_attributes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accommodationId` int NOT NULL,
	`attributes` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `accommodation_attributes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `member_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tripId` int NOT NULL,
	`userId` int NOT NULL,
	`category` enum('accommodation','destination','dates','general') NOT NULL,
	`rawText` text NOT NULL,
	`attributes` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `member_preferences_id` PRIMARY KEY(`id`)
);

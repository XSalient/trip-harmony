CREATE TABLE `accommodation_votes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accommodationId` int NOT NULL,
	`userId` int NOT NULL,
	`vote` enum('love','fine','veto') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accommodation_votes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `accommodations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tripId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`imageUrl` text,
	`pricePerNight` decimal(12,2),
	`totalPrice` decimal(12,2),
	`perPersonCost` decimal(12,2),
	`bedrooms` int,
	`bathrooms` int,
	`amenities` text,
	`location` varchar(500),
	`link` text,
	`comfortScore` decimal(3,1),
	`proposedBy` int NOT NULL,
	`selected` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accommodations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `budget_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tripId` int NOT NULL,
	`category` enum('accommodation','transport','food','activities','other') NOT NULL,
	`description` varchar(500) NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`paidBy` int,
	`splitType` enum('equal','custom') NOT NULL DEFAULT 'equal',
	`approved` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `budget_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `date_proposals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tripId` int NOT NULL,
	`proposedBy` int NOT NULL,
	`startDate` timestamp NOT NULL,
	`endDate` timestamp NOT NULL,
	`label` varchar(255),
	`selected` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `date_proposals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `date_votes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`proposalId` int NOT NULL,
	`userId` int NOT NULL,
	`vote` enum('available','maybe','unavailable') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `date_votes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `destination_votes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`destinationId` int NOT NULL,
	`userId` int NOT NULL,
	`vote` enum('love','fine','veto') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `destination_votes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `destinations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tripId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`imageUrl` text,
	`vibes` text,
	`estimatedCost` decimal(12,2),
	`proposedBy` int NOT NULL,
	`selected` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `destinations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tripId` int,
	`type` enum('invite','vote_request','budget_alert','consensus','phase_change','referee','general') NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`read` boolean NOT NULL DEFAULT false,
	`actionUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `referee_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tripId` int NOT NULL,
	`phase` varchar(50) NOT NULL,
	`messageType` enum('nudge','mediation','compromise','celebration','summary') NOT NULL,
	`content` text NOT NULL,
	`context` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `referee_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `travel_dna` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`budgetComfort` int NOT NULL DEFAULT 5,
	`socialEnergy` int NOT NULL DEFAULT 5,
	`adventureLevel` int NOT NULL DEFAULT 5,
	`planningStyle` int NOT NULL DEFAULT 5,
	`culturalCuriosity` int NOT NULL DEFAULT 5,
	`comfortNeed` int NOT NULL DEFAULT 5,
	`foodPriority` int NOT NULL DEFAULT 5,
	`activityPace` int NOT NULL DEFAULT 5,
	`dietaryNeeds` text,
	`accessibilityNeeds` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `travel_dna_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trip_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tripId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('organizer','member') NOT NULL DEFAULT 'member',
	`status` enum('pending','accepted','declined') NOT NULL DEFAULT 'pending',
	`budgetMax` decimal(12,2),
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `trip_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trips` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`coverImage` text,
	`organizerId` int NOT NULL,
	`inviteCode` varchar(32) NOT NULL,
	`phase` enum('setup','dates','destination','accommodation','activities','finalized') NOT NULL DEFAULT 'setup',
	`status` enum('planning','active','completed','cancelled') NOT NULL DEFAULT 'planning',
	`startDate` timestamp,
	`endDate` timestamp,
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`totalBudget` decimal(12,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trips_id` PRIMARY KEY(`id`),
	CONSTRAINT `trips_inviteCode_unique` UNIQUE(`inviteCode`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `avatarUrl` text;
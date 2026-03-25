ALTER TABLE `accommodations` ADD `singleBeds` int;
--> statement-breakpoint
ALTER TABLE `accommodations` ADD `doubleBeds` int;
--> statement-breakpoint
ALTER TABLE `accommodations` ADD `toilets` int;
--> statement-breakpoint
ALTER TABLE `accommodations` ADD `ensuites` int;
--> statement-breakpoint
ALTER TABLE `accommodations` ADD `freeParking` boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE `accommodations` ADD `camperParking` boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE `accommodations` ADD `preferences` text;

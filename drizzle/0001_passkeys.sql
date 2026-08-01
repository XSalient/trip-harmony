CREATE TABLE "webauthn_challenges" (
	"id" serial PRIMARY KEY NOT NULL,
	"challengeId" varchar(64) NOT NULL,
	"challenge" text NOT NULL,
	"userId" integer,
	"purpose" varchar(32) NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "webauthn_challenges_challengeId_unique" UNIQUE("challengeId")
);
--> statement-breakpoint
CREATE TABLE "webauthn_credentials" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"credentialId" text NOT NULL,
	"publicKey" text NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL,
	"transports" text,
	"deviceType" varchar(32),
	"backedUp" boolean DEFAULT false NOT NULL,
	"label" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"lastUsedAt" timestamp,
	CONSTRAINT "webauthn_credentials_credentialId_unique" UNIQUE("credentialId")
);

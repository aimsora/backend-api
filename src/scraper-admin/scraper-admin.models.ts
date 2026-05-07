import { Field, InputType, Int, ObjectType } from "@nestjs/graphql";
import { IsBoolean, IsOptional, IsString, MinLength } from "class-validator";
import { SourceRunStatus } from "@prisma/client";
import { registerEnumType } from "@nestjs/graphql";

registerEnumType(SourceRunStatus, { name: "ScraperAdminSourceRunStatus" });

@ObjectType()
export class ScraperAdminConfig {
  @Field()
  schedule!: string;

  @Field()
  autoRunEnabled!: boolean;

  @Field(() => [String])
  enabledSources!: string[];

  @Field(() => Date)
  updatedAt!: Date;

  @Field()
  source!: string;
}

@ObjectType()
export class ScraperRuntimeCircuitState {
  @Field()
  sourceCode!: string;

  @Field(() => Int)
  failures!: number;

  @Field(() => Date, { nullable: true })
  openUntil?: Date | null;
}

@ObjectType()
export class ScraperRuntimeState {
  @Field()
  reachable!: boolean;

  @Field()
  schedule!: string;

  @Field()
  autoRunEnabled!: boolean;

  @Field()
  running!: boolean;

  @Field(() => [String])
  runningSources!: string[];

  @Field(() => [String])
  loadedSources!: string[];

  @Field(() => [String])
  enabledSources!: string[];

  @Field(() => [ScraperRuntimeCircuitState])
  circuitStates!: ScraperRuntimeCircuitState[];

  @Field(() => String, { nullable: true })
  message?: string;
}

@ObjectType()
export class ScraperAdminSourceStatus {
  @Field()
  sourceCode!: string;

  @Field()
  sourceName!: string;

  @Field()
  isActive!: boolean;

  @Field()
  isLoaded!: boolean;

  @Field(() => SourceRunStatus, { nullable: true })
  lastRunStatus?: SourceRunStatus | null;

  @Field(() => Date, { nullable: true })
  lastRunAt?: Date | null;

  @Field(() => Date, { nullable: true })
  lastSuccessAt?: Date | null;

  @Field(() => String, { nullable: true })
  lastErrorMessage?: string;

  @Field()
  riskLevel!: string;

  @Field()
  successRate!: number;

  @Field()
  publicationRate!: number;

  @Field(() => Int)
  failedRuns!: number;

  @Field(() => Int, { nullable: true })
  hoursSinceLastRun?: number | null;

  @Field()
  isRunning!: boolean;

  @Field()
  circuitOpen!: boolean;

  @Field(() => Int)
  consecutiveFailures!: number;

  @Field(() => Date, { nullable: true })
  circuitOpenUntil?: Date | null;

  @Field()
  attentionRequired!: boolean;

  @Field()
  attentionReason!: string;
}

@ObjectType()
export class ScraperAdminOverview {
  @Field(() => ScraperAdminConfig)
  config!: ScraperAdminConfig;

  @Field(() => ScraperRuntimeState)
  runtime!: ScraperRuntimeState;

  @Field(() => [ScraperAdminSourceStatus])
  sources!: ScraperAdminSourceStatus[];
}

@InputType()
export class UpdateScraperAdminConfigInput {
  @Field()
  @IsString()
  @MinLength(5)
  schedule!: string;

  @Field()
  @IsBoolean()
  autoRunEnabled!: boolean;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  enabledSources?: string[];
}

@InputType()
export class UpdateScraperAdminSourceStateInput {
  @Field()
  @IsString()
  @MinLength(2)
  sourceCode!: string;

  @Field()
  @IsBoolean()
  isActive!: boolean;
}

import { Field, Float, ID, InputType, Int, ObjectType } from "@nestjs/graphql";
import GraphQLJSON from "graphql-type-json";

@ObjectType()
export class ProcurementItem {
  @Field(() => ID)
  externalId!: string;

  @Field()
  source!: string;

  @Field()
  title!: string;

  @Field({ nullable: true })
  customer?: string;

  @Field({ nullable: true })
  supplier?: string;

  @Field(() => Float, { nullable: true })
  amount?: number;

  @Field({ nullable: true })
  currency?: string;

  @Field({ nullable: true })
  publishedAt?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  rawPayload?: Record<string, unknown>;
}

@ObjectType()
export class ProcurementItemPage {
  @Field(() => Int)
  total!: number;

  @Field(() => [ProcurementItem])
  items!: ProcurementItem[];
}

@InputType()
export class IngestNormalizedItemInput {
  @Field(() => ID)
  externalId!: string;

  @Field()
  source!: string;

  @Field()
  title!: string;

  @Field({ nullable: true })
  customer?: string;

  @Field({ nullable: true })
  supplier?: string;

  @Field(() => Float, { nullable: true })
  amount?: number;

  @Field({ nullable: true })
  currency?: string;

  @Field({ nullable: true })
  publishedAt?: string;

  @Field()
  payloadVersion!: string;

  @Field(() => GraphQLJSON, { nullable: true })
  rawPayload?: Record<string, unknown>;
}

@ObjectType()
export class IngestResult {
  @Field()
  accepted!: boolean;

  @Field()
  idempotencyKey!: string;
}

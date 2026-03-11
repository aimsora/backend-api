import { Args, Int, Mutation, Query, Resolver } from "@nestjs/graphql";
import {
  IngestNormalizedItemInput,
  IngestResult,
  ProcurementItemPage
} from "./models";
import { ProcurementService } from "./procurement.service";

@Resolver()
export class ProcurementResolver {
  constructor(private readonly procurementService: ProcurementService) {}

  @Query(() => String)
  health(): string {
    return "ok";
  }

  @Query(() => ProcurementItemPage)
  procurementItems(
    @Args("search", { nullable: true }) search?: string,
    @Args("source", { nullable: true }) source?: string,
    @Args("limit", { type: () => Int, defaultValue: 20 }) limit?: number,
    @Args("offset", { type: () => Int, defaultValue: 0 }) offset?: number
  ): ProcurementItemPage {
    return this.procurementService.find(search, source, limit, offset);
  }

  @Mutation(() => IngestResult)
  ingestNormalizedItem(
    @Args("input", { type: () => IngestNormalizedItemInput }) input: IngestNormalizedItemInput
  ): IngestResult {
    return this.procurementService.ingest(input);
  }
}

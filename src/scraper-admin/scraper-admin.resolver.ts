import { Args, Mutation, Query, Resolver } from "@nestjs/graphql";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import {
  ScraperAdminConfig,
  ScraperAdminOverview,
  UpdateScraperAdminSourceStateInput,
  UpdateScraperAdminConfigInput
} from "./scraper-admin.models";
import { ScraperAdminService } from "./scraper-admin.service";

@Resolver()
export class ScraperAdminResolver {
  constructor(private readonly scraperAdminService: ScraperAdminService) {}

  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @Query(() => ScraperAdminOverview)
  scraperAdminOverview() {
    return this.scraperAdminService.getOverview();
  }

  @Roles(UserRole.ADMIN)
  @Mutation(() => ScraperAdminConfig)
  updateScraperAdminConfig(
    @Args("input") input: UpdateScraperAdminConfigInput
  ) {
    return this.scraperAdminService.updateConfig(input);
  }

  @Roles(UserRole.ADMIN)
  @Mutation(() => ScraperAdminConfig)
  updateScraperAdminSourceState(
    @Args("input") input: UpdateScraperAdminSourceStateInput
  ) {
    return this.scraperAdminService.updateSourceState(input);
  }
}

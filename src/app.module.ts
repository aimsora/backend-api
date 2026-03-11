import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { GraphQLModule } from "@nestjs/graphql";
import { ApolloDriver, ApolloDriverConfig } from "@nestjs/apollo";
import { join } from "node:path";
import GraphQLJSON from "graphql-type-json";
import { HealthController } from "./common/health.controller";
import { ProcurementResolver } from "./procurement/procurement.resolver";
import { ProcurementService } from "./procurement/procurement.service";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      path: process.env.GRAPHQL_PATH ?? "/graphql",
      playground: true,
      autoSchemaFile: join(process.cwd(), "schema.gql"),
      resolvers: { JSON: GraphQLJSON }
    })
  ],
  controllers: [HealthController],
  providers: [ProcurementResolver, ProcurementService]
})
export class AppModule {}

// =============================================================================
// GAP-L02: GRAPHQL MODULE
// Apollo Server integration for Tarodan Marketplace
// =============================================================================

import { Module } from "@nestjs/common";
import { GraphQLModule as NestGraphQLModule } from "@nestjs/graphql";
import { ApolloDriver, ApolloDriverConfig } from "@nestjs/apollo";
import { Request, Response } from "express";
import { GraphQLError, GraphQLFormattedError } from "graphql";

// Resolvers
import { ProductResolver } from "./resolvers/product.resolver";
import { UserResolver } from "./resolvers/user.resolver";
import { OrderResolver } from "./resolvers/order.resolver";
import { TradeResolver } from "./resolvers/trade.resolver";
import { CategoryResolver } from "./resolvers/category.resolver";

// Modules for dependency injection
import { PrismaModule } from "../../prisma";

@Module({
  imports: [
    NestGraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      // Code-first approach - generate schema from TypeScript classes
      autoSchemaFile: true,
      sortSchema: true,
      playground: process.env.NODE_ENV !== "production",
      introspection: process.env.NODE_ENV !== "production",

      // Context for resolvers
      context: ({ req, res }: { req: Request; res: Response }) => ({
        req,
        res,
      }),

      // Format errors for client
      formatError: (error: GraphQLError): GraphQLFormattedError => {
        const graphQLFormattedError: GraphQLFormattedError = {
          message: error.message,
          path: error.path,
          extensions: {
            code: error.extensions?.code || "INTERNAL_SERVER_ERROR",
          },
        };
        return graphQLFormattedError;
      },
    }),
    PrismaModule,
  ],
  providers: [
    ProductResolver,
    UserResolver,
    OrderResolver,
    TradeResolver,
    CategoryResolver,
  ],
})
export class GraphQLAppModule {}

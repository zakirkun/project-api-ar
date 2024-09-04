import express from "express";
import { createSchema, createYoga, createPubSub } from 'graphql-yoga';
import { PrismaClient } from '@prisma/client';
import { useJWT, createInlineSigningKeyProvider, extractFromHeader } from '@graphql-yoga/plugin-jwt';
import cors from 'cors';

const app = express();
const prisma = new PrismaClient();
const port = Bun.env.PORT ?? 3000;
const signingKey = Bun.env.JWT_SECRET as string;

// Load GraphQL schema
// const typeDefs = Bun.file("./schema/schema.graphql").toString();
const pubSub = createPubSub();
const POST_CREATED = Bun.env.ROUTING_PUB as string;

const yoga = createYoga({
  plugins:[
    useJWT({
      // Configure your signing providers: either a local signing-key or a remote JWKS are supported.
      singingKeyProviders: [
        createInlineSigningKeyProvider(signingKey),
      ],
      // Configure where to look for the JWT token: in the headers, or cookies.
      // By default, the plugin will look for the token in the 'authorization' header only.
      tokenLookupLocations: [
        extractFromHeader({ name: 'authorization', prefix: 'Bearer' }),
      ],
      // Configure your token issuers/audience/algorithms verification options.
      // By default, the plugin will only verify the HS256/RS256 algorithms.
      // Please note that this should match the JWT signer issuer/audience/algorithms.
      tokenVerification: {
        audience: 'my-audience',
        algorithms: ['HS256', 'RS256'],
      },
      // Configure context injection after the token is verified.
      // By default, the plugin will inject the token's payload into the context into the `jwt` field.
      // You can pass a string: `"myJwt"` to change the field name.
      extendContext: true,
      // The plugin can reject the request if the token is missing or invalid (doesn't pass JWT `verify` flow).
      // By default, the plugin will reject the request if the token is missing or invalid.
      reject: {
        missingToken: false,
        invalidToken: false,
      }
    })
  ],
  schema: createSchema({
    typeDefs: /* GraphQL */ 
    `type User {
    id: Int!
    name: String!
    email: String!
    createdAt: String!
    updatedAt: String!
    posts: [Post!]!
}

type Post {
  id: Int!
  title: String!
  content: String!
  author: User!
  createdAt: String!
  updatedAt: String!
}

type Query {
    users: [User!]!
    user(id: Int!): User
    posts: [Post!]!
    post(id: Int!): Post
}

type Mutation {
    createUser(name: String!, email: String!): User!
    updateUser(id: Int!, name: String, email: String): User!
    deleteUser(id: Int!): User!
    createPost(title: String!, content: String!, authorId: Int!): Post!
}
    
type Subscription {
    postCreated: Post!
}`,
    resolvers: {
      Query: {
        users: async () => await prisma.user.findMany({ include: { posts: true } }),
        user: async (_parent: any, args: { id: number }) => await prisma.user.findUnique({ where: { id: args.id }, include: { posts: true } }),
        posts: () => prisma.post.findMany({ include: { author: true } }),
        post: (_: any, { id }: { id: number }) =>
          prisma.post.findUnique({ where: { id }, include: { author: true } }),
      },
      Mutation: {
        createPost: async (
          _: any,
          { title, content, authorId }: { title: string; content: string; authorId: number }
        ) => {
          const newPost = await prisma.post.create({
            data: { title, content, authorId },
          });
          pubSub.publish(POST_CREATED, { postCreated: newPost });
          return newPost;
        },
        createUser: async (_parent: any, args: { name: string; email: string }) =>
          await prisma.user.create({
            data: {
              name: args.name,
              email: args.email,
            },
          }),
          updateUser: async (_parent: any, args: { id: number; name?: string; email?: string }) =>
            await prisma.user.update({
              where: { id: args.id },
              data: {
                name: args.name,
                email: args.email,
              },
          }),
          deleteUser: async (_parent: any, args: { id: number }) =>
            await prisma.user.delete({
              where: { id: args.id },
          }),
      },
      Subscription: {
        postCreated: {
          subscribe: () => pubSub.subscribe(POST_CREATED),
          resolve: (data) => {
            console.log(data)
          }
        },
      },
    }
  })
})

app.use(yoga.graphqlEndpoint, yoga);
app.use(cors)

app.get("/", (req, res) => {
    res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Listening on port ${port}...`);
});
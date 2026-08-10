import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: "postgresql://neondb_owner:npg_WK5P6hTUlbiw@ep-round-tooth-ax1xao6a-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
  },
});
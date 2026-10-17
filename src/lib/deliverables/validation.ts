import { z } from "zod";

export const releaseInput = z.object({ released: z.boolean() }).strict();

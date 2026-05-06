import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';

export const createContext = () => ({});
export type Context = ReturnType<typeof createContext>;

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export { TRPCError, z };

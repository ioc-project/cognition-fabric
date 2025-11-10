import {z} from 'zod';

export const DeleteConfirmSchema = z.object({
  text: z.string()
});

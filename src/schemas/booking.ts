import { z } from "zod";

/** Query params for GET /availability */
export const AvailabilityQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
});

export type AvailabilityQuery = z.infer<typeof AvailabilityQuerySchema>;

/** Request body for POST /bookings */
export const CreateBookingSchema = z.object({
  name: z.string().min(1, "name is required"),
  email: z.string().email("email must be valid"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "time must be HH:mm"),
  notes: z.string().optional(),
});

export type CreateBooking = z.infer<typeof CreateBookingSchema>;

/** Query params for approve/reject/cancel token routes */
export const TokenQuerySchema = z.object({
  token: z.string().min(1, "token is required"),
});

export type TokenQuery = z.infer<typeof TokenQuerySchema>;

/** Shape of the approval token payload (pending booking, no event yet) */
export interface ApprovalTokenPayload {
  name: string;
  email: string;
  date: string;
  time: string;
  notes?: string | undefined;
}

/** Shape of the cancel token payload (event already created) */
export interface CancelTokenPayload {
  eventId: string;
  name: string;
  email: string;
  date: string;
  time: string;
}

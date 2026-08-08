/**
 * Auth barrel. Other modules import from "@/lib/auth" rather than reaching
 * into individual files. Concrete flows (signInWithPassword, signOut,
 * invite completion, etc.) are added in the auth step.
 */

export { getServerSession, type AppSession } from "./session";

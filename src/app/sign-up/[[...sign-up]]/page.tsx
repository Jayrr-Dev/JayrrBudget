import { SignUp } from "@clerk/nextjs";

/**
 * Sign-up is invite-only in Clerk Dashboard (disable public signup / use allowlist).
 * This route still exists so invited users can complete account creation.
 */
export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] p-6">
      <SignUp
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        fallbackRedirectUrl="/"
      />
    </div>
  );
}
